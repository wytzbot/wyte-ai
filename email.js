// lib/email.js
//
// Thin wrapper around Resend for transactional email.
// Requires env var: RESEND_API_KEY
// Sign up at https://resend.com, verify a sending domain, then create an API key.

const RESEND_API_URL = "https://api.resend.com/emails";

// Change this once you've verified a domain in Resend (e.g. no-reply@wyteai.com)
const FROM_ADDRESS = process.env.EMAIL_FROM || "WYTE AI <onboarding@resend.dev>";

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!to) {
    throw new Error("sendEmail called without a recipient");
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    // Never throw raw provider errors at end users — log server-side only.
    console.error("Resend send failed:", res.status, errText);
    throw new Error("EMAIL_SEND_FAILED");
  }

  return res.json();
}

function formatMoney(amount, currencyCode) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(amount);
  } catch {
    return `${currencyCode || ""} ${amount}`;
  }
}

function baseLayout(bodyHtml) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
    <div style="padding: 24px 0; text-align: center;">
      <span style="font-size: 20px; font-weight: 700; color: #16a34a;">WYTE AI</span>
    </div>
    <div style="background: #f9fafb; border-radius: 12px; padding: 24px;">
      ${bodyHtml}
    </div>
    <div style="text-align: center; padding: 20px 0; font-size: 12px; color: #9ca3af;">
      wyte Tech Company (WTC) · WYTE AI is an independent product, not affiliated with WhatsApp or Meta.
    </div>
  </div>`;
}

async function sendWelcomeEmail({ to, businessName }) {
  const html = baseLayout(`
    <h2 style="margin-top:0;">Welcome to WYTE AI 🎉</h2>
    <p>Hi${businessName ? ` ${businessName}` : ""},</p>
    <p>Your account is ready. Next step is connecting your WhatsApp Business account so your AI assistant can start answering customers.</p>
    <a href="${process.env.APP_URL || ""}/onboarding"
       style="display:inline-block; background:#16a34a; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600; margin-top:12px;">
      Continue setup
    </a>
    <p style="margin-top:24px; font-size:13px; color:#6b7280;">
      Questions? Just reply to this email.
    </p>
  `);

  return sendEmail({ to, subject: "Welcome to WYTE AI 🎉", html });
}

async function sendPaymentSuccessEmail({
  to,
  businessName,
  plan,
  amount,
  currencyCode,
  startDate,
  expiryDate,
  txRef,
}) {
  const html = baseLayout(`
    <h2 style="margin-top:0;">You're Premium 🎉</h2>
    <p>Hi${businessName ? ` ${businessName}` : ""},</p>
    <p>Your WYTE AI assistant just got smarter. Here's your receipt:</p>
    <table style="width:100%; font-size:14px; margin-top:12px;">
      <tr><td style="color:#6b7280; padding:4px 0;">Plan</td><td style="text-align:right;">${plan}</td></tr>
      <tr><td style="color:#6b7280; padding:4px 0;">Amount</td><td style="text-align:right;">${formatMoney(amount, currencyCode)}</td></tr>
      <tr><td style="color:#6b7280; padding:4px 0;">Start date</td><td style="text-align:right;">${startDate}</td></tr>
      <tr><td style="color:#6b7280; padding:4px 0;">Renews / expires</td><td style="text-align:right;">${expiryDate}</td></tr>
      <tr><td style="color:#6b7280; padding:4px 0;">Reference</td><td style="text-align:right;">${txRef}</td></tr>
    </table>
    <a href="${process.env.APP_URL || ""}/dashboard"
       style="display:inline-block; background:#16a34a; color:#fff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600; margin-top:16px;">
      Open dashboard
    </a>
  `);

  return sendEmail({
    to,
    subject: "🎉 You're now on WYTE AI Premium",
    html,
  });
}

module.exports = { sendEmail, sendWelcomeEmail, sendPaymentSuccessEmail };
