// lib/rateLimiter.js
//
// Separate from the vendor's daily plan quota (FREE_AI_LIMIT / PREMIUM_AI_LIMIT).
// This caps how many AI-provider calls ONE customer conversation can trigger
// in an hour, regardless of plan — protects against a spam loop or bot eating
// a vendor's whole daily quota (or a "generous" Premium ceiling) by itself.

const { db, admin } = require("./firebaseAdmin");
const config = require("./config");

async function checkAndIncrementHourlyLimit({ vendorId, customerId }) {
  const hourBucket = new Date().toISOString().slice(0, 13); // e.g. 2026-08-05T14
  const ref = db.collection("rateLimits").doc(`${vendorId}_${customerId}_${hourBucket}`);

  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const used = snap.exists ? snap.data().count || 0 : 0;
    if (used >= config.PER_CUSTOMER_HOURLY_AI_LIMIT) {
      return { allowed: false, used, limit: config.PER_CUSTOMER_HOURLY_AI_LIMIT };
    }
    t.set(ref, { vendorId, customerId, count: used + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { allowed: true, used: used + 1, limit: config.PER_CUSTOMER_HOURLY_AI_LIMIT };
  });
}

module.exports = { checkAndIncrementHourlyLimit };
