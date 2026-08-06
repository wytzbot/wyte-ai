// js/dashboard.js

import { isPremiumActive } from "./subscription.js";
import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  setDoc,
} from "./firebase-client.js";

const toast = document.getElementById("toast");
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2400);
}

let currentUid = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  currentUid = user.uid;

  const snap = await getDoc(doc(db, "vendors", user.uid));
  const vendor = snap.data();
  if (!vendor) return;

  document.getElementById("greeting").textContent = `Welcome back, ${vendor.businessName || "there"}`;

  const isPremium = isPremiumActive(vendor);
  document.getElementById("planLine").textContent = isPremium
    ? `Premium · renews ${vendor.subscriptionExpiry ? new Date(vendor.subscriptionExpiry).toDateString() : ""}`
    : "Free plan";

  document.getElementById("upgradeCard").style.display = isPremium ? "none" : "block";

  renderAiStatus(vendor.aiPaused === true);
  loadStats(user);
});

async function loadStats(user) {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/analytics/summary", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) throw new Error("stats request failed");
    const data = await res.json();

    const cards = document.querySelectorAll(".stat-value");
    cards[0].textContent = data.today.conversations;
    cards[1].textContent = data.today.enquiries;
    cards[2].textContent = data.today.confirmedOrders;
    cards[3].textContent = data.isPremium ? `${data.aiUsage.used} · Unlimited` : `${data.aiUsage.used} / ${data.aiUsage.limit}`;
    cards.forEach((c) => c.classList.remove("skeleton"));
  } catch (err) {
    console.error("Couldn't load stats:", err);
    document.querySelectorAll(".stat-value").forEach((c) => {
      c.textContent = "—";
      c.classList.remove("skeleton");
    });
  }
}

function renderAiStatus(paused) {
  const pill = document.getElementById("aiStatusPill");
  const text = document.getElementById("aiStatusText");
  pill.classList.toggle("paused", paused);
  text.textContent = paused ? "AI paused" : "AI active";
  pill.dataset.paused = String(paused);
}

document.getElementById("aiStatusPill").addEventListener("click", async () => {
  if (!currentUid) return;
  const pill = document.getElementById("aiStatusPill");
  const currentlyPaused = pill.dataset.paused === "true";
  const nextPaused = !currentlyPaused;

  // Optimistic UI update
  renderAiStatus(nextPaused);
  try {
    await setDoc(doc(db, "vendors", currentUid), { aiPaused: nextPaused }, { merge: true });
    showToast(nextPaused ? "AI assistant paused." : "AI assistant resumed.");
  } catch (err) {
    console.error(err);
    renderAiStatus(currentlyPaused); // revert
    showToast("Couldn't update AI status. Try again.");
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "/login.html";
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
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
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
