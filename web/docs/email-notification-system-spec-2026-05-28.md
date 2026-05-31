# Email Notification System — Binding Spec (2026-05-28)

**Status:** BINDING after architecture decisions are ratified (see §3 Open Decisions). Until then, this is a draft for review.

**Scope:** The complete notification system for Tulala / Impronta — email + in-app today, multi-channel-ready tomorrow. Tenant-aware, user-aware, preference-driven, audit-tracked, idempotent. Supports platform admins, workspace admins/owners, coordinators, talent, clients, and future billing/product workflows.

**Why this doc exists:** Three previous threads added email sends ad-hoc (`sendEmail()` from random server actions). Two engine events have orphaned email functions (`OFFER_SENT`, `BOOKING_CREATED`) that were never wired. A dispatcher stub was checked in 8 months ago and never implemented. The schema is in place but four mutually incompatible event enums coexist. This doc is the single binding contract that fixes the foundation, replaces the stub, and makes every future "add a new notification" change a one-file edit.

---

## 0. Audit Summary (what we have, what we're missing)

### 0.1 Existing infrastructure (DO NOT REBUILD)

| Layer | Component | Status | File |
|---|---|---|---|
| DB | `notifications` table (legacy) | Live, slowly retiring | `20250409000000_init.sql` |
| DB | `user_notifications` table (modern feed) | Live, 4 event types wired | `20260513080316_user_notifications.sql` |
| DB | `notification_dispatch_log` table (channel tracking) | Live, **never written to** | `20260513221951_notification_dispatch_log.sql` |
| DB | `inquiry_events` table (canonical event stream) | Live, ~30 event types emitted | `20260527000000_inquiry_events.sql` |
| DB | `user_prefs.notification_prefs` jsonb | Live, **per-event shape, never read** | `20260914010000_user_prefs_notification_prefs.sql` |
| RPC | `engine_emit_notification(user_id, tenant_id, title, body)` | Live, SECURITY DEFINER | `20260513041617_phase2_offer_engine_rpcs…sql` |
| RPC | `user_notifications_mark_read` / `_mark_all_read` | Live | same migration |
| RPC | `engine_emit_event` / `engine_emit_system_event` | Live | `20260527000000` |
| Engine | `emitStandardEngineEvent` w/ 3-listener chain | Live | `web/src/lib/inquiry/inquiry-events.ts` |
| Engine | Inquiry listeners: system-message, in-app notify, observability | Live | same file |
| Lib | `sendEmail({ to, subject, html, replyTo })` (Resend wrapper) | Live, fire-and-forget | `web/src/lib/email/index.ts` |
| Lib | `getUserEmail(userId)` (auth admin lookup) | Live | `web/src/lib/email/inquiry-notifications.ts` |
| Lib | `resolveInquiryRecipients(inquiryId, tenantId)` | Live | `web/src/lib/notifications/recipients.ts` |
| Lib | `emitNotification` / `emitNotificationToUsers` (in-app) | Live | `web/src/lib/notifications/emit.ts` |
| Lib | `createServiceRoleClient()` | Live | `web/src/lib/supabase/admin.ts` |
| Lib | `improntaLog` / `logServerError` | Live | `web/src/lib/server/{structured-log,safe-error}.ts` |
| Lib | `TENANT_ROLES`, `getPlatformRole`, `PLAN_CATALOG` | Live | `web/src/lib/access/*` |
| Lib | `PLATFORM_BRAND` default | Live | `web/src/lib/brand/tulala.ts` |
| UI | `NotificationsBell` + popover (reads `user_notifications`) | Live | `web/src/components/admin/shell/internal/notifications-hub.tsx` |
| UI | `NotificationPrefsPanel` (5 event types) | Live, **disconnected from dispatcher** | `web/src/app/(workspace)/[tenantSlug]/client/settings/NotificationPrefsPanel.tsx` |
| Infra | React Email + `@react-email/components` + `@react-email/render` | Installed 2026-05-28 | `web/package.json` |
| Infra | Cron pattern (CRON_SECRET-gated GET routes) | Live, ~8 jobs | `web/src/app/api/cron/*` |
| Templates | 8 raw HTML string templates | Live, callable | `web/src/lib/email/templates.ts` |

### 0.2 Critical gaps (must fix in this build)

1. **Four mutually incompatible event enums.** The engine emits ~30 types; `notification_dispatch_log.event_kind` has 15; `user_notifications.kind` has 7; `NotificationPrefsPanel` UI shows 5. There is no mapping between them.
2. **`notification-dispatch.ts` is a documented stub.** Returns `{ ok: true, dispatched: 0 }`. The architecture is sketched in the comments but never built.
3. **`OFFER_SENT` and `BOOKING_CREATED` emit no email.** `sendOfferSentNotification` and `sendBookingConfirmedNotifications` are defined but never imported anywhere. **Real customer-facing P0 gap.**
4. **`INQUIRY_SUBMITTED` bypasses the dispatcher.** `inquiry-engine-submit.ts:494` calls `sendInquirySubmittedNotifications` directly, after emitting the engine event. The email and the in-app notification are wired in two different places for the same event.
5. **`user_prefs.notification_prefs` is stored but never read.** No code path checks user preferences before sending.
6. **No tenant brand resolver.** Templates accept `brand?: EmailBrand` but the only call sites pass `undefined`, so every email uses the platform default. Per-tenant agencies see "Tulala" in their customer's inboxes.
7. **No idempotency for email.** In-app notifications have a unique `(origin_event_id, user_id)` constraint; email has none. Retry → duplicate send.
8. **No delivery tracking.** `notification_dispatch_log.provider_reference`, `sent_at`, and a missing `delivered_at`/`opened_at`/`bounced_at` set were planned but never wired to Resend webhooks.
9. **Supabase auth emails (signup confirm, magic link, password reset, email change) use Supabase's default mailer.** Generic branding, no Tulala styling, no per-tenant brand.
10. **No unsubscribe link, no `List-Unsubscribe` header, no bounce/complaint handling.** Sending domain reputation risk.
11. **Templates are raw HTML strings.** No previewable component story, no shared layout discipline, no design-token reuse.
12. **No test mode.** Dev/QA sends hit real inboxes unless `RESEND_API_KEY` is unset (in which case sends are silently dropped — also bad).

