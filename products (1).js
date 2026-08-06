// js/products.js

import { isPremiumActive } from "./subscription.js";
import { auth, db, onAuthStateChanged, getDoc, doc, collection, query, where, getDocs } from "./firebase-client.js";

const grid = document.getElementById("productGrid");
const emptyState = document.getElementById("emptyState");
const syncSummary = document.getElementById("syncSummary");

function formatMoney(amount, symbol) {
  if (amount === null || amount === undefined) return "Price not set";
  return `${symbol || ""}${Number(amount).toLocaleString()}`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const vendorSnap = await getDoc(doc(db, "vendors", user.uid));
  const vendor = vendorSnap.data() || {};

  if (vendor.lastCatalogSync) {
    const when = vendor.lastCatalogSync.toDate ? vendor.lastCatalogSync.toDate() : vendor.lastCatalogSync;
    syncSummary.textContent = `Last synced ${new Date(when).toLocaleString()} · ${vendor.productCount ?? 0} products`;
  } else {
    syncSummary.textContent = "Not synced yet.";
  }

  const q = query(collection(db, "products"), where("vendorId", "==", user.uid));
  const snap = await getDocs(q);

  if (snap.empty) {
    emptyState.style.display = "block";
    return;
  }

  const isPremium = isPremiumActive(vendor);

  snap.forEach((docSnap) => {
    const p = docSnap.data();
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      ${p.imageUrl
        ? `<img class="product-image" src="${p.imageUrl}" alt="${p.name}">`
        : `<div class="product-image">No image</div>`}
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-price">${formatMoney(p.price, vendor.currencySymbol)}</div>
        <span class="product-status ${p.availability ? "in-stock" : "out-of-stock"}">
          ${p.availability ? "In stock" : "Unavailable"}
        </span>
        <p class="product-desc" style="font-size:12.5px; margin-top:8px; min-height:32px;">${p.description || "No description yet."}</p>
        ${isPremium
          ? `<button class="btn btn-secondary gen-desc-btn" data-id="${docSnap.id}" style="width:100%; padding:8px; font-size:12.5px; margin-top:6px;">✨ Generate description</button>`
          : `<button class="btn btn-secondary" disabled title="Premium feature" style="width:100%; padding:8px; font-size:12.5px; margin-top:6px; opacity:0.5;">✨ Generate description (Premium)</button>`}
      </div>
    `;
    grid.appendChild(card);
  });

  document.querySelectorAll(".gen-desc-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const productId = btn.dataset.id;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Generating…";
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/products/generate-description", {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Failed");
        btn.closest(".product-body").querySelector(".product-desc").textContent = data.description;
      } catch (err) {
        console.error(err);
        alert(err.message || "Couldn't generate a description.");
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
  });
});
