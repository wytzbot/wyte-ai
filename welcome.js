// api/email/welcome.js  ->  deploys as POST /api/email/welcome on Vercel
//
// Call this from your registration flow right after Firebase Auth account creation
// and the initial vendor Firestore doc are written. Do NOT expose this as a public
// endpoint anyone can spam — require a valid Firebase ID token from the just-created user.
//
// Example client call, right after createUserWithEmailAndPassword succeeds:
//
//   const idToken = await userCredential.user.getIdToken();
//   await fetch("/api/email/welcome", {
//     method: "POST",
//     headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
//   });

const { admin, db } = require("../../lib/firebaseAdmin");
const { sendWelcomeEmail } = require("../../lib/email");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const vendorSnap = await db.collection("vendors").doc(uid).get();
    const vendor = vendorSnap.data();

    if (!vendor?.email) {
      return res.status(404).json({ error: "Vendor profile not found" });
    }

    // Idempotency — don't resend if we already sent one for this account
    if (vendor.welcomeEmailSentAt) {
      return res.status(200).json({ ok: true, alreadySent: true });
    }

    await sendWelcomeEmail({ to: vendor.email, businessName: vendor.businessName });

    await db.collection("vendors").doc(uid).set(
      { welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Welcome email error:", err);
    // Never leak internals to the client
    return res.status(500).json({ error: "Something went wrong" });
  }
};