### 0.3 Honest scoring

| Dimension | Score / 100 | Why |
|---|---|---|
| Schema readiness | 75 | Three tables exist; need 4 added columns + 1 new suppression table |
| Send infra (Resend wired) | 70 | `sendEmail` works; no idempotency, no tracking, no test mode |
| Recipient resolution | 80 | `resolveInquiryRecipients` is solid; no workspace-member or platform-admin equivalents |
| Catalog / registry | 0 | Doesn't exist; spread across hardcoded call sites |
| Dispatcher | 10 | Stub file + types defined; no implementation |
| Preferences enforcement | 5 | Schema exists, UI exists, nothing reads them |
| Tenant brand | 20 | `EmailBrand` interface exists; resolver missing |
| Templates | 35 | 8 raw HTML templates; need ~22 React Email components |
| Auth emails | 0 | Supabase default; nothing customized |
| Webhooks / suppression | 0 | Not built |
| Compliance (unsubscribe / GDPR) | 0 | Not built |
| Observability | 50 | `improntaLog` + structured errors; no Resend dashboard integration, no smoke check |
| **Overall** | **~30 / 100** | The bones are there; the system isn't |

**Target after this build: ~88 / 100.** Reaching 100 requires SMS/WhatsApp/push channels which are explicitly out of scope here (see §10).

---

## 1. Architecture

### 1.1 Three layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 1: EVENTS  (already exists, do not change)                    │
│  • Engine emits inquiry_events / engine_audit_log rows               │
│  • Server actions emit non-inquiry events (workspace.created,        │
│    workspace.plan_changed, auth.signup_confirmed, …)                 │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (one event → 0..N notifications)
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 2: CATALOG + DISPATCHER  (NEW, this build)                    │
│  • Catalog: registry of notification types                           │
│    id | category | audience resolver | channels | template | subject │
│  • Dispatcher: dispatchEventNotifications(event)                     │
│    → look up catalog entries for event.type                          │
│    → for each entry: resolve audience → filter by user prefs +       │
│      suppressions → enqueue per channel → write dispatch_log row     │
│      (idempotency via dedupe_key)                                    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  LAYER 3: CHANNELS  (rendered output)                                │
│  • email.ts        → Resend (tenant brand resolved, React Email)     │
│  • in_app.ts       → user_notifications insert (existing emit.ts)    │
│  • push.ts         → reserved for PWA                                │
│  • sms.ts / whatsapp.ts → reserved (Twilio / Meta)                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Why this shape

* **Engine code stays clean.** A `submitInquiry` call doesn't import email templates; it emits an event. Adding a fifth channel later is a Layer-3 change, not 50 call sites.
* **One catalog = one source of truth.** "Who gets the offer_sent email and why" is one entry in `catalog.ts`, not scattered across `inquiry-engine-offers.ts`, `templates.ts`, `inquiry-notifications.ts`, and `NotificationPrefsPanel.tsx`.
* **Idempotency lives at the dispatcher.** Channel handlers don't worry about dedup; the dispatcher writes the dispatch_log row first (with a unique constraint) and only calls the channel if the insert succeeded.
* **Preferences are checked once.** The dispatcher filters recipients before enqueueing; channel handlers never need preference logic.
* **Tenant context flows through.** The event carries `tenantId`; the dispatcher resolves tenant brand once and passes it to the channel.

### 1.3 What replaces what

| Old | New |
|---|---|
| Direct `sendEmail` calls from server actions | Server action emits a domain event → dispatcher handles email |
| `web/src/lib/email/templates.ts` (raw HTML) | `web/emails/**/*.tsx` (React Email components) |
| `web/src/lib/email/inquiry-notifications.ts` (orchestration) | Catalog entries + audience resolvers |
| `web/src/lib/server-actions/notification-dispatch.ts` (stub) | Implemented dispatcher in `web/src/lib/notifications/dispatcher.ts` |
| `inquiry-events.ts` 3-listener chain | 4-listener chain (adds notification listener after system-message + in-app) |
| Per-event `notification_prefs` keys | Per-category `notification_prefs` keys |

---

## 2. Components in detail

### 2.1 Notification Catalog

A TypeScript registry. One entry per notification type. Lives at `web/src/lib/notifications/catalog.ts`.

