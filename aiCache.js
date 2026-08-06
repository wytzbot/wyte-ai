// lib/aiCache.js
//
// Caches AI provider responses per (vendor, normalized question) so repeated
// or near-identical customer questions don't trigger a new paid API call.
//
// HONEST LIMITATION: cache key ignores conversation history (multi-turn
// context), so it's only applied to single-shot-style questions, not
// mid-conversation replies (see chatEngine.js — cache is skipped whenever
// there's real prior history). It's also catalog-blind beyond the TTL: if a
// vendor changes a price and a cached answer is still within its TTL window,
// a customer could briefly get the old price. Default TTL is short (6h) to
// bound that risk — lower it via AI_RESPONSE_CACHE_TTL_HOURS if needed.

const crypto = require("crypto");
const { db, admin } = require("./firebaseAdmin");
const config = require("./config");

function normalizeMessage(message) {
  return message.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}

function cacheKey(vendorId, message) {
  const hash = crypto.createHash("sha256").update(normalizeMessage(message)).digest("hex").slice(0, 24);
  return `${vendorId}_${hash}`;
}

async function getCachedReply(vendorId, message) {
  const ref = db.collection("aiResponseCache").doc(cacheKey(vendorId, message));
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data();
  const ageHours = (Date.now() - (data.createdAt?.toMillis?.() || 0)) / (1000 * 60 * 60);
  if (ageHours > config.AI_RESPONSE_CACHE_TTL_HOURS) return null;

  return data.reply;
}

async function setCachedReply(vendorId, message, reply) {
  const ref = db.collection("aiResponseCache").doc(cacheKey(vendorId, message));
  await ref.set({
    vendorId,
    reply,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = { getCachedReply, setCachedReply };
