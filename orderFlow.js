// lib/orderFlow.js
//
// A deterministic (non-AI) multi-turn flow for collecting an order once a
// customer expresses intent to buy. Runs BEFORE the AI usage-limit check and
// BEFORE the general deterministic/AI answer path — ordering never costs an
// AI call or counts against the daily usage limit.
//
// HONEST LIMITATION: "size" and "colour" are only asked about if the product
// draft is explicitly flagged needsSize/needsColour by the caller, based on
// data actually present on the product. The standard WhatsApp/Meta catalog
// fields this app syncs (see lib/whatsapp.js) don't expose apparel variants
// as simple arrays — Meta typically models size/colour as separate catalog
// entries or variant groups, not a field on one product. Until catalog sync
// is extended to pull variant data, most real synced products will skip
// straight from "how many" to name/address, rather than asking a question
// that can't be validated against real data.

const { findMentionedProduct } = require("./deterministicAnswers");

const ORDER_INTENT_PATTERNS = [
  /\border\b/i,
  /\bbuy\b/i,
  /\bpurchase\b/i,
  /i('| )?ll take/i,
  /i want (this|it|to order)/i,
  /checkout/i,
];

const CONFIRM_PATTERNS = [/^\s*(yes|yep|yeah|yup|confirm|correct|ok(ay)?)\b/i];
const CANCEL_PATTERNS = [/cancel/i, /never\s*mind/i, /not now/i];

function detectOrderIntent(message) {
  return ORDER_INTENT_PATTERNS.some((p) => p.test(message));
}

function parseQuantity(message) {
  const match = message.match(/\d+/);
  if (match) return Math.max(1, parseInt(match[0], 10));
  if (/\btwo\b/i.test(message)) return 2;
  if (/\bthree\b/i.test(message)) return 3;
  return 1;
}

function formatMoney(amount, symbol) {
  if (amount === null || amount === undefined) return "price not set";
  return `${symbol || ""}${Number(amount).toLocaleString()}`;
}

function buildSummary(draft, vendor) {
  const deliveryFee = vendor?.deliverySettings?.fee || 0;
  const productAmount = (draft.price || 0) * draft.quantity;
  const total = productAmount + deliveryFee;

  return [
    `Here's your order:`,
    `${draft.productName}${draft.size ? ` (size ${draft.size})` : ""}${draft.colour ? `, ${draft.colour}` : ""}`,
    `Quantity: ${draft.quantity}`,
    `Product: ${formatMoney(productAmount, vendor?.currencySymbol)}`,
    `Delivery: ${formatMoney(deliveryFee, vendor?.currencySymbol)}`,
    `Total: ${formatMoney(total, vendor?.currencySymbol)}`,
    ``,
    `Reply YES to confirm.`,
  ].join("\n");
}

function startDraftFromProduct(product) {
  return {
    productId: product.productId,
    productName: product.name,
    price: product.price,
    needsSize: Array.isArray(product.sizes) && product.sizes.length > 0,
    needsColour: Array.isArray(product.colours) && product.colours.length > 0,
    quantity: null,
    size: null,
    colour: null,
    customerName: null,
    address: null,
    stage: "quantity",
  };
}

function advanceToNextStage(draft, vendor) {
  if (draft.quantity === null || draft.quantity === undefined) {
    draft.stage = "quantity";
    return { reply: `Great choice — ${draft.productName}! How many would you like?`, draft, confirmedOrder: null };
  }
  if (draft.needsSize && !draft.size) {
    draft.stage = "size";
    return { reply: `What size would you like?`, draft, confirmedOrder: null };
  }
  if (draft.needsColour && !draft.colour) {
    draft.stage = "colour";
    return { reply: `What colour would you like?`, draft, confirmedOrder: null };
  }
  if (!draft.customerName) {
    draft.stage = "name";
    return { reply: `Can I get your name for the order?`, draft, confirmedOrder: null };
  }
  if (!draft.address) {
    draft.stage = "address";
    return { reply: `And what's the delivery address?`, draft, confirmedOrder: null };
  }
  draft.stage = "confirm";
  return { reply: buildSummary(draft, vendor), draft, confirmedOrder: null };
}

// Returns null if this message isn't part of an order flow (caller should fall
// through to normal deterministic/AI handling). Otherwise returns:
// { reply, draft: updatedDraftOrNull, confirmedOrder: orderDataOrNull }
function advanceOrderFlow({ message, draft, products, vendor }) {
  // --- Already mid-flow: continue it regardless of new intent words ---
  if (draft && draft.stage) {
    if (draft.stage === "awaiting_product") {
      const product = findMentionedProduct(message, products);
      if (!product) {
        return { reply: "Sorry, I couldn't find that — could you tell me the product name again?", draft, confirmedOrder: null };
      }
      if (product.availability === false) {
        return { reply: `${product.name} is currently out of stock, sorry! Anything else I can help with?`, draft: null, confirmedOrder: null };
      }
      return advanceToNextStage(startDraftFromProduct(product), vendor);
    }

    if (draft.stage === "confirm") {
      if (CONFIRM_PATTERNS.some((p) => p.test(message))) {
        const productAmount = (draft.price || 0) * draft.quantity;
        const deliveryFee = vendor?.deliverySettings?.fee || 0;
        return {
          reply: `Perfect! Your order is confirmed 🎉 The vendor will follow up with delivery details.`,
          draft: null,
          confirmedOrder: {
            productId: draft.productId,
            productName: draft.productName,
            quantity: draft.quantity,
            size: draft.size || null,
            colour: draft.colour || null,
            customerName: draft.customerName,
            address: draft.address,
            productAmount,
            deliveryFee,
            total: productAmount + deliveryFee,
            orderStatus: "CONFIRMED",
          },
        };
      }
      if (CANCEL_PATTERNS.some((p) => p.test(message))) {
        return { reply: "No problem, I've cancelled that order. Let me know if you'd like to start again.", draft: null, confirmedOrder: null };
      }
      return { reply: `Just to confirm — reply YES to place the order, or let me know if something needs to change.`, draft, confirmedOrder: null };
    }

    if (draft.stage === "quantity") {
      draft.quantity = parseQuantity(message);
      return advanceToNextStage(draft, vendor);
    }
    if (draft.stage === "size") {
      draft.size = message.trim();
      return advanceToNextStage(draft, vendor);
    }
    if (draft.stage === "colour") {
      draft.colour = message.trim();
      return advanceToNextStage(draft, vendor);
    }
    if (draft.stage === "name") {
      draft.customerName = message.trim();
      return advanceToNextStage(draft, vendor);
    }
    if (draft.stage === "address") {
      draft.address = message.trim();
      return advanceToNextStage(draft, vendor);
    }
  }

  // --- No draft yet: only start one on clear order intent ---
  if (!detectOrderIntent(message)) return null;

  const product = findMentionedProduct(message, products);
  if (!product) {
    return { reply: "I'd love to help you order 💕 Which product would you like?", draft: { stage: "awaiting_product" }, confirmedOrder: null };
  }
  if (product.availability === false) {
    return { reply: `${product.name} is currently out of stock, sorry! Want me to suggest something similar?`, draft: null, confirmedOrder: null };
  }

  return advanceToNextStage(startDraftFromProduct(product), vendor);
}

module.exports = { detectOrderIntent, advanceOrderFlow };
