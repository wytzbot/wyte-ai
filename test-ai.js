// js/test-ai.js

import { auth, onAuthStateChanged } from "./firebase-client.js";

const chatEl = document.getElementById("testChat");
const form = document.getElementById("composerForm");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const traceBox = document.getElementById("traceBox");
const usageLine = document.getElementById("usageLine");
const toast = document.getElementById("toast");

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

let history = [];

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "/login.html";
});

function addBubble(text, from) {
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (from === "customer" ? "bubble-customer" : "bubble-ai");
  bubble.textContent = text;
  chatEl.appendChild(bubble);
  chatEl.scrollTop = chatEl.scrollHeight;
  return bubble;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message || !auth.currentUser) return;

  addBubble(message, "customer");
  input.value = "";
  sendBtn.disabled = true;

  const typing = document.createElement("div");
  typing.className = "typing-dots";
  typing.innerHTML = "<span></span><span></span><span></span>";
  chatEl.appendChild(typing);
  chatEl.scrollTop = chatEl.scrollHeight;

  try {
    const idToken = await auth.currentUser.getIdToken();
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, history }),
    });
    const data = await res.json();
    typing.remove();

    if (res.status === 429) {
      addBubble("You've reached today's AI usage limit for your plan.", "ai");
      showToast("Daily AI limit reached");
      return;
    }
    if (!res.ok) throw new Error(data.error || "request failed");

    addBubble(data.reply, "ai");
    history.push({ role: "user", content: message }, { role: "assistant", content: data.reply });

    document.getElementById("traceIntent").textContent = data.intent || "—";
    document.getElementById("traceProduct").textContent = data.matchedProduct || "none";
    document.getElementById("traceSource").textContent = data.usedAI
      ? `AI provider (${data.aiProvider || "unknown"})`
      : data.cached
      ? "cached answer"
      : "deterministic rule";
    traceBox.classList.add("visible");

    if (data.usage) {
      usageLine.textContent = data.usage.isPremium
        ? `AI usage today: ${data.usage.used} · Unlimited`
        : `AI usage today: ${data.usage.used} / ${data.usage.limit}`;
    }
  } catch (err) {
    console.error(err);
    typing.remove();
    addBubble("Sorry, something went wrong. Please try again.", "ai");
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});
