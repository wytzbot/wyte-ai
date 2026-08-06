// api/flutterwave/checkout.js  ->  deploys as POST /api/flutterwave/checkout on Vercel
//
// Called from the frontend Upgrade button. Requires a valid Firebase ID token
// so we know exactly which vendor is paying — never trust a vendorId sent from the client.
//
// Body: { currency: "NGN" | "USD" }
//
// Returns: { link: "https://checkout.flutterwave.com/..." }
// Frontend redirects the browser to that link.

const { admin, db } = require("../../lib/firebaseAdmin");

const config = require("../../lib/config");

const PLAN_AMOUNTS = {
  NGN: config.PREMIUM_NGN_PRICE,
  USD: config.PREMIUM_USD_PRICE,
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const currency = (req.body?.currency || "NGN").toUpperCase();
  const amount = PLAN_AMOUNTS[currency];
  if (!amount) {
    return res.status(400).json({ error: "Unsupported currency" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorSnap = await db.collection("vendors").doc(decoded.uid).get();
    const vendor = vendorSnap.data();

    if (!vendor?.email) {
      return res.status(404).json({ error: "Vendor profile not found" });
    }

    // Format the webhook's parseTxRef() expects: wyte_<vendorId>_<plan>_<random>
    const txRef = `wyte_${decoded.uid}_premium_${Date.now()}`;

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(amount),
        currency,
        redirect_url: `${process.env.APP_URL}/billing?status=complete`,
        customer: {
          email: vendor.email,
          name: vendor.businessName || vendor.ownerName || "WYTE AI vendor",
        },
        customizations: {
          title: "WYTE AI Premium",
          description: "Monthly Premium subscription",
        },
      }),
    });

    const flwData = await flwRes.json();

    if (flwData.status !== "success" || !flwData.data?.link) {
      console.error("Flutterwave checkout init failed:", flwData);
      return res.status(502).json({ error: "Could not start payment" });
    }

    // Record the pending attempt so we can reconcile later if needed
    await db.collection("payments").add({
      vendorId: decoded.uid,
      txRef,
      amount,
      currency,
      status: "initiated",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ link: flwData.data.link });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
