// api/whatsapp/webhook.js  ->  deploys as GET+POST /api/whatsapp/webhook on Vercel
//
// GET: Meta's one-time (and periodic) verification handshake.
// POST: incoming message delivery. Must respond 200 fast — Meta retries on
//       slow/non-200 responses — so we ack immediately and do the real work after.
//
// Signature verification needs the RAW request bytes, not the parsed JSON —
// Vercel's Node.js runtime auto-parses req.body as a convenience, which is
// exactly what breaks HMAC verification if you use it directly. So this file
// reads the raw stream itself and parses JSON manually. See Vercel's own guide:
// https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function

const crypto = require("crypto");
const { admin, db } = require("../../lib/firebaseAdmin");
const { getReplyForVendor, wantsHuman } = require("../../lib/chatEngine");
const { sendTextMessage } = require("../../lib/whatsapp");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return handleVerification(req, res);
  }
  if (req.method === "POST") {
    return handleIncoming(req, res);
  }
  return res.status(405).send("Method not allowed");
};

function handleVerification(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    // Meta expects the raw challenge string back — not JSON.
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Verification failed");
}

function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!signatureHeader || !appSecret) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const sigBuf = Buffer.from(signatureHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function handleIncoming(req, res) {
  let rawBody;
  let payload;

  try {
    rawBody = await readRawBody(req);
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error("WhatsApp webhook: could not read/parse body", err);
    return res.status(400).send("Bad request");
  }

  if (!verifySignature(rawBody, req.headers["x-hub-signature-256"])) {
    console.error("WhatsApp webhook: signature verification failed");
    return res.status(401).send("Invalid signature");
  }

  res.status(200).send("OK"); // ack immediately, process after

  try {
    const entry = payload?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "text") {
      return; // status updates, non-text messages, etc. — nothing to do yet
    }

    const phoneNumberId = change.metadata?.phone_number_id;
    const from = message.from; // customer's WhatsApp number
    const text = message.text?.body || "";

    if (!phoneNumberId || !from || !text) return;

    const vendorQuery = await db
      .collection("vendors")
      .where("whatsappPhoneNumberId", "==", phoneNumberId)
      .limit(1)
      .get();

    if (vendorQuery.empty) {
      console.error("No vendor found for phoneNumberId:", phoneNumberId);
      return;
    }

    const vendorDoc = vendorQuery.docs[0];
    const vendorId = vendorDoc.id;
    const vendor = vendorDoc.data();

    if (vendor.aiPaused) {
      // Vendor has taken manual control — don't auto-reply.
      return;
    }

    // --- Load/trim recent conversation history + any in-progress order draft ---
    const convoRef = db.collection("conversations").doc(`${vendorId}_${from}`);
    const convoSnap = await convoRef.get();
    const priorHistory = convoSnap.exists ? convoSnap.data().history || [] : [];
    const priorDraft = convoSnap.exists ? convoSnap.data().orderDraft || null : null;

    const result = await getReplyForVendor({
      vendorId,
      vendor,
      message: text,
      history: priorHistory,
      draft: priorDraft,
      customerId: from,
    });

    // --- Send the reply back on WhatsApp ---
    await sendTextMessage({
      phoneNumberId: vendor.whatsappPhoneNumberId,
      accessToken: vendor.whatsappAccessToken,
      to: from,
      text: result.reply,
    });

    // --- Persist a bounded conversation history (last 12 turns) ---
    const newHistory = [
      ...priorHistory,
      { role: "user", content: text },
      { role: "assistant", content: result.reply },
    ].slice(-12);

    await convoRef.set(
      {
        vendorId,
        customerPhone: from,
        history: newHistory,
        orderDraft: result.draft || null,
        lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // --- Daily analytics counters (cost-safe: one bounded doc per vendor per day) ---
    const today = new Date().toISOString().slice(0, 10);
    const analyticsRef = db.collection("analyticsDaily").doc(`${vendorId}_${today}`);
    const lastMessageDate = convoSnap.exists && convoSnap.data().lastMessageAt
      ? convoSnap.data().lastMessageAt.toDate().toISOString().slice(0, 10)
      : null;
    const isNewConversationToday = lastMessageDate !== today;

    await analyticsRef.set(
      {
        vendorId,
        date: today,
        enquiries: admin.firestore.FieldValue.increment(1),
        conversations: admin.firestore.FieldValue.increment(isNewConversationToday ? 1 : 0),
        confirmedOrders: admin.firestore.FieldValue.increment(result.confirmedOrder ? 1 : 0),
      },
      { merge: true }
    );

    // --- Write the confirmed order, if this turn completed one ---
    if (result.confirmedOrder) {
      await db.collection("orders").add({
        vendorId,
        customerId: `${vendorId}_${from}`,
        customerPhone: from,
        ...result.confirmedOrder,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update the customer's order stats
      await db.collection("customers").doc(`${vendorId}_${from}`).set(
        {
          orderCount: admin.firestore.FieldValue.increment(1),
          confirmedSpend: admin.firestore.FieldValue.increment(result.confirmedOrder.total || 0),
          lastProduct: result.confirmedOrder.productName,
        },
        { merge: true }
      );

      await db.collection("notifications").add({
        vendorId,
        type: "order_confirmed",
        message: `New confirmed order: ${result.confirmedOrder.productName} (${result.confirmedOrder.quantity}x)`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // --- Upsert the customer record ---
    const customerRef = db.collection("customers").doc(`${vendorId}_${from}`);
    const customerSnap = await customerRef.get();
    await customerRef.set(
      {
        vendorId,
        whatsappPhone: from,
        firstSeen: customerSnap.exists ? customerSnap.data().firstSeen : admin.firestore.FieldValue.serverTimestamp(),
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // --- Human handoff notification ---
    if (result.humanHandoff || wantsHuman(text)) {
      await db.collection("notifications").add({
        vendorId,
        type: "human_handoff",
        message: `Customer ${from} asked to speak with a human.`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error("WhatsApp webhook processing error:", err);
    // We already sent 200 to Meta — nothing more to do but log for debugging.
  }
}