```ts
export type NotificationCategory =
  | "account_security"      // signup confirm, magic link, password reset, email change. REQUIRED.
  | "billing"               // invoices, plan changes, payment failed. REQUIRED.
  | "messages"              // new chat message
  | "inquiry_updates"       // submitted, frozen, archived, expired, cancelled
  | "offers"                // sent, accepted, declined, countered
  | "bookings"              // created, day-of reminder, cancelled
  | "payments"              // received, settled, refunded
  | "roster_activity"       // talent invited, accepted, declined, removed
  | "workspace_activity"    // team invited, coordinator assigned, approvals
  | "platform_alerts"       // platform admin: new workspace, over-quota
  | "marketing"             // future, off by default
;

export type NotificationChannel = "email" | "in_app" | "push" | "sms" | "whatsapp";

export type NotificationEvent = {
  /** Domain event type. Matches `inquiry_events.event_type` for inquiry events;
   *  for non-inquiry events use a `workspace.*` / `auth.*` / `billing.*` namespace. */
  type: string;
  /** Tenant scope. NULL for platform-only events (platform_signup_failed). */
  tenantId: string | null;
  /** Foreign-key context — at least one should be set so the audience resolver
   *  has something to query. */
  inquiryId?: string | null;
  workspaceId?: string | null;
  userId?: string | null;
  bookingId?: string | null;
  /** Idempotency anchor. For engine events use `inquiry_events.id`. */
  eventId: string;
  /** Free-form payload passed to the template. */
  payload: Record<string, unknown>;
};

export type ResolvedRecipient = {
  userId: string;
  email: string | null;
  displayName: string | null;
  locale: string;        // BCP-47, default "en"
  isPlatformAdmin: boolean;
  role: "client" | "talent" | "workspace_member" | "platform_admin" | "guest";
};

export type CatalogEntry = {
  id: string;                                             // e.g. "inquiry.offer_sent.client"
  category: NotificationCategory;
  defaultChannels: NotificationChannel[];                  // e.g. ["email", "in_app"]
  /** Required = user cannot opt out. */
  required: boolean;
  /** Subscribes to one or more domain event types. */
  triggers: string[];
  /** Returns the list of users to notify. Pure async fn. */
  resolveAudience: (event: NotificationEvent, ctx: AudienceContext) => Promise<ResolvedRecipient[]>;
  /** Template selector + subject builder per channel. */
  email?: {
    template: EmailTemplate;
    subject: (event: NotificationEvent, recipient: ResolvedRecipient) => string;
  };
  in_app?: {
    title: (event: NotificationEvent, recipient: ResolvedRecipient) => string;
    body?: (event: NotificationEvent, recipient: ResolvedRecipient) => string;
    surface: "workspace" | "talent" | "client";
    kind: "message" | "offer" | "booking" | "payment" | "approval" | "system" | "profile";
    targetDrawer?: string;
    targetPayload?: (event: NotificationEvent) => Record<string, unknown>;
  };
};

export const NOTIFICATION_CATALOG: CatalogEntry[] = [ /* see §6 inventory */ ];
```

**Why a code-driven registry (not DB-driven):** templates are React components; audience resolvers are TypeScript functions; channels reference compile-time-typed imports. A DB-driven catalog would mean dynamically loading template strings and `eval`-ing audience predicates — a security and maintainability hole. **Tenant-level overrides** (e.g. "this agency wants their own offer-sent copy") are a Phase 12+ concern; if needed we add a `tenant_notification_overrides` table keyed by `(tenant_id, catalog_entry_id)` that supplies overriding subject / template props, without changing the registry itself.

### 2.2 Dispatcher

```ts
// web/src/lib/notifications/dispatcher.ts

export async function dispatchEventNotifications(
  event: NotificationEvent,
): Promise<{ dispatched: number; suppressed: number; failed: number }> {
  const entries = NOTIFICATION_CATALOG.filter(e => e.triggers.includes(event.type));
  if (entries.length === 0) return { dispatched: 0, suppressed: 0, failed: 0 };

  const ctx = await buildAudienceContext(event);
  let dispatched = 0, suppressed = 0, failed = 0;

  for (const entry of entries) {
    const recipients = await entry.resolveAudience(event, ctx);
    for (const r of recipients) {
      const channels = await channelsForRecipient(entry, r);
      for (const channel of channels) {
        const dedupeKey = `${event.eventId}:${r.userId}:${channel}`;
        const inserted = await tryInsertDispatchLog({
          event, recipient: r, channel, entry, dedupeKey,
        });
        if (!inserted) { suppressed++; continue; }  // duplicate, already sent
        try {
          await CHANNEL_HANDLERS[channel](event, entry, r, ctx);
          await markDispatchLogSent(inserted.id);
          dispatched++;
        } catch (err) {
          await markDispatchLogFailed(inserted.id, err);
          failed++;
        }
      }
    }
  }
  return { dispatched, suppressed, failed };
}
```

**Key invariants:**

* The dispatch_log row is inserted **before** the channel handler runs. If the unique constraint fires, we know this exact `(event, recipient, channel)` was already attempted — skip.
* Channel handlers are pure send-effects. They don't decide who to send to, they don't dedupe, they don't check preferences.
* Failure of one (recipient, channel) never blocks others. All async, gathered via `Promise.allSettled`.
* The function is `fire-and-forget` from the engine's point of view — engine emit returns immediately, dispatch happens asynchronously.

### 2.3 Channel handlers

```
web/src/lib/notifications/channels/
  email.ts        — render React Email component, resolve tenant brand,
                    inject unsubscribe footer, call sendEmail()
  in_app.ts       — wraps existing emitNotification (idempotent via origin_event_id)
  push.ts         — Phase 12+ (PWA push)
  sms.ts          — Phase 12+ (Twilio)
  whatsapp.ts     — Phase 12+ (Meta)
```

