// js/auth.js
// Handles both login.html and register.html — detects which form is present.

import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc,
  setDoc,
  serverTimestamp,
} from "./firebase-client.js";

const errorBox = document.getElementById("formError");

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.add("visible");
}

function clearError() {
  errorBox.classList.remove("visible");
  errorBox.textContent = "";
}

function setLoading(btn, loading, loadingText, defaultText) {
  btn.disabled = loading;
  btn.textContent = loading ? loadingText : defaultText;
}

// Friendly messages for the handful of Firebase Auth errors a new user actually hits.
function friendlyAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/email-already-in-use") return "That email already has an account. Try logging in instead.";
  if (code === "auth/invalid-email") return "That email address doesn't look right.";
  if (code === "auth/weak-password") return "Password should be at least 8 characters.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong. Please try again.";
}

async function notifyWelcomeEmail(user) {
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/email/welcome", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (e) {
    // Non-critical — don't block the user's signup on email delivery
    console.warn("Welcome email trigger failed:", e);
  }
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById("submitBtn");
    const businessName = document.getElementById("businessName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!businessName) return showError("Please enter your business name.");

    setLoading(btn, true, "Creating account…", "Create account");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Minimal vendor profile — the rest is filled in during onboarding.
      await setDoc(doc(db, "vendors", cred.user.uid), {
        businessName,
        email,
        plan: "free",
        subscriptionStatus: "none",
        aiPaused: false,
        createdAt: serverTimestamp(),
      });

      await notifyWelcomeEmail(cred.user);
      window.location.href = "/onboarding.html";
    } catch (err) {
      console.error(err);
      showError(friendlyAuthError(err));
      setLoading(btn, false, "", "Create account");
    }
  });
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById("submitBtn");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    setLoading(btn, true, "Logging in…", "Log in");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard.html";
    } catch (err) {
      console.error(err);
      showError(friendlyAuthError(err));
      setLoading(btn, false, "", "Log in");
    }
  });
}
