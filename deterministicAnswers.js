// lib/deterministicAnswers.js
//
// Cheap, keyword/pattern based intent detection. Handles the common cases
// (price, size, hours, greeting) directly from catalog/vendor data so we don't
// spend an AI call on every message. Falls through to the AI provider for
// anything more open-ended (recommendations, natural conversation, etc).

const PRICE_PATTERNS = [/how much/i, /price/i, /abeg.*how much/i, /cost/i];
const SIZE_PATTERNS = [/size/i, /available in/i, /do (you|u) (have|get)/i];
const HOURS_PATTERNS = [/open/i, /close/i, /business hours/i, /what time/i];
const GREETING_PATTERNS = [/^(hi|hello|hey|good morning|good afternoon|good evening)\b/i];

function detectIntent(message) {
  if (GREETING_PATTERNS.some((p) => p.test(message))) return "greeting";
  if (PRICE_PATTERNS.some((p) => p.test(message))) return "price";
  if (SIZE_PATTERNS.some((p) => p.test(message))) return "size";
  if (HOURS_PATTERNS.some((p) => p.test(message))) return "hours";
  return "general";
}

// Very simple fuzzy match: does the message mention words from a product name?
function findMentionedProduct(message, products) {
  const lower = message.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const product of products) {
    const words = (product.name || "").toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const score = words.filter((w) => lower.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }
  return bestScore > 0 ? best : null;
}

function formatMoney(amount, currencySymbol) {
  return `${currencySymbol || ""}${Number(amount).toLocaleString()}`;
}

// Returns { reply, matchedProduct } or null if no deterministic answer applies.
function tryDeterministicAnswer({ message, intent, products, vendor }) {
  const currencySymbol = vendor?.currencySymbol || "";

  if (intent === "greeting") {
    return {
      reply: `Hi there 💕 Welcome to ${vendor?.businessName || "our shop"}! How can I help you today?`,
      matchedProduct: null,
    };
  }

  if (intent === "hours") {
    const hours = vendor?.businessHours;
    if (hours?.open && hours?.close) {
      return {
        reply: `We're open ${hours.open} – ${hours.close}. If it's outside those hours, you can still browse and leave your order — we'll get back to you 💛`,
        matchedProduct: null,
      };
    }
    return null; // let the AI handle it / fall through to "I don't have that info"
  }

  if (intent === "price" || intent === "size") {
    const product = findMentionedProduct(message, products);
    if (!product) return null; // ambiguous — let AI ask a clarifying question

    if (intent === "price") {
      return {
        reply: `${product.name} is ${formatMoney(product.price, currencySymbol)}. ${
          product.availability === false ? "It's currently out of stock, though 😔" : "Want me to help you order it?"
        }`,
        matchedProduct: product,
      };
    }

    if (intent === "size") {
      if (product.sizes?.length) {
        return {
          reply: `${product.name} comes in: ${product.sizes.join(", ")}.`,
          matchedProduct: product,
        };
      }
      return null;
    }
  }

  return null;
}

module.exports = { detectIntent, tryDeterministicAnswer, findMentionedProduct };