### 2.4 Channels for recipient (preferences + suppressions)

```ts
async function channelsForRecipient(
  entry: CatalogEntry,
  recipient: ResolvedRecipient,
): Promise<NotificationChannel[]> {
  // 1. Required categories always send via their defaults — no opt-out.
  if (entry.required) return entry.defaultChannels;

  // 2. Read per-category prefs.
  const prefs = await getNotificationPrefs(recipient.userId);
  const categoryPrefs = prefs[entry.category] ?? defaultsFor(entry.category);

  // 3. Filter default channels by per-channel toggle.
  let channels = entry.defaultChannels.filter(c => categoryPrefs[c] !== false);

  // 4. Drop email if the user is suppressed (hard bounce / complaint).
  if (channels.includes("email")) {
    const suppressed = await isEmailSuppressed(recipient.userId);
    if (suppressed) channels = channels.filter(c => c !== "email");
  }

  return channels;
}
```

### 2.5 Tenant brand resolver

```ts
// web/src/lib/brand/resolve-tenant-brand.ts

export const resolveTenantBrand = cache(async (tenantId: string | null): Promise<EmailBrand> => {
  if (!tenantId) return platformBrand();
  const admin = createServiceRoleClient();
  if (!admin) return platformBrand();

  const [agencyRes, domainRes] = await Promise.all([
    admin.from("agencies").select("display_name, slug").eq("id", tenantId).maybeSingle(),
    admin.from("agency_domains")
      .select("hostname")
      .eq("tenant_id", tenantId)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  const agency = agencyRes.data;
  const primaryHost = domainRes.data?.hostname ?? null;
  if (!agency) return platformBrand();

  return {
    wordmark: agency.display_name?.toUpperCase() ?? PLATFORM_BRAND.name.toUpperCase(),
    accountName: agency.display_name ?? PLATFORM_BRAND.name,
    footerDomain: primaryHost ?? PLATFORM_BRAND.domain,
    homeHref: primaryHost ? `https://${primaryHost}` : siteUrl(),
  };
});
```

Note `cache()` — request-scoped memoization. One tenant resolve per request even when 5 emails go out.

---

## 3. Ratified decisions (2026-05-28)

> Sign-off recorded 2026-05-28. All six decisions locked as the recommended leans. Treat as binding from here.

**D1 — Preference granularity:** ✅ **per-category.** 9 categories × 2 channels = 18 toggles. Required categories (`account_security`, `billing`) bypass opt-out.
**D2 — Auth-email routing:** ✅ **Supabase SMTP → Resend.** Supabase Auth keeps owning tokens; SMTP relayed through Resend. Templates rendered from React Email components into `supabase/templates/`.
**D3 — Dedup key shape:** ✅ `eventId : userId : channel` (UUID for engine events; synthesized composite for non-engine events).
**D4 — Unsubscribe scope:** ✅ **per-category, one-click.** Token in URL → flips that category's email channel to false; required categories render no unsubscribe link; token rotates on use.
**D5 — Tenant-level catalog overrides:** ✅ **deferred to Phase 12+.** Single TypeScript registry now; add `tenant_notification_overrides` when an agency actually asks.
**D6 — Test mode:** ✅ `EMAIL_TEST_MODE=true` env flag redirects channel email to `EMAIL_TEST_INBOX` with `[TEST → original@example.com]` subject prefix. React Email preview server on port 3001 via `npm run email:preview`.

### 3.1 Original decision context (preserved for audit)

### D1. Preference granularity
- **Lean: per-category (recommended).** 9 categories, 2 channels each → 18 toggles per user. Survives adding new notifications without UI churn.
- Alternative: per-event. ~30 toggles today, more later. More fine-grained but UI heavy and almost no users actually want this level of control.

### D2. Auth-email routing
- **Lean: Supabase SMTP → Resend (recommended).** Configure Supabase Auth to relay through `smtp.resend.com`. Auth emails stay native (so Supabase's recovery tokens still work) but the from-address, deliverability dashboard, and SPF/DKIM are unified. Templates customized in `supabase/templates/` by rendering React Email components and committing the rendered HTML.
- Alternative: route auth emails through our dispatcher. Means disabling Supabase's default confirmation + building our own token issuance. **Higher security risk, more code to own.** Not recommended.

### D3. Dedup key shape
- **Lean: `event.eventId : recipient.userId : channel`.** Engine events have stable UUIDs; non-engine events synthesize an `eventId` from the trigger context (e.g. `workspace.created:${tenantId}`). Adding `channel` lets us send email + in-app for the same event without one suppressing the other.
- Alternative: hash the entire payload. Bigger key, no real upside.

### D4. Unsubscribe scope
- **Lean: per-category, one-click.** Token in URL → flips that category's email channel to false. Required categories cannot be unsubscribed (link is omitted).
- Alternative: global unsubscribe. Simpler footer but a user who unsubs from offer notifications shouldn't stop getting booking confirmations. Not recommended.

### D5. Tenant-level catalog overrides (now or later?)
- **Lean: defer to Phase 12.** Ship a single registry first; add `tenant_notification_overrides` when an agency actually asks for custom copy. Pre-launch (per the binding pre-launch rule) we don't need this.
- Alternative: build it now. Adds a table + admin UI + override resolution code. Premature without a customer asking.

### D6. Test mode design
- **Lean: `EMAIL_TEST_MODE=true` env flag.** When set, channel handler redirects all email to `EMAIL_TEST_INBOX` (single address) with a `[TEST → original@example.com]` subject prefix. In-app notifications still write to the real user's feed (since they're tenant-scoped reads). React Email preview server runs on port 3001 via `npm run email:preview`.
- Alternative: separate `notification_test_mode` column per-tenant. Overengineered.

---

## 4. Schema changes (Phase 1 migration)

Single migration file: `supabase/migrations/<ts>_notification_engine_phase1.sql`.

```sql
-- 4.1 notification_dispatch_log: add delivery tracking + dedup
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN dedupe_key TEXT,
  ADD COLUMN template_id TEXT,
  ADD COLUMN locale TEXT DEFAULT 'en',
  ADD COLUMN delivered_at TIMESTAMPTZ,
  ADD COLUMN opened_at TIMESTAMPTZ,
  ADD COLUMN clicked_at TIMESTAMPTZ,
  ADD COLUMN bounced_at TIMESTAMPTZ,
  ADD COLUMN complaint_at TIMESTAMPTZ;

