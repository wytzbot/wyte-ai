// js/landing.js
// Drives the hero chat demo — a scripted, looping example conversation.
// This is illustrative UI only; it does not call the real AI.

const script = [
  { from: "customer", text: "Abeg how much is the blue owambe gown?" },
  { from: "ai-typing" },
  { from: "ai", html: 'It\'s <span class="price">₦22,000</span> 💚 We have it in sizes 10 to 16. Want me to check size 12 for you?' },
  { from: "customer", text: "Yes, size 12 available?" },
  { from: "ai-typing" },
  { from: "ai", html: 'Yes, size 12 is available in blue 👗 Want me to start your order?' },
];

const el = document.getElementById("chatDemo");
if (el) {
  let i = 0;
  let typingEl = null;

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function step() {
    if (i >= script.length) {
      // brief pause, then loop
      setTimeout(() => {
        el.innerHTML = "";
        i = 0;
        step();
      }, 1800);
      return;
    }

    const item = script[i];

    if (item.from === "ai-typing") {
      typingEl = document.createElement("div");
      typingEl.className = "typing-dots";
      typingEl.innerHTML = "<span></span><span></span><span></span>";
      el.appendChild(typingEl);
      i++;
      setTimeout(step, reduceMotion() ? 0 : 700);
      return;
    }

    if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (item.from === "customer" ? "bubble-customer" : "bubble-ai");
    if (item.html) bubble.innerHTML = item.html;
    else bubble.textContent = item.text;
    el.appendChild(bubble);

    i++;
    setTimeout(step, reduceMotion() ? 0 : 1400);
  }

  step();
}
