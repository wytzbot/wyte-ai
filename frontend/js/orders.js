// js/orders.js
//
// NOTE: this page will legitimately show "No orders yet" until the AI order-capture
// flow (collecting size/colour/quantity/address across a conversation, then writing
// to the orders collection on explicit customer confirmation) is built into the
// WhatsApp webhook. That's not implemented yet — this page just displays whatever
// exists in the `orders` collection.

import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "./firebase-client.js";

const STATUSES = ["NEW", "AWAITING_CONFIRMATION", "CONFIRMED", "PAYMENT_PENDING", "PAID", "PROCESSING", "READY", "DELIVERED", "CANCELLED"];

const listEl = document.getElementById("orderList");
const emptyState = document.getElementById("emptyState");
const toast = document.getElementById("toast");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2400);
}

function formatMoney(amount, symbol) {
  if (amount === null || amount === undefined) return "—";
  return `${symbol || ""}${Number(amount).toLocaleString()}`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  let snap;
  try {
    // Requires a composite index (vendorId ==, createdAt desc). Firestore will
    // log a console link to auto-create it the first time this runs against
    // real data — click it once, then this query works going forward.
    const q = query(collection(db, "orders"), where("vendorId", "==", user.uid), orderBy("createdAt", "desc"));
    snap = await getDocs(q);
  } catch (err) {
    console.error("Orders query failed (composite index may still be building):", err);
    emptyState.style.display = "block";
    return;
  }

  if (snap.empty) {
    emptyState.style.display = "block";
    return;
  }

  snap.forEach((docSnap) => {
    const order = docSnap.data();
    const card = document.createElement("div");
    card.className = "order-card";
    card.innerHTML = `
      <div class="order-top">
        <div>
          <div class="order-product">${order.productName || "Unknown product"}</div>
          <div class="order-meta">
            ${order.customerName || order.customerPhone || "Customer"}
            ${order.size ? ` · Size ${order.size}` : ""}
            ${order.colour ? ` · ${order.colour}` : ""}
            · Qty ${order.quantity || 1}
          </div>
        </div>
        <div class="order-total">${formatMoney(order.total, "")}</div>
      </div>
      <select class="order-status-select" data-id="${docSnap.id}">
        ${STATUSES.map((s) => `<option value="${s}" ${order.orderStatus === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll(".order-status-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      const orderId = e.target.dataset.id;
      const newStatus = e.target.value;
      try {
        // Firestore rules only allow updating orderStatus + updatedAt from the client —
        // anything else on an order is server-only.
        await setDoc(doc(db, "orders", orderId), { orderStatus: newStatus, updatedAt: new Date().toISOString() }, { merge: true });
        showToast("Order updated.");
      } catch (err) {
        console.error(err);
        showToast("Couldn't update order status.");
      }
    });
  });
});