-- Unique constraint for idempotency.
CREATE UNIQUE INDEX notification_dispatch_log_dedupe_uq
  ON public.notification_dispatch_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 4.2 email_suppressions: hard bounce + complaint list
CREATE TABLE public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'manual')),
  source TEXT,                              -- resend message_id that triggered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_suppressions_self ON public.email_suppressions
  FOR SELECT USING (user_id = auth.uid());
-- Writes: SECURITY DEFINER via webhook handler only.

-- 4.3 user_prefs: unsubscribe token + category schema migration
ALTER TABLE public.user_prefs
  ADD COLUMN unsubscribe_token UUID DEFAULT gen_random_uuid() UNIQUE;
-- Backfill any existing row without a token (DEFAULT covers new rows).
UPDATE public.user_prefs SET unsubscribe_token = gen_random_uuid()
  WHERE unsubscribe_token IS NULL;
ALTER TABLE public.user_prefs ALTER COLUMN unsubscribe_token SET NOT NULL;

-- The notification_prefs jsonb shape changes from per-event to per-category.
-- We keep the column name; the migration is a one-shot transform.
-- Old: { "new_message": { email: true, push: true }, "offer_sent": { … } }
-- New: { "messages": { email: true, in_app: true }, "offers": { email: true, in_app: true }, … }
UPDATE public.user_prefs SET notification_prefs = jsonb_build_object(
  'messages',            jsonb_build_object('email', true, 'in_app', true),
  'inquiry_updates',     jsonb_build_object('email', true, 'in_app', true),
  'offers',              jsonb_build_object('email', true, 'in_app', true),
  'bookings',            jsonb_build_object('email', true, 'in_app', true),
  'payments',            jsonb_build_object('email', true, 'in_app', true),
  'roster_activity',     jsonb_build_object('email', true, 'in_app', true),
  'workspace_activity',  jsonb_build_object('email', false, 'in_app', true),
  'marketing',           jsonb_build_object('email', false, 'in_app', false)
) WHERE notification_prefs IS NOT NULL;
COMMENT ON COLUMN public.user_prefs.notification_prefs IS
  'Per-category notification channel preferences. Keys are NotificationCategory; values are {email, in_app, ...future channels}. Required categories (account_security, billing) bypass this lookup.';
```

**Migration safety:** existing `NotificationPrefsPanel.tsx` references the old shape. We ship the migration + the panel rewrite in the same commit so there's no window where the UI reads stale keys. Pre-launch, no real preferences are at stake.

---

## 5. File layout (final state)

```
web/
├─ emails/                                          NEW — React Email components
│  ├─ components/
│  │  ├─ Layout.tsx              ✅ done 2026-05-28
│  │  ├─ Button.tsx              ✅ done 2026-05-28
│  │  ├─ FieldTable.tsx          ✅ done 2026-05-28
│  │  ├─ Divider.tsx
│  │  └─ UnsubscribeFooter.tsx   NEW — slot for one-click footer
│  ├─ auth/                      SignupConfirm.tsx (✅), MagicLink.tsx (✅), PasswordReset, EmailChange
│  ├─ talent/                    ClaimInvite, Welcome, InquiryInvited, BookingConfirmed, ProfileApproved
│  ├─ client/                    Welcome, InquiryReceived, OfferReady, BookingConfirmed, PaymentReceipt
│  ├─ workspace/                 TeamInvite, NewInquiryAlert, CoordinatorAssigned,
│  │                             OfferAccepted, OfferDeclined, BookingCanceled, PaymentReceived
│  ├─ billing/                   PlanUpgraded, SubscriptionCanceled, PaymentFailed, Invoice
│  └─ platform/                  NewWorkspaceAlert, UsageQuotaAlert, SignupFailedAlert
│
├─ src/lib/
│  ├─ notifications/
│  │  ├─ catalog.ts              NEW — single registry
│  │  ├─ dispatcher.ts           NEW — replaces stub
│  │  ├─ audience.ts             NEW — common resolvers (inquiry participants,
│  │  │                                workspace members, platform admins)
│  │  ├─ prefs.ts                NEW — read per-category prefs
│  │  ├─ suppressions.ts         NEW — read email_suppressions
│  │  ├─ channels/
│  │  │  ├─ email.ts             NEW
│  │  │  └─ in_app.ts            NEW (wraps existing emit.ts)
│  │  ├─ recipients.ts           ✅ existing (resolveInquiryRecipients)
│  │  ├─ emit.ts                 ✅ existing (in-app insert, used by in_app channel)
│  │  ├─ actions.ts              ✅ existing
│  │  └─ admin-notifications-actions.ts ✅ existing
│  │
│  ├─ email/
│  │  ├─ index.ts                ✅ keep (sendEmail wrapper)
│  │  ├─ render.ts               NEW — renderEmail(Component, props) → HTML
│  │  ├─ resend-client.ts        delete (dup of index.ts)
│  │  ├─ templates.ts            delete (replaced by web/emails)
│  │  ├─ inquiry-notifications.ts delete (replaced by catalog entries)
│  │  └─ unsubscribe.ts          NEW — token verify + page link helpers
│  │
│  ├─ brand/
│  │  ├─ tulala.ts               ✅ existing
│  │  └─ resolve-tenant-brand.ts NEW — request-cached resolver
│  │
│  └─ server-actions/
│     └─ notification-dispatch.ts  REWRITE — re-exports from /lib/notifications/dispatcher
│
├─ src/app/
│  ├─ api/cron/
│  │  ├─ send-digest-emails/route.ts        NEW
│  │  └─ retry-failed-emails/route.ts        NEW
│  ├─ api/webhooks/
│  │  └─ resend/route.ts                     NEW — bounce/complaint/open/click
│  ├─ unsubscribe/[token]/page.tsx           NEW — one-click unsubscribe
│  └─ (workspace)/[tenantSlug]/client/settings/
│     └─ NotificationPrefsPanel.tsx          REWRITE — per-category UI
│
└─ supabase/
   ├─ migrations/<ts>_notification_engine_phase1.sql NEW
   └─ templates/
      ├─ confirm.html       NEW — rendered from emails/auth/SignupConfirm.tsx
      ├─ magic_link.html    NEW
      ├─ recovery.html      NEW
      └─ email_change.html  NEW
