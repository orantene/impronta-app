# Pipeline runtime config — env, RLS, webhooks

What the inquiry-pipeline marathon shipped, and what it needs to actually
operate (vs. just compile + run in mock mode).

---

## Stripe Checkout

Used by the client-side **Pay invoice** CTA →
`startInquiryCheckout` → `createCheckoutSessionForTransaction` →
Stripe-hosted Checkout → `/api/webhooks/stripe` → `markPaid`.

### Env vars

| Var | Required | Purpose |
|-----|----------|---------|
| `STRIPE_SECRET_KEY` | for live | Server-side Stripe SK (sk_live_… or sk_test_…). Without it, the action returns a mock URL pointing back at `/checkout/success?mock=1` so the prototype demo still completes. |
| `STRIPE_WEBHOOK_SECRET` | for live | Endpoint secret used to verify signatures on incoming events. Without it, the webhook route refuses every request with **503**. |
| `NEXT_PUBLIC_BASE_URL` | optional | Base URL for success/cancel redirects. Falls back to the request's `host` + `x-forwarded-proto` so local dev works without setting it. |

### Webhook setup

1. In the Stripe dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://<your-domain>/api/webhooks/stripe`.
3. Subscribe to: `checkout.session.completed` (required) +
   optionally `payment_intent.payment_failed` (logged only, no DB
   write today).
4. Copy the **signing secret** → set as `STRIPE_WEBHOOK_SECRET` in the
   deployment environment.

The handler uses `client_reference_id` (set by
`createCheckoutSessionForTransaction` to the `booking_transactions.id`)
to find the transaction to mark paid. No customer match required.

### Stripe Connect (Express) — per-tenant payouts

**Status: built (rev 12).** Each agency can connect its own Stripe
account; client payments route directly to that account via Direct
Charges. The platform takes an application fee
(currently 0 — see `getApplicationFeeForAgency` in `stripe-connect.ts`).

Architecture:

- **Express accounts** — Stripe-hosted KYC + dashboard. Created on
  demand when an agency hits Connect for the first time.
- **Direct Charges** — `stripe.checkout.sessions.create(params, { stripeAccount })`.
  Connected account bears chargebacks; platform receives `application_fee_amount`.
- **Lifecycle mirror** — `agencies.stripe_account_status` /
  `stripe_charges_enabled` / `stripe_payouts_enabled` /
  `stripe_details_submitted` / `stripe_account_synced_at` track the
  Stripe account state. Refreshed on `account.updated` webhook,
  return-from-onboarding redirect, and on-demand from the settings page.
