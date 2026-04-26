# Admin-shell prototype → production handoff

**Status as of last commit:** the prototype at `/prototypes/admin-shell` is
feature-complete. Surfaces, drawers, primitives, copy, mobile, a11y — all
shipped. Around 150 product/design/UX items have been resolved across
nine commits on `phase-1`.

What's left is **production wiring**: replacing mock arrays with real
DB-backed data, wiring third-party services, and standing up the
infrastructure each real surface depends on. This document scopes that
work into engineering tickets that can be picked up independently.

Each ticket includes:
- **Scope** — what it covers
- **Dependencies** — what must land first
- **Files** — where the prototype shape already exists
- **Effort** — rough days for one engineer
- **Out of scope** — what NOT to scope-creep into

---

## Foundation tickets (must land first)

### T1 · Auth + tenant resolution
**Effort:** 3–5 days
**Scope:**
- Sign-in / sign-up via Supabase auth (email + magic-link, OAuth
  optional)
- Session cookie → `getRequestUser()` server helper
- Tenant resolution: read `Host` header in middleware, look up
  `agency_domains` table, expose `getTenantScope()` that returns
  `{ tenantId, role, plan }` to server components and route handlers
- Replace the hardcoded `TENANT` constant in
  `_state.tsx` with a `useTenant()` hook backed by a server-rendered
  initial-data fetch
- Per-tenant `<ProtoProvider>` sources real plan/role from session,
  not URL state (URL state stays as override for dev/QA)

**Dependencies:** none — this unlocks everything else
**Files:** `src/app/prototypes/admin-shell/_state.tsx` (TENANT
constant); `src/middleware.ts` (already gates requests by
`agency_domains` — extend to expose tenantId)
**Out of scope:** SSO, custom IdP, MFA — phase 2

---

### T2 · Core entity tables (talent · clients · inquiries · bookings)
**Effort:** 5–7 days
**Scope:**
- Migrations:
  - `talent (id, tenant_id, name, slug, state, height, city, ... )`
  - `clients (id, tenant_id, name, contact, status, trust, ... )`
  - `inquiries (id, tenant_id, client_id, brief, stage, ... )`
  - `bookings (id, inquiry_id, status, payment_total, ... )`
  - `messages (id, inquiry_id, thread_type, sender_id, body, ts)`
  - `events (id, tenant_id, actor_id, action, subject_id, ts, payload)`
- Row-level-security: every table scoped by `tenant_id` against
  `auth.uid()` lookups
- Server actions for CRUD on each entity
- Replace mock arrays (`getRoster`, `getInquiries`, `getClients`,
  `RICH_INQUIRIES`, `TALENT_BOOKINGS`) with real queries cached via
  `unstable_cache` and tagged for revalidation

**Dependencies:** T1
**Files:** every mock array in `_state.tsx`. ~30 mocks total.
**Out of scope:** CRM-style custom fields, tags, segmentation —
phase 2 (custom roles + fields ticket)

---

### T3 · Events table + audit log live data
**Effort:** 2 days
**Scope:**
- `events` table from T2
- Every state-change server action writes one event
- AuditLogDrawer (`_wave2.tsx`) reads from `events`, paginates, filters
  by actor / object / date

**Dependencies:** T2
**Files:** `_wave2.tsx::AuditLogDrawer`. Replace `MOCK_AUDIT` with a
React-Query / server-action read.

---

## Communication tickets

### T4 · Real notifications
**Effort:** 4 days
**Scope:**
- `user_notification_prefs` table (event × channel × user)
- Server-side digest cron (Vercel Cron) that fires daily 9am tenant-
  local
- Transactional email via Resend (or Postmark) with templates per
  event type
- In-app notification feed reads from `events` filtered to user's
  subscription
- NotificationsDrawer (`_drawers.tsx`) reads real data; mark-read
  writes `notification_reads (user_id, event_id)`
- NotificationsPrefsDrawer (`_wave2.tsx`) save button → upsert prefs

**Dependencies:** T1, T2, T3
**Out of scope:** SMS, push notifications, custom digest schedules

---

### T5 · Inquiry messages — real thread + read receipts + typing
**Effort:** 3 days
**Scope:**
- `messages` table from T2 + a `seen_by` join table
- Realtime via Supabase Realtime — subscribe to inquiry-scoped messages
  channel; on each new message, push to clients
- Read receipts: when a user opens an inquiry, write a row into
  `seen_by` for the latest message; render in `<ReadReceipt>`
  (`_wave2.tsx`)
- Typing indicators: ephemeral broadcast channel; render
  `<TypingIndicator>` (`_wave2.tsx`)
- @-mentions create notification rows (T4)

