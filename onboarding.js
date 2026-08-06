// js/onboarding.js

import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  setDoc,
  getDoc,
} from "./firebase-client.js";

const steps = [3, 4, 5, 6, 7, 8, 9, 10];
let stepIndex = 0;
let uid = null;
let selectedCategory = null;

const panels = document.querySelectorAll(".step-panel");
const stepLabel = document.getElementById("stepLabel");
const progressFill = document.getElementById("progressFill");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");
const skipLink = document.getElementById("skipLink");
const errorBox = document.getElementById("formError");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }
  uid = user.uid;

  const snap = await getDoc(doc(db, "vendors", uid));
  const vendor = snap.data();
  if (vendor?.onboardingComplete) {
    window.location.href = "/dashboard.html";
    return;
  }
  render();
});

function currentStep() {
  return steps[stepIndex];
}

function render() {
  const step = currentStep();
  panels.forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === step));
  stepLabel.textContent = `Step ${step} of 10`;
  progressFill.style.width = `${(step / 10) * 100}%`;
  backBtn.style.visibility = stepIndex === 0 ? "hidden" : "visible";
  nextBtn.textContent = step === 10 ? "Activate assistant" : "Continue";
  skipLink.style.display = step === 10 ? "none" : "block";
  errorBox.classList.remove("visible");
}

document.getElementById("categoryChips")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#categoryChips .chip").forEach((c) => c.classList.remove("selected"));
  chip.classList.add("selected");
  selectedCategory = chip.dataset.value;
});

async function saveStepData(step) {
  const data = { updatedAt: new Date().toISOString() };

  if (step === 3) {
    if (!selectedCategory) return false; // require a selection, but skip link bypasses this
    data.businessCategory = selectedCategory;
  }
  if (step === 4) {
    data.country = document.getElementById("country").value;
    data.city = document.getElementById("city").value.trim();
  }
  if (step === 5) {
    data.businessHours = {
      open: document.getElementById("openTime").value,
      close: document.getElementById("closeTime").value,
    };
  }
  if (step === 6) {
    data.deliverySettings = {
      fee: Number(document.getElementById("deliveryFee").value || 0),
      note: document.getElementById("deliveryNote").value.trim(),
    };
  }
  if (step === 10) {
    data.onboardingComplete = true;
    data.aiPaused = false;
  }

  await setDoc(doc(db, "vendors", uid), data, { merge: true });
  return true;
}

nextBtn.addEventListener("click", async () => {
  const step = currentStep();
  nextBtn.disabled = true;
  const label = nextBtn.textContent;
  nextBtn.textContent = "Saving…";

  try {
    const ok = await saveStepData(step);
    if (!ok) {
      errorBox.textContent = "Please choose a category, or tap 'Skip this step for now'.";
      errorBox.classList.add("visible");
      nextBtn.disabled = false;
      nextBtn.textContent = label;
      return;
    }

    if (step === 10) {
      window.location.href = "/dashboard.html";
      return;
    }

    stepIndex++;
    render();
  } catch (err) {
    console.error(err);
    errorBox.textContent = "Couldn't save that — please try again.";
    errorBox.classList.add("visible");
  } finally {
    nextBtn.disabled = false;
    nextBtn.textContent = label;
  }
});

backBtn.addEventListener("click", () => {
  if (stepIndex === 0) return;
  stepIndex--;
  render();
});

skipLink.addEventListener("click", async (e) => {
  e.preventDefault();
  if (currentStep() === 10) return;
  stepIndex++;
  render();
});
