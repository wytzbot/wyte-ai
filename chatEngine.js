// lib/chatEngine.js
//
// Single source of truth for "what does the AI assistant say back." Both
// api/ai/chat.js (dashboard Test AI) and api/whatsapp/webhook.js (real customers)
// call this so the two never drift into answering differently.
//
// Cost-control ordering (this is the actual point of this file's structure):
//   1. Order capture (free, deterministic) — never touches AI or quota.
//   2. Deterministic answers (free, catalog lookups) — never touches AI or quota.
//   3. Response cache check (free — no provider call on a hit).
//   4. Per-customer hourly rate limit (protects against one spammy customer).
//   5. Vendor daily plan quota (FREE_AI_LIMIT / PREMIUM_AI_LIMIT) — checked
//      and incremented ONLY right before an actual paid AI call happens.
//      Earlier versions of this file incremented the quota before checking
//      deterministic answers, which wrongly charged free/cheap answers
//      against the daily limit — fixed here.
//   6. The AI provider call itself, then cache the result.

const { isPremiumActive } = require("./subscription");
const { db } = require("./firebaseAdmin");
const { detectIntent, tryDeterministicAnswer } = require("./deterministicAnswers");
const { advanceOrderFlow } = require("./orderFlow");
const { getAiReply, hasAnyProviderConfigured } = require("./aiProvider");
const { getCachedReply, setCachedReply } = require("./aiCache");
const { checkAndIncrementHourlyLimit } = require("./rateLimiter");
const config = require("./config");

const HUMAN_HANDOFF_PATTERNS = [/talk to (a )?human/i, /speak to (a )?(human|person|someone)/i, /human (please|pls)/i, /real person/i, /agent please/i];

function wantsHuman(message) {
  return HUMAN_HANDOFF_PATTERNS.some((p) => p.test(message));
}

// customerId defaults to "self" for dashboard Test AI (no real customer identity).
// Returns { reply, intent, matchedProduct, usedAI, cached, usage, humanHandoff,
//           blocked, draft, confirmedOrder }
async function getReplyForVendor({ vendorId, vendor, message, history = [], draft = null, customerId = "self" }) {
  if (wantsHuman(message)) {
    return {
      reply: "Sure. I'll notify the vendor so they can take over.",
      intent: "human_handoff",
      matchedProduct: null,
      usedAI: false,
      cached: false,
      humanHandoff: true,
      draft,
      confirmedOrder: null,
    };
  }

  const productsSnap = await db
    .collection("products")
    .where("vendorId", "==", vendorId)
    .limit(config.MAX_PRODUCTS_IN_CONTEXT)
    .get();
  const products = productsSnap.docs.map((d) => d.data());

  // --- 1. Order capture: free, deterministic ---
  const orderResult = advanceOrderFlow({ message, draft, products, vendor });
  if (orderResult) {
    return {
      reply: orderResult.reply,
      intent: "order",
      matchedProduct: orderResult.draft?.productName || orderResult.confirmedOrder?.productName || null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      draft: orderResult.draft,
      confirmedOrder: orderResult.confirmedOrder,
    };
  }

  // --- 2. Deterministic answers: free ---
  const intent = detectIntent(message);
  const deterministic = tryDeterministicAnswer({ message, intent, products, vendor });
  if (deterministic) {
    return {
      reply: deterministic.reply,
      intent,
      matchedProduct: deterministic.matchedProduct?.name || null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      draft,
      confirmedOrder: null,
    };
  }

  // --- 3. Cache check: free (only for single-shot questions, not mid-conversation) ---
  if (history.length === 0) {
    const cached = await getCachedReply(vendorId, message);
    if (cached) {
      return {
        reply: cached,
        intent,
        matchedProduct: null,
        usedAI: false,
        cached: true,
        humanHandoff: false,
        draft,
        confirmedOrder: null,
      };
    }
  }

  // --- 4. Per-customer hourly limit: protects against one spammy customer ---
  const rateCheck = await checkAndIncrementHourlyLimit({ vendorId, customerId });
  if (!rateCheck.allowed) {
    return {
      reply: "Thanks for the messages! Give me a little while and I'll be right back with you 💛",
      intent: "rate_limited",
      matchedProduct: null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      draft,
      confirmedOrder: null,
    };
  }

  // --- 5. Vendor daily plan quota: only checked/incremented right before a real AI call ---
  const isPremium = isPremiumActive(vendor);
  const limit = isPremium ? config.PREMIUM_AI_LIMIT : config.FREE_AI_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  const usageRef = db.collection("aiUsage").doc(`${vendorId}_${today}`);

  const usageResult = await db.runTransaction(async (t) => {
    const snap = await t.get(usageRef);
    const used = snap.exists ? snap.data().count || 0 : 0;
    if (used >= limit) return { blocked: true, used, limit, isPremium };
    t.set(usageRef, { vendorId, date: today, count: used + 1 }, { merge: true });
    return { blocked: false, used: used + 1, limit, isPremium };
  });

  if (usageResult.blocked) {
    return {
      reply: "Thanks for your patience — we're catching up on messages and will reply again shortly 💛",
      intent: "limit_reached",
      matchedProduct: null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      usage: usageResult,
      blocked: true,
      draft,
      confirmedOrder: null,
    };
  }

  // --- 6. The actual paid AI call ---
  if (!hasAnyProviderConfigured()) {
    return {
      reply: "I don't have that information yet 😊 Let me connect you with the vendor.",
      intent,
      matchedProduct: null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      usage: usageResult,
      draft,
      confirmedOrder: null,
    };
  }

  try {
    // Premium-only: a vendor's custom tone/personality only shapes replies on Premium.
    const personality = isPremium ? vendor.aiPersonality : null;
    const { text: reply, provider } = await getAiReply({ vendor: { ...vendor, aiPersonality: personality }, products, history, message });

    if (history.length === 0) {
      await setCachedReply(vendorId, message, reply); // fire-and-forget would be fine too
    }

    return {
      reply,
      intent,
      matchedProduct: null,
      usedAI: true,
      aiProvider: provider,
      cached: false,
      humanHandoff: false,
      usage: usageResult,
      draft,
      confirmedOrder: null,
    };
  } catch (err) {
    console.error("chatEngine AI error:", err);
    return {
      reply: "I don't have that information yet 😊 Let me connect you with the vendor.",
      intent,
      matchedProduct: null,
      usedAI: false,
      cached: false,
      humanHandoff: false,
      usage: usageResult,
      draft,
      confirmedOrder: null,
    };
  }
}

module.exports = { getReplyForVendor, wantsHuman };
