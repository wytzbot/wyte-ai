// js/customers.js

import { auth, db, onAuthStateChanged, doc, getDoc, collection, query, where, orderBy, getDocs } from "./firebase-client.js";

function formatMoney(amount, symbol) {
  if (!amount) return `${symbol || ""}0`;
  return `${symbol || ""}${Number(amount).toLocaleString()}`;
}

function timeAgo(date) {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const vendorSnap = await getDoc(doc(db, "vendors", user.uid));
  const vendor = vendorSnap.data() || {};
  const listEl = document.getElementById("customerList");
  const emptyState = document.getElementById("emptyState");

  let snap;
  try {
    // Requires a composite index (vendorId ==, lastSeen desc) — Firestore logs a
    // console link to create it automatically the first time this runs for real.
    const q = query(collection(db, "customers"), where("vendorId", "==", user.uid), orderBy("lastSeen", "desc"));
    snap = await getDocs(q);
  } catch (err) {
    console.error("Customers query failed (index may still be building):", err);
    emptyState.style.display = "block";
    return;
  }

  if (snap.empty) {
    emptyState.style.display = "block";
    return;
  }

  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const lastSeen = c.lastSeen?.toDate ? c.lastSeen.toDate() : null;
    const row = document.createElement("div");
    row.className = "customer-row";
    row.innerHTML = `
      <div>
        <div class="customer-phone">${c.whatsappPhone || "Unknown"}</div>
        <div class="customer-meta">${c.orderCount || 0} order${c.orderCount === 1 ? "" : "s"} · last seen ${timeAgo(lastSeen)}</div>
      </div>
      <div class="customer-spend">${formatMoney(c.confirmedSpend, vendor.currencySymbol)}</div>
    `;
    listEl.appendChild(row);
  });
});
