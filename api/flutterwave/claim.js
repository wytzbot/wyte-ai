// api/flutterwave/claim.js  ->  deploys as POST /api/flutterwave/claim on Vercel
//
// Handles Option B for the two static Flutterwave Payment Links: since a
// static link can't carry a per-vendor tx_ref, we can't auto-attribute the
// payment the way the dynamic checkout + webhook does. Instead, the vendor
// pays via the link, then submits the transaction ID here themselves.
//
// Security model, since "vendor says it's theirs" isn't enough on its own:
// 1. We re-verify the transaction directly with Flutterwave (never trust
//    anything the vendor typed except the transaction ID itself).
// 2. We require the transaction's customer email (whatever the payer typed
//    into Flutterwave's checkout) to match the calling vendor's account
//    email — instructions in the UI tell vendors to use their WYTE AI email
//    when paying via the link. This closes the obvious hole where someone
//    finds/guesses another transaction ID and claims it: they'd also need
//    that transaction to have been paid under their own account's email.
// 3. Same idempotency ledger (webhookEvents/{txId}) as the automatic
//    webhook — a transaction ID can only ever activate Premium once, no
//    matter which path (webhook or manual claim) gets there first.
//
// Body: { transactionId }

const { admin, db } = require("../../lib/firebaseAdmin");
const { sendPaymentSuccessEmail } = require("../../lib/email");
const config = require("../../lib/config");

const EXPECTED_PLAN_AMOUNTS = {
  NGN: config.PREMIUM_NGN_PRICE,
  USD: config.PREMIUM_USD_PRICE,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Missing auth token" });

  const transactionId = String(req.body?.transactionId || "").trim();
  if (!transactionId || !/^\d+$/.test(transactionId)) {
    return res.status(400).json({ error: "INVALID_INPUT", message: "Enter the transaction ID exactly as shown on your payment receipt." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    const vendor = vendorSnap.data();
    if (!vendor?.email) return res.status(404).json({ error: "Vendor not found" });

    // --- Re-verify directly with Flutterwave ---
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    });
    const verifyData = await verifyRes.json();
    const tx = verifyData?.data;

    if (!tx || verifyData.status !== "success" || tx.status !== "successful") {
      return res.status(400).json({
        error: "NOT_FOUND_OR_UNSUCCESSFUL",
        message: "We couldn't find a successful payment with that transaction ID.",
      });
    }

    // --- Amount/currency must match a real Premium price ---
    const expectedAmount = EXPECTED_PLAN_AMOUNTS[tx.currency];
    if (expectedAmount === undefined || Number(tx.amount) < expectedAmount) {
      return res.status(400).json({
        error: "AMOUNT_MISMATCH",
        message: "That payment doesn't match a Premium plan amount.",
      });
    }

    // --- Email on the transaction must match this vendor's account email ---
    const payerEmail = (tx.customer?.email || "").toLowerCase().trim();
    if (payerEmail !== vendor.email.toLowerCase().trim()) {
      return res.status(403).json({
        error: "EMAIL_MISMATCH",
        message: "This payment wasn't made with your account's email address. Use your WYTE AI account email when paying via the link, or contact support.",
      });
    }

    // --- Idempotency: shared ledger with the automatic webhook ---
    const eventRef = db.collection("webhookEvents").doc(String(transactionId));
    const alreadyProcessed = await db.runTransaction(async (t) => {
      const snap = await t.get(eventRef);
      if (snap.exists) return true;
      t.set(eventRef, {
        txId: transactionId,
        vendorId,
        source: "manual_claim",
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return false;
    });

    if (alreadyProcessed) {
      return res.status(409).json({
        error: "ALREADY_CLAIMED",
        message: "This transaction has already been used to activate Premium.",
      });
    }

    // --- Activate Premium ---
    const startDate = new Date();
    const expiryDate = new Date(startDate);
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    await db.collection("vendors").doc(vendorId).set(
      {
        plan: "premium",
        subscriptionStatus: "active",
        subscriptionStart: startDate.toISOString(),
        subscriptionExpiry: expiryDate.toISOString(),
      },
      { merge: true }
    );

    await db.collection("payments").add({
      vendorId,
      txId: transactionId,
      txRef: tx.tx_ref || null,
      amount: tx.amount,
      currency: tx.currency,
      status: "success",
      source: "manual_claim",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await sendPaymentSuccessEmail({
      to: vendor.email,
      businessName: vendor.businessName,
      plan: "Premium",
      amount: tx.amount,
      currencyCode: tx.currency,
      startDate: startDate.toDateString(),
      expiryDate: expiryDate.toDateString(),
      txRef: tx.tx_ref || transactionId,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Claim error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
