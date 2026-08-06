// js/analytics.js

import { auth, onAuthStateChanged } from "./firebase-client.js";

function renderList(container, items, emptyText) {
  if (!items || items.length === 0) {
    container.innerHTML = `<p style="font-size:13.5px;">${emptyText}</p>`;
    return;
  }
  container.innerHTML = items
    .map((i) => `<div class="list-row"><span>${i.name}</span><span class="list-count">${i.count}</span></div>`)
    .join("");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "/login.html";
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/analytics/summary", { headers: { Authorization: `Bearer ${idToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load analytics");

    document.getElementById("statConversations").textContent = data.today.conversations;
    document.getElementById("statEnquiries").textContent = data.today.enquiries;
    document.getElementById("statOrders").textContent = data.today.confirmedOrders;

    renderList(document.getElementById("popularProducts"), data.popularProducts, "No order data yet.");

    const premiumSection = document.getElementById("premiumSection");
    if (data.isPremium) {
      premiumSection.innerHTML = `
        <div class="card" style="margin-top:20px;">
          <h3>Conversion rate (today)</h3>
          <p style="font-size:28px; font-family: var(--font-mono); color: var(--text); margin-bottom:0;">
            ${data.conversionRate !== null ? data.conversionRate + "%" : "—"}
          </p>
          <p style="font-size:13px; margin-top:6px;">Confirmed orders ÷ conversations today.</p>
        </div>
        <div class="card" style="margin-top:20px;">
          <h3>Popular sizes</h3>
          <div id="popularSizes"></div>
        </div>
        <div class="card" style="margin-top:20px;">
          <h3>Popular colours</h3>
          <div id="popularColours"></div>
        </div>
      `;
      renderList(document.getElementById("popularSizes"), data.popularSizes, "No size data yet.");
      renderList(document.getElementById("popularColours"), data.popularColours, "No colour data yet.");
    } else {
      premiumSection.innerHTML = `
        <div class="premium-lock">
          <h3 style="margin-bottom:6px;">Unlock deeper insights</h3>
          <p style="font-size:14px;">Conversion rate, popular sizes and colours, and sales trends are part of Premium.</p>
          <a href="/dashboard.html" class="btn btn-primary">Upgrade to Premium</a>
        </div>
      `;
    }
  } catch (err) {
    console.error(err);
  }
});
