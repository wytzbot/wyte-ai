// api/whatsapp/sync.js  ->  deploys as POST /api/whatsapp/sync on Vercel
//
// Pulls products from the vendor's connected Meta catalog and caches them in
// Firestore. Does NOT download/store product images — image_url is kept as a
// reference to Meta's CDN only, per the "no Firebase Storage / no duplicate
// image database" requirement.

const { admin, db } = require("../../lib/firebaseAdmin");
const { fetchCatalogProducts } = require("../../lib/whatsapp");

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

    const vendorSnap = await db.collection("vendors").doc(vendorId).get();
    const vendor = vendorSnap.data();

    if (!vendor?.whatsappCatalogId || !vendor?.whatsappAccessToken) {
      return res.status(400).json({
        error: "NOT_CONNECTED",
        message: "Connect WhatsApp and a catalog before syncing.",
      });
    }

    let metaProducts;
    try {
      metaProducts = await fetchCatalogProducts({
        catalogId: vendor.whatsappCatalogId,
        accessToken: vendor.whatsappAccessToken,
      });
    } catch (err) {
      await db.collection("vendors").doc(vendorId).set(
        { catalogSyncStatus: "error", lastCatalogSyncAttempt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return res.status(502).json({
        error: "SYNC_FAILED",
        message: "Couldn't reach Meta's catalog API. Check that your access token still has catalog permissions.",
      });
    }

    // Track which products we've seen this sync, so we can mark removed ones unavailable
    // rather than guessing — we never delete order/customer history tied to a productId.
    const seenIds = new Set();
    const batch = db.batch();

    for (const p of metaProducts) {
      const productId = p.id;
      seenIds.add(productId);
      const ref = db.collection("products").doc(`${vendorId}_${productId}`);
      batch.set(
        ref,
        {
          vendorId,
          catalogId: vendor.whatsappCatalogId,
          productId,
          name: p.name || "Unnamed product",
          description: p.description || "",
          price: p.price ? parseFloat(String(p.price).replace(/[^0-9.]/g, "")) : null,
          currency: p.currency || vendor.currencyCode || null,
          availability: p.availability === "in stock",
          imageUrl: p.image_url || null,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // Mark previously-synced products that no longer appear in the catalog as unavailable,
    // instead of silently deleting them (keeps order history coherent).
    const existingSnap = await db.collection("products").where("vendorId", "==", vendorId).get();
    existingSnap.docs.forEach((d) => {
      const data = d.data();
      if (!seenIds.has(data.productId)) {
        batch.set(d.ref, { availability: false, removedFromCatalog: true }, { merge: true });
      }
    });

    await batch.commit();

    await db.collection("vendors").doc(vendorId).set(
      {
        catalogSyncStatus: "connected",
        lastCatalogSync: admin.firestore.FieldValue.serverTimestamp(),
        productCount: metaProducts.length,
      },
      { merge: true }
    );

    return res.status(200).json({ ok: true, productsSynced: metaProducts.length });
  } catch (err) {
    console.error("Catalog sync error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
