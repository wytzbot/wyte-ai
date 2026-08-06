// js/billing.js

import { isPremiumActive } from "./subscription.js";
import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "./firebase-client.js";

const toast = document.getElementById("toast");
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${currency || ""} ${amount}`;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  const vendorSnap = await getDoc(doc(db, "vendors", user.uid));
  const vendor = vendorSnap.data() || {};
  const vendorEmail = vendor.email || "";
  document.getElementById("vendorEmail").textContent = vendorEmail || "your account email";

  // --- Instruction modal before leaving to a static payment link ---
  const modal = document.getElementById("payModal");
  const modalEmail = document.getElementById("modalEmail");
  const modalContinueBtn = document.getElementById("modalContinueBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");

  document.querySelectorAll(".pay-link-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalEmail.textContent = vendorEmail || "(no email on your account — contact support first)";
      modalContinueBtn.href = btn.dataset.url;
      modal.classList.add("visible");
    });
  });
  modalCancelBtn.addEventListener("click", () => modal.classList.remove("visible"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("visible");
  });
  modalContinueBtn.addEventListener("click", () => {
    modal.classList.remove("visible");
    // link already opens in a new tab via target="_blank" — vendor stays on this page to claim afterward
  });

  const isPremium = isPremiumActive(vendor);
  document.getElementById("planLine").textContent = isPremium
    ? `Premium · renews ${vendor.subscriptionExpiry ? new Date(vendor.subscriptionExpiry).toDateString() : ""}`
    : "Free plan";
  document.getElementById("cancelSection").style.display = isPremium ? "block" : "none";

  // Payment history — vendor can read their own payments (see firestore.rules)
  try {
    const q = query(collection(db, "payments"), where("vendorId", "==", user.uid), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const container = document.getElementById("paymentHistory");
    if (!snap.empty) {
      container.innerHTML = "";
      snap.forEach((d) => {
        const p = d.data();
        const when = p.createdAt?.toDate ? p.createdAt.toDate().toDateString() : "";
        const row = document.createElement("div");
        row.className = "history-row";
        row.innerHTML = `<span>${when} ${p.source === "manual_claim" ? "(via link)" : ""}</span><span>${formatMoney(p.amount, p.currency)}</span>`;
        container.appendChild(row);
      });
    }
  } catch (err) {
    console.error("Payment history query failed (composite index may still be building):", err);
  }
});

async function startUpgrade(currency) {
  if (!auth.currentUser) return;
  const btn = currency === "NGN" ? document.getElementById("upgradeNgnBtn") : document.getElementById("upgradeUsdBtn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Redirecting…";
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/flutterwave/checkout", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currency }),
    });
    const data = await res.json();
    if (!res.ok || !data.link) throw new Error(data.error || "checkout failed");
    window.location.href = data.link;
  } catch (err) {
    console.error(err);
    showToast("Couldn't start payment. Please try again.");
    btn.disabled = false;
    btn.textContent = original;
  }
}
document.getElementById("upgradeNgnBtn").addEventListener("click", () => startUpgrade("NGN"));
document.getElementById("upgradeUsdBtn").addEventListener("click", () => startUpgrade("USD"));

document.getElementById("cancelBtn").addEventListener("click", async () => {
  if (!confirm("Switch to Free now? You'll lose Premium features immediately.")) return;
  const btn = document.getElementById("cancelBtn");
  btn.disabled = true;
  btn.textContent = "Switching…";
  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/subscription/cancel", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) throw new Error("Failed");
    showToast("Switched to Free plan.");
    setTimeout(() => window.location.reload(), 1000);
  } catch (err) {
    console.error(err);
    showToast("Couldn't switch plans — try again.");
    btn.disabled = false;
    btn.textContent = "Switch to Free now";
  }
});
  const errorBox = document.getElementById("claimError");
  errorBox.classList.remove("visible");

  const transactionId = document.getElementById("transactionId").value.trim();
  if (!transactionId) {
    errorBox.textContent = "Enter your transaction ID.";
    errorBox.classList.add("visible");
    return;
  }

  const btn = document.getElementById("claimBtn");
  btn.disabled = true;
  btn.textContent = "Checking…";

  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/flutterwave/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Couldn't activate Premium");

    showToast("Premium activated! 🎉");
    setTimeout(() => (window.location.href = "/dashboard.html"), 1200);
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message;
    errorBox.classList.add("visible");
  } finally {
    btn.disabled = false;
    btn.textContent = "Activate Premium";
  }
});
