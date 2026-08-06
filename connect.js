// api/whatsapp/connect.js  ->  deploys as POST /api/whatsapp/connect on Vercel
//
// IMPORTANT / HONEST LIMITATION:
// A true one-click "Embedded Signup" flow requires WYTE AI to have an approved,
// business-verified Meta App with the whatsapp_business_management permission —
// that's an application to Meta that only WYTE AI's own operator (not each vendor)
// can complete. Until that's approved, this is a manual connect: the vendor
// completes their own Meta-side setup (Business Portfolio, WhatsApp Business
// Account, System User + permanent access token) and pastes the resulting IDs here.
// This endpoint just validates and stores them — it does not fake a connection.
//
// Body: { phoneNumberId, whatsappBusinessAccountId, catalogId, accessToken }

const { admin, db } = require("../../lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Missing auth token" });

  const { phoneNumberId, whatsappBusinessAccountId, catalogId, accessToken } = req.body || {};

  if (!phoneNumberId || !whatsappBusinessAccountId || !accessToken) {
    return res.status(400).json({ error: "phoneNumberId, whatsappBusinessAccountId and accessToken are required" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    // Sanity check the token actually works before saving it, so the vendor
    // gets an immediate, specific error instead of a silent bad connection.
    const checkRes = await fetch(
      `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v21.0"}/${phoneNumberId}?fields=display_phone_number`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!checkRes.ok) {
      const errBody = await checkRes.json().catch(() => ({}));
      return res.status(400).json({
        error: "COULD_NOT_VERIFY",
        message: errBody?.error?.message || "Couldn't verify these details with Meta. Double-check the phone number ID and access token.",
      });
    }

    await db.collection("vendors").doc(vendorId).set(
      {
        whatsappPhoneNumberId: phoneNumberId,
        whatsappBusinessAccountId,
        whatsappCatalogId: catalogId || null,
        whatsappAccessToken: accessToken, // server-only field, not in the client-editable rules whitelist
        whatsappConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
        whatsappConnected: true,
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, catalogLinked: Boolean(catalogId) });
  } catch (err) {
    console.error("WhatsApp connect error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
