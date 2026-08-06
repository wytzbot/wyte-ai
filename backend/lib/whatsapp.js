// lib/whatsapp.js
//
// Thin wrapper around the WhatsApp Cloud API. Uses the Graph API version pinned
// in WHATSAPP_API_VERSION — check developers.facebook.com/docs/graph-api/changelog
// periodically, since Meta deprecates old versions on a rolling schedule.

const GRAPH_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

async function sendTextMessage({ phoneNumberId, accessToken, to, text }) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("WhatsApp send failed:", res.status, errText);
    throw new Error("WHATSAPP_SEND_FAILED");
  }

  return res.json();
}

// Fetches products from a WhatsApp/Meta commerce catalog.
// Requires the connected token to have catalog_management / commerce permissions
// and the catalog to actually be linked to this WhatsApp Business Account in Meta.
async function fetchCatalogProducts({ catalogId, accessToken }) {
  const fields = "id,name,description,price,currency,availability,retailer_id,image_url";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${catalogId}/products?fields=${fields}&limit=200`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Catalog fetch failed:", res.status, errText);
    throw new Error("CATALOG_FETCH_FAILED");
  }

  const data = await res.json();
  return data.data || [];
}

module.exports = { sendTextMessage, fetchCatalogProducts, GRAPH_VERSION };
