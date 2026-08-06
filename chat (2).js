// api/ai/chat.js  ->  deploys as POST /api/ai/chat on Vercel
//
// Used by the Test AI dashboard page. Requires a valid Firebase ID token.
// Body: { message: string, history?: [{role, content}] }
//
// Order drafts are persisted under a synthetic "test" customer
// (conversations/{vendorId}_test) so a vendor testing the order flow gets the
// same multi-turn behavior real customers do. Orders confirmed here ARE
// written to the real orders collection, tagged customerPhone: "test-mode",
// so they're easy to tell apart (and delete) from real customer orders.

const { admin, db } = require("../../lib/firebaseAdmin");
const { getReplyForVendor } = require("../../lib/chatEngine");
const config = require("../../lib/config");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const message = (req.body?.message || "").toString().trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-config.MAX_CONVERSATION_TURNS) : [];

  if (!message) return res.status(400).json({ error: "Message is required" });
  if (message.length > 1000) return res.status(400).json({ error: "Message is too long" });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    const vendor = vendorSnap.data();
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const convoRef = db.collection("conversations").doc(`${vendorId}_test`);
    const convoSnap = await convoRef.get();
    const priorDraft = convoSnap.exists ? convoSnap.data().orderDraft || null : null;

    const result = await getReplyForVendor({ vendorId, vendor, message, history, draft: priorDraft, customerId: "test" });

    if (result.blocked) {
      return res.status(429).json({ error: "AI_LIMIT_REACHED", message: result.reply, usage: result.usage });
    }

    await convoRef.set(
      { vendorId, customerPhone: "test-mode", orderDraft: result.draft || null, lastMessageAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    if (result.confirmedOrder) {
      await db.collection("orders").add({
        vendorId,
        customerId: `${vendorId}_test`,
        customerPhone: "test-mode",
        ...result.confirmedOrder,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("AI chat error:", err);
    return res.status(200).json({
      reply: "Sorry, something went wrong on my end. Let me connect you with the vendor.",
      intent: "error",
      matchedProduct: null,
      usedAI: false,
    });
  }
};
