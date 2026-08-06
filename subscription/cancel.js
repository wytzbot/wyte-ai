// api/subscription/cancel.js  ->  deploys as POST /api/subscription/cancel on Vercel
//
// Since billing here is manual (no auto-recurring charge to stop — see
// lib/subscription.js), "cancelling" doesn't mean stopping a future charge.
// It means: downgrade to Free now, on request. A vendor who just wants to
// let Premium lapse naturally doesn't need this at all — isPremiumActive()
// already stops treating them as Premium once subscriptionExpiry passes.
// This endpoint is for someone who wants out immediately.

const { admin, db } = require("../../lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Missing auth token" });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    await db.collection("vendors").doc(vendorId).set(
      {
        plan: "free",
        subscriptionStatus: "cancelled",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