```

---

## 6. Complete notification inventory

For brevity, each row is: `catalog id` | category | recipients | trigger event | channels.

### 6.1 Account & auth

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| auth.signup.confirm | account_security | new signup | (Supabase native, branded template) | email |
| auth.magic_link | account_security | requesting user | (Supabase native) | email |
| auth.password_reset | account_security | requesting user | (Supabase native) | email |
| auth.email_change | account_security | both old + new addresses | (Supabase native) | email |

### 6.2 Inquiry lifecycle

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| inquiry.submitted.client | inquiry_updates | inquiry.contact_email + client_user_id | INQUIRY_SUBMITTED | email + in_app |
| inquiry.submitted.coordinator | workspace_activity | assigned coordinator | INQUIRY_SUBMITTED | email + in_app |
| inquiry.submitted.workspace_admin | workspace_activity | workspace owners/admins | INQUIRY_SUBMITTED | in_app |
| inquiry.submitted.talent_invited | roster_activity | each talent on roster at submit | INQUIRY_SUBMITTED | email + in_app |
| inquiry.frozen.participants | inquiry_updates | client + talent | INQUIRY_FROZEN | in_app |
| inquiry.cancelled.participants | inquiry_updates | client + talent | INQUIRY_CANCELLED | email + in_app |
| inquiry.expired.workspace | inquiry_updates | coordinator + admins | INQUIRY_EXPIRED | in_app |
| coordinator.assignment_timed_out | workspace_activity | workspace admins | COORDINATOR_ASSIGNMENT_TIMED_OUT | email + in_app |
| coordinator.assigned | workspace_activity | assigned coordinator | COORDINATOR_ASSIGNED | email + in_app (✅ in_app already wired) |
| coordinator.primary_changed | workspace_activity | new primary | PRIMARY_COORDINATOR_CHANGED | in_app (✅ already wired) |
| coordinator.secondary_assigned | workspace_activity | new secondary | SECONDARY_COORDINATOR_ASSIGNED | in_app (✅ already wired) |
| message.new | messages | thread participants except sender | MESSAGE_SENT | in_app (+ email digest, see §7) |

### 6.3 Roster & talent

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| roster.talent_invited.talent | roster_activity | talent.user_id | ROSTER_TALENT_INVITED | email + in_app (✅ in_app wired) |
| roster.talent_accepted.coordinator | roster_activity | coordinator | ROSTER_TALENT_ACCEPTED | in_app |
| roster.talent_declined.coordinator | roster_activity | coordinator | ROSTER_TALENT_DECLINED | email + in_app |
| roster.claim_invite | roster_activity | invited talent (by email, may not have account) | (workspace action) | email |
| talent.profile_approved | roster_activity | talent | (admin action) | email + in_app |
| talent.profile_rejected | roster_activity | talent | (admin action) | email + in_app |

### 6.4 Offers & bookings

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| offer.sent.client | offers | client | OFFER_SENT | **email** + in_app (TODAY: NEITHER, P0 gap) |
| offer.accepted.workspace | offers | coordinator + workspace admins | (engine event TBD: APPROVAL_SUBMITTED w/ approved=true) | email + in_app |
| offer.declined.workspace | offers | coordinator | OFFER_CLIENT_REJECTED | email + in_app |
| offer.invalidated_by_roster | offers | coordinator | OFFER_INVALIDATED_BY_ROSTER_CHANGE | in_app |
| booking.created.client | bookings | client | BOOKING_CREATED | **email** + in_app (TODAY: NEITHER, P0 gap) |
| booking.created.talent | bookings | each booked talent | BOOKING_CREATED | **email** + in_app (TODAY: NEITHER, P0 gap) |
| booking.day_of_reminder | bookings | client + talent | (cron 24h before event_date) | email + in_app |
| booking.cancelled | bookings | client + talent + coordinator | BOOKING_CANCELLED (new event) | email + in_app |

### 6.5 Payments

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| payment.received.client | payments | client | (Stripe webhook → engine event) | email |
| payment.received.workspace | payments | workspace admins | (Stripe webhook) | email + in_app |
| payment.failed.workspace | payments | workspace admins | (Stripe webhook) | email + in_app |
| payment.payout_settled.talent | payments | talent | (Stripe Connect transfer) | email + in_app |

### 6.6 Workspace & billing

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| workspace.signup_welcome | workspace_activity | new workspace owner | (signup flow) | email |
| workspace.signup_failed | platform_alerts | platform admins + signup user | (signup flow) | email |
| workspace.team_invite | workspace_activity | invitee | (admin action) | email |
| workspace.plan_upgraded | billing | workspace owner | (Stripe webhook) | email + in_app |
| workspace.plan_downgraded | billing | workspace owner | (Stripe webhook) | email + in_app |
| workspace.subscription_cancelled | billing | workspace owner | (Stripe webhook) | email |
| workspace.over_seat_limit | workspace_activity | workspace admins | (cron usage-audit) | email + in_app |

### 6.7 Platform admin

| id | category | recipients | trigger | channels |
|---|---|---|---|---|
| platform.new_workspace | platform_alerts | platform admins | (signup flow) | email + in_app |
| platform.workspace_over_quota | platform_alerts | platform admins | (cron usage-audit) | email |
| platform.suspicious_login | platform_alerts | affected user + platform admins | (auth event, future) | email |

**Total: 41 catalog entries.** Of those, ~8 are already partly wired (4 in_app, 8 email templates exist). The other 33 are new.

---

## 7. Digest & batching policy

Some events fire too often for one-email-each (messages especially). For these the dispatcher writes the dispatch_log row with `status = 'queued'` and `payload.digest = true`. A cron sweep (`/api/cron/send-digest-emails`) batches queued rows per `(recipient_user_id, category)` and sends one summary email per batch window.

Default windows:
- `messages` → 30 min batch (5 messages → 1 email)
- `roster_activity` → 1 hour batch
- Everything else → no digest (immediate send)

The user can switch a category to "daily digest" in preferences (Phase 6+); the dispatcher then forces the digest path regardless of category default.

---

## 8. Compliance

- **`List-Unsubscribe` header** on every transactional email (RFC 8058 one-click).
- **Unsubscribe footer link** rendered by `UnsubscribeFooter.tsx`. Omitted for `required: true` categories.
- **Token URL:** `https://tulala.digital/unsubscribe/[token]?cat=<category>`. Token = `user_prefs.unsubscribe_token`. Page POSTs to a server action that flips the category's email channel to false and returns a confirmation. Token rotates on use to prevent replay (regenerate after each unsubscribe).
- **GDPR data deletion:** on user delete, `notification_dispatch_log` rows cascade via `recipient_user_id` FK. `email_suppressions` cascade via `user_id`. Older-than-90-day rows purged by retention cron (already exists pattern).
- **From-address / reply-to:** every email sets `Reply-To: hello@tulala.digital` (or per-tenant override when set). From-address fixed per environment (single SPF/DKIM scope).

