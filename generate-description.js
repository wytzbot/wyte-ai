// api/products/generate-description.js  ->  deploys as POST /api/products/generate-description
//
// Premium-only. Generates a sales-friendly product description from the
// product's existing catalog data (name, price, whatever description already
// exists) and saves it to Firestore. This is the one place the AI is allowed
// to write creative marketing copy rather than just answer questions — it's
// still constrained to the real product name/price, not inventing specs.
//
// Goes through lib/aiProvider.js's shared free-first fallback (Groq -> Gemini
// -> optional paid Anthropic) — this used to call Anthropic directly, which
// silently bypassed the fallback system. Fixed.
//
// Body: { productId }

const { admin, db } = require("../../lib/firebaseAdmin");
const { generateText, hasAnyProviderConfigured } = require("../../lib/aiProvider");
const { isPremiumActive } = require("../../lib/subscription");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: "Missing auth token" });

  const { productId } = req.body || {};
  if (!productId) return res.status(400).json({ error: "productId is required" });

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const vendorId = decoded.uid;

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    const vendor = vendorSnap.data();
    const isPremium = isPremiumActive(vendor);

    if (!isPremium) {
      return res.status(403).json({ error: "PREMIUM_REQUIRED", message: "AI-generated descriptions are a Premium feature." });
    }

    const productRef = db.collection("products").doc(productId);
    const productSnap = await productRef.get();
    const product = productSnap.data();
    if (!product || product.vendorId !== vendorId) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!hasAnyProviderConfigured()) {
      return res.status(503).json({ error: "AI_UNAVAILABLE", message: "No AI provider is configured yet — set GROQ_API_KEY or GEMINI_API_KEY." });
    }

    const prompt = `Write a short, warm, sales-friendly product description (2-3 sentences, no invented specs or claims) for this real product:
Name: ${product.name}
Price: ${product.price ?? "not set"} ${product.currency || vendor.currencyCode || ""}
Existing description (may be empty): ${product.description || "none"}
Category: ${vendor.businessCategory || "not specified"}

Only describe what's given above. Do not invent materials, sizes, or features not mentioned.`;

    let description;
    try {
      const result = await generateText(prompt);
      description = result.text.trim();
    } catch (err) {
      console.error("Description generation failed:", err.message);
      return res.status(502).json({ error: "GENERATION_FAILED" });
    }

    if (!description) return res.status(502).json({ error: "GENERATION_FAILED" });

    await productRef.set(
      { description, descriptionGeneratedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    return res.status(200).json({ ok: true, description });
  } catch (err) {
    console.error("Generate description error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