**Dependencies:** T1, T2, T4
**Files:** `_workspace.tsx::MessagingPanel`, `_wave2.tsx::ReadReceipt`,
`_wave2.tsx::MentionTypeahead` (already wired into the composer)

---

## Money tickets

### T6 · Stripe Connect onboarding
**Effort:** 4 days
**Scope:**
- Stripe Connect Express accounts, one per tenant
- Onboarding link generation in `PaymentsSetupDrawer`
  (`_drawers.tsx`)
- Webhook handler at `/api/stripe/webhook` for
  `account.updated`, `payout.paid`, `charge.dispute.created`
- Per-booking `transfer` to the tenant's connected account, minus
  platform fee from `PLAN_FEE_META`
- Failed-payout alerting via T4

**Dependencies:** T1, T2
**Out of scope:** dispute handling UI, custom payout schedules,
multi-currency settlements (phase 2)

---

### T7 · Booking conversion engine
**Effort:** 3 days
**Scope:**
- When `inquiries.stage = "booked"` and all-parties approval threshold
  hits, server action creates a row in `bookings`
- Generates a contract via PDFKit, stores in Supabase Storage, links
  in booking row
- Schedules calendar entries (talent + agency + client all get one)
- Triggers Stripe payment intent (T6)
- Writes audit-log events at each step

**Dependencies:** T1, T2, T3, T6
**Files:** `_workspace.tsx::OfferPanel` (current "Approve booking"
button just toasts; needs to call this server action)

---

## Storefront / public tickets

### T8 · Storefront pages CMS
**Effort:** 5–7 days
**Scope:**
- The page-builder code already exists in
  `web/src/lib/site-admin/`. Wire it into the workspace's "Public
  site" tab
- Per-tenant pages stored in `pages` table with RLS
- `/[storefront-domain]/[slug]` route renders using the page-builder
  runtime + tenant theme
- Draft/publish flow with revision history

**Dependencies:** T1
**Files:** `_pages.tsx::SitePage` (currently a stub); merge with
existing `web/src/lib/site-admin/`

---

### T9 · Custom domain verification
**Effort:** 3 days
**Scope:**
- DomainDrawer collects hostname
- Generate TXT challenge, write to `domain_challenges`
- Polling job verifies DNS, marks domain verified
- Verified domain → call Vercel API to add as alias to the project
- SSL provisions automatically via Vercel
- Update middleware to recognize the new host

**Dependencies:** T1
**Files:** `_drawers.tsx::DomainDrawer`

---

### T10 · Public talent share-card live
**Effort:** 2 days
**Scope:**
- Route at `/share/talent/[slug]` already exists (mock-driven, see
  `web/src/app/share/talent/[slug]/page.tsx`)
- Replace `MOCK_TALENT` with real query against `talent` table
- Track impressions/views in `events` (T3) with referrer + UTM
- "Send inquiry" CTA prefills inquiry composer with `?talent=<id>` +
  attribution chain
- Honor public-page `unlisted` flag (privacy)

**Dependencies:** T1, T2, T3
**Files:** `web/src/app/share/talent/[slug]/page.tsx`

---

## File / asset tickets

### T11 · Photo + file uploads
**Effort:** 3 days
**Scope:**
- Supabase Storage bucket per tenant
- Signed-URL upload from client; server action returns the signed URL
- Replace stubs:
  - Talent profile photos (`talent-profile-edit` drawer)
  - Brand logo (`branding` drawer)
  - Polaroids set
  - Booking-call documents
- Image-cropping primitive — can use `react-image-crop` or build
  minimal canvas-based one (the prototype already accepts a
  `photoUrl` prop on `<Avatar>`)

**Dependencies:** T1, T2

---

### T12 · GDPR data export
**Effort:** 2 days
**Scope:**
- DataExportDrawer (`_wave2.tsx`) → server action enqueues a
  background job
- Job assembles tenant's data into JSON ZIP (talent + clients +
  inquiries + messages + events)
- Email user a signed-URL link (24h TTL)
- Wipe expired URLs via daily cron

**Dependencies:** T1, T2, T3, T11

---

## Trust + verification tickets

### T13 · Identity / document verification
**Effort:** 4 days
**Scope:**
- Talent uploads passport, model release, work permit (T11)
- Admin review queue at `/platform/identity-queue` (new platform page)
- Status tracked on `talent.verification_status`
- Rejection flow with reason + email (T4)
- Stripe Identity option for stronger checks (out of scope for v1 —
  manual review is fine)

**Dependencies:** T1, T2, T11, T4

---

### T14 · Client trust ladder live
**Effort:** 2 days
**Scope:**
- Trust tier (`basic`/`verified`/`silver`/`gold`) lives on
  `clients.trust`
- Auto-promote rules:
  - `verified` when payment method on file
  - `silver` when funded balance > threshold
  - `trusted` (a.k.a. gold internal) when sustained activity AND
    funded balance both met for 30+ days