---

## 9. Observability

- Every dispatcher run logs `notif.dispatch` to `improntaLog` with `{ eventType, eventId, tenantId, entries: [{ id, dispatched, suppressed, failed }] }`.
- Every channel send logs `notif.send.email` / `notif.send.in_app` with timing + provider response.
- Webhook handler logs `notif.webhook.resend` per delivery event.
- `npm run deploy:smoke` adds:
  - Resend domain verification status (DKIM/SPF/DMARC green)
  - Webhook endpoint reachable (HEAD → 200)
  - Dispatcher self-test: emit a `notif.smoke_test` event in a sandbox tenant → assert dispatch_log row inserted with status='sent' within 10s
- A read-only platform admin dashboard surface (Phase 11+) shows: 24h volume per channel, bounce rate, open rate, top-failing templates.

---

## 10. Out of scope (explicit)

- SMS / WhatsApp / push (catalog supports them but no handlers ship)
- Per-tenant template overrides (Phase 12+)
- Custom-domain sending (every email goes from `noreply@tulala.digital`; per-agency-domain sending is a deliverability rabbit hole)
- A/B testing of subject lines
- Marketing campaigns (only transactional + activity emails)
- Resend Audiences API (transactional only)

---

## 11. Implementation phases (binding execution order)

Each phase ships as a single commit. TS + lint gate before every push. Migration applied with `apply-migration.mjs` per the protocol in CLAUDE.md.

