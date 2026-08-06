You're continuing an existing project called WYTE AI — an AI sales
assistant for WhatsApp-based vendors (Firebase Auth/Firestore, Vercel
serverless functions, WhatsApp Cloud API, Flutterwave payments, multi-
provider AI: Groq/Gemini free-tier with optional paid Anthropic fallback).
The code is attached alongside this prompt as `/frontend` (static
HTML/CSS/vanilla JS) and `/backend` (Vercel `/api` + `/lib` +
`firestore.rules`).

Read `/README.md` first — it covers current pricing, the free/Premium
split, cost-control design, the free-first AI provider setup, the
subscription-expiry fix (`lib/subscription.js` / `js/subscription.js`), and
critically, the Google Play Store billing-policy section — this project is
meant to be wrapped as an Android APK via median.co, and the current
`billing.html` shows real purchase buttons unconditionally, which is the
risky-for-Play-Store version. Don't assume anything works until you've read
that; don't re-explain the architecture back to me, just start working.

Do these five things, in this order. Real, working code — not pseudocode.
If genuinely blocked by a missing credential or external approval process,
say so plainly and build the closest correct thing instead of faking it.

1. **Google Sign-In as a popup, not a redirect.** `login.html` and
   `register.html`, alongside existing email/password, using
   `signInWithPopup` (not `signInWithRedirect`) — required for median.co's
   webview. Create the same `vendors/{uid}` doc on first Google sign-in,
   route through the same onboarding wizard.

2. **median.co APK wrapper compatibility review, including the Play Store
   billing question from the README.** Confirm no localStorage/
   sessionStorage assumptions break, popup auth actually works in median's
   webview. Then specifically: detect when the app is running inside the
   median wrapper (median exposes a way to detect this — check their docs,
   don't guess) and either hide the purchase buttons on `billing.html` or
   redirect them to an external browser tab pointed at the website version,
   per the "lower-risk path" described in the README. This is a real
   compliance question, not just a UX one — get it right.

3. **Multi-account abuse prevention.** More than one free account per
   device to cycle past the 40/day limit. Design and implement a reasonable
   mitigation (e.g. device/browser fingerprinting signal, capping to ~3
   accounts per signal, flagging before blocking). Flag the privacy and
   false-positive tradeoffs before building — genuine judgment call.

4. **Admin override for email-mismatch payment claims**
   (`api/flutterwave/claim.js` currently just rejects with no resolution
   path). Build a minimal admin view or documented manual procedure.

5. **Pre-expiry reminder email.** A vendor whose Premium is about to lapse
   (e.g. 3 days out) gets nothing telling them to renew — `isPremiumActive()`
   just silently stops treating them as Premium at expiry. Add a scheduled
   check (Vercel Cron or similar) that sends a reminder email via the
   existing Resend setup in `lib/email.js`.

When done, give me an updated zip of both `/frontend` and `/backend`, and a
fresh Free vs. Premium list given anything that changed.