- Per-tenant `client_trust_thresholds` for custom Silver/Trusted bars
- ClientTrustChip already renders; just needs the live tier value

**Dependencies:** T1, T2, T6

---

## Multi-tenant / power-user tickets

### T15 · Custom roles
**Effort:** 4 days
**Scope:**
- `roles` table per tenant; `role_permissions (role_id,
  resource, action)`
- Default roles seeded: viewer / editor / coordinator / admin / owner
- Admin UI (`team` drawer) to create/edit roles
- `meetsRole()` helper in `_state.tsx` reads from session-cached
  permissions

**Dependencies:** T1
**Out of scope:** ABAC / tag-based permissions (phase 2)

---

### T16 · Webhooks + API tokens
**Effort:** 5 days
**Scope:**
- `api_tokens (id, tenant_id, scope, last_used_at)` table
- Token gen/revoke UI in workspace settings
- `webhook_endpoints (id, tenant_id, url, events[], secret)` table
- Webhook delivery worker (cron + retry-with-backoff)
- Delivery log UI for debugging
- Per-event signature header (HMAC-SHA256)
- Public REST API at `/api/v1/{resource}` mirroring the server actions

**Dependencies:** T1, T2 (and ideally T15 for scoped tokens)
**Out of scope:** GraphQL endpoint, gRPC

---

### T17 · Embed widgets product
**Effort:** 7 days
**Scope:**
- New package `@tulala/embed` published to npm
- `<TulalaRoster tenant="..." />` React component + vanilla JS
- Iframe-based to avoid CSS leakage
- Per-tenant config UI (which talent to expose, theme overrides)
- Allowed-origins config to restrict embedding
- Network plan only (gated via T15 permissions)

**Dependencies:** T1, T2, T15

---

## Effort summary

| Phase | Tickets | Total effort |
|---|---|---|
| **Foundation** | T1 + T2 + T3 | 10–14 days |
| **Communication** | T4 + T5 | 7 days |
| **Money** | T6 + T7 | 7 days |
| **Storefront** | T8 + T9 + T10 | 10–12 days |
| **Files** | T11 + T12 | 5 days |
| **Trust** | T13 + T14 | 6 days |
| **Power user** | T15 + T16 + T17 | 16 days |

**Grand total:** ~10 weeks for one engineer, ~5 weeks for two.

---

## Recommended sequence

1. **Week 1–2:** T1, T2 (foundation — unblocks everything)
2. **Week 3:** T3 (events + audit log) + T11 (file storage)
3. **Week 4:** T4 (notifications)
4. **Week 5:** T5 (real messages) + T14 (client trust)
5. **Week 6–7:** T6 + T7 (Stripe + booking conversion)
6. **Week 8:** T8 (storefront CMS)
7. **Week 9:** T9 + T10 (custom domains + share-card)
8. **Week 10+:** T13, T15, T16, T17 in any order

---

## What's deliberately not in this list

- **Mobile native apps** (iOS/Android) — phase 3
- **Internationalization** — phase 2 (after T8 lands a stable copy
  surface)
- **Real-time presence indicators** — phase 2 polish
- **Advanced analytics dashboards** — phase 2
- **Help center / docs site** — separate marketing initiative
- **Customer support tooling** (Intercom etc.) — operational, not
  product

---

## Files map

Where the prototype already has the shape:

| Production ticket | Prototype location |
|---|---|
| T1 auth | new |
| T2 tables | replace mocks in `_state.tsx` |
| T3 audit log | `_wave2.tsx::AuditLogDrawer` |
| T4 notifications | `_drawers.tsx::NotificationsDrawer` + `_wave2.tsx::NotificationsPrefsDrawer` |
| T5 messages | `_workspace.tsx::MessagingPanel` |
| T6 Stripe | `_drawers.tsx::PaymentsSetupDrawer` |
| T7 booking | `_workspace.tsx::OfferPanel` |
| T8 pages | `_pages.tsx::SitePage` + `web/src/lib/site-admin/` |
| T9 domain | `_drawers.tsx::DomainDrawer` |
| T10 share-card | `web/src/app/share/talent/[slug]/page.tsx` |
| T11 uploads | `<Avatar photoUrl>` already accepts; many drawer stubs |
| T12 export | `_wave2.tsx::DataExportDrawer` |
| T13 verification | new platform page |
| T14 trust | `<ClientTrustChip>` + `clients.trust` field |
| T15 roles | `_drawers.tsx::TeamDrawer` |
| T16 webhooks/tokens | new workspace settings tabs |
| T17 embeds | new npm package |

The prototype's job was to answer every product question before
engineering started. It did. Now this doc replaces it.