1. **Phase 1 — Schema migration.** Add columns, `email_suppressions`, unsubscribe_token. Migrate `notification_prefs` shape. ✅ tracked as task #3.
2. **Phase 2 — Catalog + dispatcher core.** Build `catalog.ts`, `dispatcher.ts`, `channels/email.ts`, `channels/in_app.ts`. Replace `notification-dispatch.ts` stub. Empty catalog initially (one self-test entry).
3. **Phase 3 — Tenant brand resolver.** Build + cache. Wire into email channel.
4. **Phase 4 — React Email templates.** Build all 22+ components. Set up preview server. Verify render via `npm run email:preview`.
5. **Phase 5 — Wire engine events through dispatcher.** Add notification listener to `emitStandardEngineEvent`. Add catalog entries for every engine event. Delete `inquiry-notifications.ts` (the email side); migrate the 7 non-engine callsites (`roster-invite.ts`, `team-management.ts`, `cancel-subscription.ts`, etc.) to emit domain events.
6. **Phase 6 — Preferences UI rewrite.** Per-category panel. Unsubscribe page.
7. **Phase 7 — Supabase auth via Resend SMTP.** Config + rendered templates.
8. **Phase 8 — Resend webhook + suppression.** Bounce/complaint handling.
9. **Phase 9 — Digest + retry cron.** Two new cron routes.
10. **Phase 10 — Platform admin alerts.** Platform_admins audience + 3 new entries.
11. **Phase 11 — QA + observability.** Smoke harness, deploy:smoke additions, platform admin dashboard.

**Per-phase merge gate:** TS clean, lint clean, manual happy-path QA, dispatch_log shows the expected rows after firing one test event.

---

## 12. Migration plan for existing call sites

These currently bypass the dispatcher and call `sendEmail` directly. Phase 5 deletes them and emits domain events instead:

| Call site | Today | Phase 5 replacement |
|---|---|---|
| `inquiry-engine-submit.ts:494` `sendInquirySubmittedNotifications` | Direct email send + bypasses dispatcher | Already emits `INQUIRY_SUBMITTED`. Delete the direct call; catalog entries `inquiry.submitted.*` handle it. |
| `inquiry-engine-offers.ts:358` (no email today) | Engine event only | Catalog entry `offer.sent.client` triggers on `OFFER_SENT`. |
| `inquiry-engine-booking.ts:223` (no email today) | Engine event only | Catalog entries `booking.created.*` trigger on `BOOKING_CREATED`. |
| `roster-invite.ts:175` | Direct `sendEmail(talentClaimInviteEmail)` | Emit `roster.claim_invite_requested` domain event. |
| `team-management.ts:154` | Direct `sendEmail(teamInviteEmail)` | Emit `workspace.team_invite_sent` domain event. |
| `cancel-subscription.ts:163` | Direct `sendEmail(subscriptionCancelEmail)` | Emit `workspace.subscription_cancelled` domain event. |
| `workspace-signup.server.ts:372,400` | Two direct sends | Emit `workspace.signup_completed` event; catalog handles welcome. |
| `workspace-signup-failure-notify.ts:64` | Direct send to founder | Emit `platform.workspace_signup_failed` event; catalog handles platform admin notification. |
| `get-started/actions.ts:365,415` | Marketing flow sends | Move into catalog as `marketing.*` category (default off). |
| `onboarding/actions.ts:303` | Direct send | Catalog entry under `workspace_activity`. |
| `api/cron/usage-audit/route.ts:328` | Direct send | Catalog entry `workspace.over_seat_limit` triggered by cron emitting the domain event. |

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Migration drops `notification_prefs` keys before UI is updated | Ship migration + panel rewrite + dispatcher in same commit. Pre-launch so no real prefs to lose. |
| Resend webhook signature verification skew | Use Resend SDK's helper; document secret rotation. |
| Cascade send-storm (engine event fires 100 in_app inserts) | Already true today; dispatcher adds rate limiting per recipient via Phase 9 batching. |
| Sandbox tenants polluting prod dashboard | Catalog entries can gate on `tenant.is_test=true` (already exists via `agencies.kind`). |
| Hard bounce on a real customer's email blocks all comms | Suppression scope is `(user_id, email_address)`. If user changes email, new address starts un-suppressed. Admin can manually clear via a service action. |
| Resend account billing limits | `notification_dispatch_log` is the audit trail; we can throttle in code if a runaway loop fires. Add cron alarm at >10× baseline volume. |

---

## 14. Definition of done

This spec is implemented when:

1. Every entry in §6 has a catalog row, an audience resolver, a template (where it sends email), and a passing QA send.
2. Firing `INQUIRY_SUBMITTED` produces email + in_app for client and talent — and writes 4 `notification_dispatch_log` rows.
3. `OFFER_SENT` and `BOOKING_CREATED` send email (P0 gap closed).
4. `npm run deploy:smoke` includes the notification health checks.
5. A user can unsubscribe from a category via the one-click link and stop receiving those emails immediately.
6. Supabase signup-confirm email shows Tulala branding (not Supabase defaults).
7. Hard-bouncing an address suppresses future sends to that user.
8. Resend webhook updates dispatch_log delivered/opened/clicked timestamps.
9. React Email preview server renders every template at `localhost:3001`.
10. `notification-dispatch.ts` stub is gone; dispatcher is the live code path.

---

## 15. Companion / supersedes

- **Supersedes** the email-template approach in `web/src/lib/email/templates.ts` (raw HTML strings).
- **Supersedes** the stub at `web/src/lib/server-actions/notification-dispatch.ts`.
- **Companion** to `web/docs/messages-consolidation-plan-2026-05-13.md` (Messages product plan §17 references this spec for "notifications" definition).
- **Companion** to `web/docs/commission-model-2026-05-13.md` (payment events emit through this dispatcher).
- **Companion** to `web/docs/tulala-2026-execution-plan.md` Phase A (Thread/Money/Trust pillars all rely on notifications).

---

**Author:** Senior architect pass, 2026-05-28.
**Reviewers:** Product owner (Oran) — sign-off required on §3 Open Decisions before Phase 2 starts.