- **Fallback** — When an agency hasn't connected, `startInquiryCheckout`
  falls back to single-account (platform's Stripe account). This
  preserves backwards compat and keeps the demo working in mock mode.

**Routes:**
- `/<tenantSlug>/admin/payouts` — settings page with Connect / Refresh /
  Manage / Disconnect buttons. Capability-gated to `agency.workspace.edit`.
- `/<tenantSlug>/admin/payouts/return` — Stripe redirects here after
  hosted onboarding; refreshes status, sends user back to /payouts.

**Connect-specific webhook events (handled at `/api/webhooks/stripe`):**
- `account.updated` → refresh persisted snapshot
- `capability.updated` → re-fetch and persist
- `payout.paid` / `payout.failed` / `payout.created` / `payout.canceled` → log only

**Stripe dashboard requirements (one-time platform setup):**
1. Enable Connect in the Stripe dashboard (Settings → Connect → Get started).
2. Configure the Connect platform profile (name, branding, support email).
3. Configure Express dashboard branding (logo, accent color).
4. Set up the platform business profile under Connect settings.

The webhook endpoint at `/api/webhooks/stripe` receives both base events
AND Connect events automatically when:
- The same endpoint is registered as a Connect webhook in Stripe
  (Developers → Webhooks → "Listen to events on Connected accounts" toggled on,
  OR a separate Connect-flagged endpoint pointing to the same URL).

---

## Realtime (Supabase)

Used by `web/src/hooks/use-inquiry-realtime.ts` and mounted via
`<RealtimeBridge />` inside `ProtoProvider`. Subscribes to
Postgres-changes events on:

| Table | Filter |
|-------|--------|
| `inquiries` | `tenant_id=eq.<tenantId>` |
| `inquiry_messages` | `tenant_id=eq.<tenantId>` |
| `inquiry_offers` | `tenant_id=eq.<tenantId>` |
| `booking_transactions` | `source_tenant_id=eq.<tenantId>` |

### Required setup

1. **Realtime publication** must include each watched table. By default
   Supabase enables realtime for all tables in the `supabase_realtime`
   publication, but if it was customized per project, run:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE
     public.inquiries,
     public.inquiry_messages,
     public.inquiry_offers,
     public.booking_transactions;
   ```
2. **RLS policies** must allow the active session to `SELECT` from
   each watched table. The admin shell uses the user's authenticated
   session (browser anon-key client) — the existing tenant-scoped
   policies already permit staff users to read these tables for their
   tenant.

### When this hook is silent

- **No env vars** (Supabase URL or anon key missing) — `createClient()`
  returns null and the hook is a no-op.
- **No `bridgeTenantIdentity.tenantId`** in the proto state — happens
  when the prototype is in standalone demo mode (no live data bridge).
- **Channel filter mismatch** — Supabase silently rejects a channel
  that names a table without an active publication.

To debug, open the browser console and look for Supabase realtime
WebSocket frames; you should see `phx_join` messages on the
`tulala.realtime.*` channel names.

---

## Workspace settings (`agencies.settings` JSONB)

The prototype's settings drawers (Theme / SEO / Domain / Navigation /
Languages / Visibility / Filters) all persist via
`patchAgencySettingsNamespace(_, namespace, value)` which patches
namespaced JSON inside the existing `agencies.settings` jsonb column.

No new tables required. Each drawer reads with
`loadAgencySettingsNamespace(_, namespace)` on mount. Schema:

```jsonc
// agencies.settings shape (current prototype usage)
{
  "timezone": "Europe/Madrid",        // from updateWorkspaceFields
  "primary_locale": "en",             // from updateWorkspaceFields
  "theme":      { "theme": "editorial-noir", "accent": "#B8860B", ... },
  "seo":        { "siteTitle": "...", "description": "..." },
  "navigation": { "headerItems": [...], "col1": "Agency", ... },
  "languages":  { "enabled": ["EN", "ES"], "primary": "EN" },
  "domain":     { "customDomain": "acme.com", "redirectToWww": true },
  "visibility": { "rosterGrid": true, "clientLogos": false, ... },
  "filters":    { "drafts": true, "archived": false, ... }
}
```

If a drawer's persisted shape needs to change, bump the namespace key
(e.g. `theme.v2`) so old data isn't misread. The store is shallow —
top-level keys under each namespace replace, nested keys are not deep
merged.

---

## Bulk Nudge

The bulk Nudge button (admin inbox bulk bar) calls `bulkNudgeInquiries`
which posts a coordinator-attributed system message into the **group**
thread on each selected inquiry. The talent participants pick it up via
the existing unread-count plumbing — no separate notifications system
required.

If you want a richer dispatch later (push / email / digest), build it
as a new layer that consumes the same `inquiry_messages` insert event
(via realtime / triggers) rather than replacing this path.

---

## Stripe go-live checklist (USER ACTIONS)

Everything below requires credentials / accounts that only you have.
The code is shipped and waiting on these env + dashboard configurations.

### Step 1 — Stripe account + keys

1. Create a Stripe account at https://dashboard.stripe.com/register
   (or use your existing one).
2. **Live mode**: complete platform activation (legal entity, bank account,
   support details). Without activation you can only run in test mode.
3. Grab your secret key from Developers → API keys:
   - Test: `sk_test_…`
   - Live: `sk_live_…`

### Step 2 — Enable Connect (for per-tenant payouts)

1. Stripe dashboard → Connect → Get started.
2. Choose **Platform or marketplace**.
3. Configure the platform profile:
   - Name: "Tulala" (or your platform's brand)
   - Country: your platform's country
   - Support email: from your branding
4. Under Connect → Settings → Branding, upload logo and accent color
   for the Express dashboard your agencies will see.
5. Verify "Express" account type is enabled (it is by default).

### Step 3 — Webhook endpoint

1. Stripe dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://<your-production-domain>/api/webhooks/stripe`
   - For Tulala on the live alias: `https://app.tulala.digital/api/webhooks/stripe`
3. Select **"Account in Connect — listen to events on Connected accounts"** —
   this is essential, otherwise you only get platform events.
4. Subscribe to these events (minimum):
   - `checkout.session.completed`         (payment confirmation)
   - `payment_intent.payment_failed`      (failure logging)
   - `account.updated`                    (Connect account status changes)
   - `capability.updated`                 (Connect capability changes)
   - `payout.created` / `payout.paid` / `payout.failed` / `payout.canceled` (logging)
5. After creating, copy the **signing secret** (`whsec_…`).

### Step 4 — Vercel env vars

Set these on the Vercel project (`tulala`, team `oran-tenes-projects`):

| Var | Value | Where to get it |
|-----|-------|-----------------|
| `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…` for staging) | Step 1 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Step 3 |
| `NEXT_PUBLIC_BASE_URL` | `https://app.tulala.digital` (production) | (Optional — already falls back to host header) |

