// lib/config.js

module.exports = {
  FREE_AI_LIMIT: Number(process.env.FREE_AI_LIMIT || 40),

  // "Unlimited" for Premium is marketed, not literal — a real ceiling still
  // protects against runaway API cost from a single account (bug, bot, or
  // abuse). At 1000 AI-calls/day this is far above what a real small
  // business's customer volume would hit; if it's ever reached, the UI
  // still shows "Unlimited" and only the rare edge case sees a message.
  PREMIUM_AI_LIMIT: Number(process.env.PREMIUM_AI_LIMIT || 1000),

  PREMIUM_NGN_PRICE: Number(process.env.PREMIUM_NGN_PRICE || 10000),
  PREMIUM_USD_PRICE: Number(process.env.PREMIUM_USD_PRICE || 10),

  BUSINESS_TIMEZONE_DEFAULT: process.env.BUSINESS_TIMEZONE_DEFAULT || "UTC",
  AI_PROVIDER: process.env.AI_PROVIDER || "anthropic", // kept for backward compat with old single-provider code paths
  AI_MODEL: process.env.AI_MODEL || "claude-haiku-4-5-20251001",
  AI_MAX_TOKENS: Number(process.env.AI_MAX_TOKENS || 400),

  // Multi-provider fallback, free-first. Order is tried left to right; a
  // provider is skipped entirely if its API key isn't set (no error, just
  // moves to the next). Default has NO paid provider in it — Anthropic only
  // runs if you explicitly add "anthropic" to AI_PROVIDER_ORDER AND set
  // AI_API_KEY. This is deliberate: a fresh deploy costs $0 in AI calls
  // unless you opt into a paid provider yourself.
  AI_PROVIDER_ORDER: (process.env.AI_PROVIDER_ORDER || "groq,gemini").split(",").map((s) => s.trim()).filter(Boolean),
  GROQ_MODEL: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  MAX_PRODUCTS_IN_CONTEXT: Number(process.env.MAX_PRODUCTS_IN_CONTEXT || 25),
  MAX_CONVERSATION_TURNS: Number(process.env.MAX_CONVERSATION_TURNS || 6),

  // Cost controls (new)
  AI_RESPONSE_CACHE_TTL_HOURS: Number(process.env.AI_RESPONSE_CACHE_TTL_HOURS || 6),
  PER_CUSTOMER_HOURLY_AI_LIMIT: Number(process.env.PER_CUSTOMER_HOURLY_AI_LIMIT || 20),
};
