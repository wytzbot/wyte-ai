// js/settings.js

import { isPremiumActive } from "./subscription.js";
import { auth, db, onAuthStateChanged, doc, getDoc, setDoc } from "./firebase-client.js";

const toast = document.getElementById("toast");
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  const snap = await getDoc(doc(db, "vendors", user.uid));
  const vendor = snap.data();
  if (!vendor) return;

  document.getElementById("connectionStatus").textContent = vendor.whatsappConnected
    ? `Connected · phone number ID ${vendor.whatsappPhoneNumberId}`
    : "Not connected yet.";

  document.getElementById("syncStatus").textContent = vendor.lastCatalogSync
    ? `Last synced ${new Date(vendor.lastCatalogSync.toDate ? vendor.lastCatalogSync.toDate() : vendor.lastCatalogSync).toLocaleString()} · ${vendor.productCount ?? 0} products · ${vendor.catalogSyncStatus || ""}`
    : "Not synced yet.";

  const isPremium = isPremiumActive(vendor);
  const personalityInput = document.getElementById("aiPersonality");
  const saveBtn = document.getElementById("savePersonalityBtn");
  personalityInput.value = vendor.aiPersonality || "";

  if (!isPremium) {
    personalityInput.disabled = true;
    personalityInput.placeholder = "Upgrade to Premium to customize your assistant's tone";
    saveBtn.disabled = true;
    saveBtn.textContent = "Upgrade to Premium to use this";
  }
});

document.getElementById("savePersonalityBtn").addEventListener("click", async () => {
  const btn = document.getElementById("savePersonalityBtn");
  const status = document.getElementById("personalityStatus");
  const value = document.getElementById("aiPersonality").value.trim();
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await setDoc(doc(db, "vendors", auth.currentUser.uid), { aiPersonality: value }, { merge: true });
    status.textContent = "Saved.";
    showToast("AI personality saved.");
  } catch (err) {
    console.error(err);
    status.textContent = "Couldn't save — try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Save personality";
  }
});

document.getElementById("connectBtn").addEventListener("click", async () => {
  const errorBox = document.getElementById("connectError");
  errorBox.classList.remove("visible");

  const phoneNumberId = document.getElementById("phoneNumberId").value.trim();
  const wabaId = document.getElementById("wabaId").value.trim();
  const catalogId = document.getElementById("catalogId").value.trim();
  const accessToken = document.getElementById("accessToken").value.trim();

  if (!phoneNumberId || !wabaId || !accessToken) {
    errorBox.textContent = "Phone Number ID, WABA ID and access token are required.";
    errorBox.classList.add("visible");
    return;
  }

  const btn = document.getElementById("connectBtn");
  btn.disabled = true;
  btn.textContent = "Connecting…";

  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/whatsapp/connect", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId, whatsappBusinessAccountId: wabaId, catalogId, accessToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Connection failed");

    document.getElementById("connectionStatus").textContent = `Connected · phone number ID ${phoneNumberId}`;
    showToast("WhatsApp connected.");
  } catch (err) {
    console.error(err);
    errorBox.textContent = err.message;
    errorBox.classList.add("visible");
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect WhatsApp";
  }
});

document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  btn.disabled = true;
  btn.textContent = "Syncing…";

  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/whatsapp/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || "Sync failed");

    document.getElementById("syncStatus").textContent = `Last synced just now · ${data.productsSynced} products`;
    showToast(`Synced ${data.productsSynced} products.`);
  } catch (err) {
    console.error(err);
    showToast(err.message || "Sync failed.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sync catalog now";
  }
});