Set them via the Vercel dashboard or CLI:
```
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
```

After setting, redeploy: `vercel --prod` or push to `phase-1` to trigger
a build. Without the keys, the code falls back to mock-mode (returns a
mock success URL) and the webhook returns 503.

### Step 5 — Smoke test

After deploying with the env vars set:

1. Sign in as an agency admin → `/<slug>/admin/payouts`.
2. Click "Connect Stripe" → complete the Express onboarding form.
   In test mode, Stripe accepts dummy values for everything; in live
   mode you'll need real legal + bank info.
3. Return to `/<slug>/admin/payouts` and verify status pill shows "Active".
4. Drive a real client payment via the inquiry flow and verify the
   funds land in the agency's connected Stripe account (Stripe dashboard
   → Connect → Accounts → that account → Payments).
5. Verify the `booking_transactions` row flips to `paid` in the DB.
6. Verify the corresponding `account.updated` webhook hit your endpoint
   (Stripe dashboard → Webhooks → endpoint → recent deliveries).

### Step 6 — Application fee (when ready)

The code path passes `application_fee_amount: 0` today. To start taking
a platform cut:

1. Edit `getApplicationFeeForAgency` in `web/src/lib/payments/stripe-connect.ts`.
2. Either compute from a flat-bps platform fee (e.g. 5% = 500 bps) or
   read from a new column on `agencies` for per-agency fees.
3. Communicate the fee to your agencies before turning it on; existing
   bookings created before the change should not be affected (the fee
   is fixed per Checkout session, not per transaction history).

---

## Mock-mode caveats

Several wirings have a "demo doesn't crash" fallback for missing config:

- **Stripe**: missing `STRIPE_SECRET_KEY` → returns mock success URL.
- **Realtime**: missing Supabase env → hook is a no-op.
- **Synthetic mock conversation ids** (admin-shell `c1..c12`,
  `RI-XXX`, `m1..m8`, `g1..g4`) — every wired action checks for a real
  UUID before hitting the DB, so the mock demo data still toasts and
  doesn't trigger spurious 4xx responses.

The boundary check is consistently:
```ts
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  .test(id);
```

When `isUuid` is false, the action degrades to a local toast (or no-op)
instead of attempting a DB write that would 404.
