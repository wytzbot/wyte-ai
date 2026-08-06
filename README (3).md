# WYTE AI — status: functional prototype, not production-complete

"Built and working" below runs end to end against real Firebase/Flutterwave/
Meta/Groq/Gemini/Anthropic accounts once you supply real credentials — none
of it is mocked. See `HANDOFF_PROMPT.md` if continuing this in a new AI
session.

## Structure

- `/frontend` — static site (HTML/CSS/vanilla JS + Firebase client SDK).
- `/backend` — Vercel serverless functions (`/api`) + shared server code
  (`/lib`) + `firestore.rules`. `cd backend && npm install` before deploying.

## Subscription lifecycle (fixed this round)

Billing is manual, not auto-recurring — a vendor pays once, gets 30 days.
Previously, nothing ever re-checked `subscriptionExpiry`: every Premium gate
just checked `plan === "premium" && subscriptionStatus === "active"`, so a
vendor who paid once and never renewed stayed Premium forever, on both
backend (`lib/chatEngine.js`, `api/analytics/summary.js`,
`api/products/generate-description.js`) and frontend (`dashboard.js`,
`billing.js`, `settings.js`, `products.js`). Fixed with one shared check in
both `backend/lib/subscription.js` and `frontend/js/subscription.js`
(`isPremiumActive(vendor)`), which also requires `subscriptionExpiry` to be
in the future. All six call sites now use it.

There's also a new **Cancel** action (`api/subscription/cancel.js`,
button on `billing.html`) for a vendor who wants to switch back to Free
immediately rather than wait for natural expiry — since there's no
recurring charge to actually "cancel," this is a downgrade action, not a
stop-billing action.

**Still missing**: nothing proactively notifies a vendor their Premium is
about to lapse, and there's no scheduled job — expiry is only enforced
reactively, at the moment something checks `isPremiumActive()`. Fine for a
prototype; a real reminder email before expiry would be a good next step.

## Google Play Store — Flutterwave billing (read before submitting)

Google Play's Payments policy explicitly lists **"Cloud software and
services (such as data storage services, business productivity software,
or financial management software)"** as requiring Google Play's own
billing system by default. WYTE AI Premium — unlocking app functionality
(unlimited AI, analytics, custom personality) — fits that category
squarely. That's the baseline rule, and it applies regardless of Flutterwave
being a legitimate payment processor elsewhere.

What's changed in 2026 (post Epic v. Google): Google now allows alternative
billing / external payment links under an opt-in **Alternative Billing
Program** / **External Content Links Program**, with real requirements
(enrollment, disclosure screens, and a service fee — roughly 9–20%
depending on path, not free). This is rolling out **region by region**: US,
UK, and EEA first, Australia/Japan/Korea later, "the rest of the world
through 2027." I could not confirm Nigeria is in the current rollout — this
is moving fast, so check Play Console's current policy page directly before
relying on it.

**The lower-risk path for a bootstrapped app right now**: don't surface any
purchase flow inside the Android app at all. Sell Premium only through your
website in an ordinary browser (not inside the median.co-wrapped webview);
the app itself just lets an already-subscribed vendor log in and use what
they've paid for — the same pattern Netflix/Spotify use, which doesn't
trigger the Play Billing requirement because no purchase happens *within*
the distributed app. Concretely: detect when the app is running inside the
median wrapper and either hide the Upgrade/Billing buttons or point them to
"manage your subscription at wyteai.com" opened in an external browser
tab, not the in-app webview. **This isn't built yet** — the current
`billing.html` shows real purchase buttons unconditionally, which would be
the risky version if shipped inside the Play Store APK as-is.

I'm not a lawyer and Play policy is actively in flux in 2026 — treat this
as a starting point for your own reading of Play Console's policy pages,
not a final answer.

## AI provider — free-first by default, $0 out of the box

`lib/aiProvider.js` tries providers in `AI_PROVIDER_ORDER` order (default
`groq,gemini`), skipping unconfigured ones, falling to the next on error.
Anthropic is NOT in the default order — paid, opt-in only. Test AI shows
which provider actually answered (`AI provider (groq)`).

- **Groq** (free, no card): console.groq.com → `GROQ_API_KEY`. Model:
  `llama-3.1-8b-instant`.
- **Gemini** (free, no card): aistudio.google.com → `GEMINI_API_KEY`.
  Model: `gemini-2.5-flash`.
- **Anthropic** (paid, opt-in): console.anthropic.com → `AI_API_KEY`.

## Pricing (current)

Premium is **₦10,000/month** or **$10/month**. Two payment paths:

1. **In-app checkout (automatic)** — `api/flutterwave/checkout.js` +
   verified webhook.
2. **Static Flutterwave Payment Links** — manual claim flow
   (`api/flutterwave/claim.js` + `billing.html`), with a confirmation modal
   before leaving the app explaining the payer-email-must-match requirement.
   Both paths share one idempotency ledger.

**Known gap**: email-mismatch claim rejections have no admin override UI.

## Free vs. Premium (current)

**Free** — AI answers from real catalog, order capture, WhatsApp catalog
sync, dashboard/customers/conversation history, pause/resume AI, 40
AI-answered messages/day.

**Premium** — effectively unlimited AI (soft-capped 1000/day as a cost
safety net, shown as "Unlimited"), conversion analytics + popular
sizes/colours, custom AI personality (server-enforced), AI-generated
product descriptions (server-enforced).

Not yet built: Google Sheets export, advanced FAQs.

## Cost controls

- Daily AI quota checked/incremented only immediately before an actual AI
  call — deterministic answers and order capture never touch it.
- 6-hour response cache for repeated single-shot questions.
- Per-customer hourly rate limit (20/hr), independent of plan.
- Free-first provider fallback — the AI layer costs $0 by default.

## Built and working end-to-end

Accounts/onboarding/dashboard; billing (both paths + cancel); email
(welcome + payment-success); AI chat (free-first, deterministic-first,
cached, rate-limited, quota-limited, expiry-aware); order capture; WhatsApp
webhook + catalog sync; Analytics/Customers/Products/Orders/Billing pages;
legal/trust pages; Firestore security rules with vendor isolation and
server-only financial/AI/WhatsApp fields.

## Still queued

1. Google Sign-In as a popup (`signInWithPopup`) — for the median.co APK.
2. median.co APK wrapper compatibility review, INCLUDING hiding/redirecting
   the in-app purchase flow per the Play Store section above.
3. Multi-account abuse prevention (blocking >3 accounts/device).
4. Admin override UI for email-mismatch payment claims.
5. Pre-expiry reminder notification for lapsing Premium subscriptions.

Full detail in `HANDOFF_PROMPT.md`.

## Vercel environment variables

| Variable | Where to get it | Cost |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Console → Project Settings → Service Accounts → Generate new private key | Free tier available |
| `FLW_SECRET_KEY` | Flutterwave Dashboard → Settings → API Keys | Free to obtain |
| `FLW_SECRET_HASH` | You invent this value, enter it in both Flutterwave's webhook setup and here | Free |
| `RESEND_API_KEY`, `EMAIL_FROM` | resend.com → API Keys (verify a sending domain) | Free tier available |
| `GROQ_API_KEY` | console.groq.com → API Keys | **Free**, no card |
| `GEMINI_API_KEY` | aistudio.google.com → Get API Key | **Free**, no card |
| `AI_API_KEY` | console.anthropic.com → API Keys | Paid — skip entirely for $0 |
| `WHATSAPP_VERIFY_TOKEN` | You invent this — any random string | Free |
| `WHATSAPP_APP_SECRET` | Meta for Developers → your App → Settings → Basic | Free to obtain |
| `WHATSAPP_API_VERSION` | Default `v21.0` | — |
| `APP_URL` | Your Vercel domain | — |
| `PREMIUM_NGN_PRICE`, `PREMIUM_USD_PRICE`, `FREE_AI_LIMIT`, `PREMIUM_AI_LIMIT`, `AI_RESPONSE_CACHE_TTL_HOURS`, `PER_CUSTOMER_HOURLY_AI_LIMIT`, `AI_PROVIDER_ORDER`, `GROQ_MODEL`, `GEMINI_MODEL`, `AI_MODEL` | Config decisions — defaults in `.env.example` | — |

Per-vendor WhatsApp credentials are NOT env vars — entered per-vendor in Settings.

## Before you deploy

1. `cd backend && npm install`
2. Fill in `.env`, add the same to Vercel. For $0 AI cost, fill in
   `GROQ_API_KEY`/`GEMINI_API_KEY` only, leave `AI_API_KEY` blank.
3. `firebase deploy --only firestore:rules`.
4. Set Meta's webhook URL to `/api/whatsapp/webhook`, Flutterwave's to
   `/api/flutterwave/webhook`.
5. Read the header comments in `backend/api/whatsapp/webhook.js`,
   `backend/api/whatsapp/connect.js`, `backend/lib/orderFlow.js`,
   `backend/lib/aiCache.js`, `backend/lib/aiProvider.js`,
   `backend/lib/subscription.js`, and `backend/api/flutterwave/claim.js`.
