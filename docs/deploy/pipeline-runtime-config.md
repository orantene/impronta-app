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

### Stripe Connect (deferred)

This pass uses a single-account Checkout (the agency receives funds in
the connected Stripe account; payout to talent is recorded as a
manual-mode `payout_sent` for audit). True per-tenant payouts require
Stripe Connect (Express or Standard accounts per workspace). That's a
separate phase.

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
