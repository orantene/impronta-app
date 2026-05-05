# Tulala — Remaining Work Plan

**Source-of-truth task plan for everything left to ship.**
**Updated 2026-05-05 — Phase 8 (all four billing lanes) marked shipped per `docs/handoffs/phase-8-3-audit-2026-05-04.md`; obsolete messages-3-thread migration row removed; capability count in OPERATING.md §12 updated to 64.**
**Conflicts with `plan-execution.md` resolve in favor of this document.**

---

## Part 0 — URL / SaaS architecture (BINDING)

This is the canonical URL model. Everything in the build plan below maps to URLs in this matrix.

### 0.1 Core principle

Users enter and trust the platform through the brand that invited them.

- **Client invited by Impronta** → starts on Impronta domain.
- **Talent applying to Impronta** → starts on Impronta domain.
- **Agency admin managing Impronta** → can use Impronta domain or app domain.
- **Multi-agency power user** → uses `app.tulala.digital`.
- **Platform team** → uses `app.tulala.digital/platform/admin`.

Tulala powers the platform in the background. The agency brand owns the front experience. "Powered by Tulala" appears subtly in branded contexts.

### 0.2 Domain roles

| Domain                          | Role                                                                                  |
|---------------------------------|---------------------------------------------------------------------------------------|
| `tulala.digital`                | Marketing site, pricing, SEO, public marketplace, global talent profiles, signup entry|
| `app.tulala.digital`            | Login, global app, multi-workspace fallback, platform admin, billing, settings        |
| `<workspaceSlug>.tulala.digital`| Branded agency subdomain (Studio+) — storefront, talent/client portals, admin shortcut|
| `<customdomain>.com`            | Full white-label (Agency+) — same surfaces as branded subdomain                       |

### 0.3 Plan tier × URL matrix (BINDING)

| Plan    | Limit    | Public workspace          | Branded subdomain         | Custom domain                | Admin                                       | Branded portals                |
|---------|----------|---------------------------|---------------------------|------------------------------|---------------------------------------------|--------------------------------|
| Free    | 5 talent | `tulala.digital/<slug>`   | ❌                        | ❌                           | `app.tulala.digital/<slug>/admin`           | Path-based only                |
| Studio  | TBD      | `tulala.digital/<slug>`   | optional                  | optional add-on (decide)     | `app.tulala.digital/<slug>/admin`           | yes if subdomain enabled       |
| Agency  | TBD      | `tulala.digital/<slug>`   | ✅                        | ✅                           | `app.tulala.digital/<slug>/admin` + shortcut| ✅                             |
| Network | unlim.   | `tulala.digital/<slug>`   | ✅                        | ✅                           | `app.tulala.digital/<slug>/admin` + shortcut| ✅                             |

### 0.4 Canonical URL patterns

**Public workspace:**
- `tulala.digital/<workspaceSlug>` — every plan, path-based
- `<workspaceSlug>.tulala.digital` — Studio+
- `<customdomain>.com` — Agency+

**Public talent profiles — TWO contexts:**

A. Global talent-owned profile
- `tulala.digital/t/<talentSlug>`
- Inquiry source = Tulala global / talent-owned

B. Agency-context talent profile
- `tulala.digital/<workspaceSlug>/t/<talentSlug>` (path-based)
- `<workspaceSlug>.tulala.digital/t/<talentSlug>` (subdomain)
- `<customdomain>.com/t/<talentSlug>` (custom domain)
- Inquiry source = workspace agency

**Talent dashboard:**
- Branded: `<slug>.tulala.digital/talent`, `<customdomain>.com/talent`
- Fallback: `app.tulala.digital/talent`
- Sub-pages: `/profile`, `/inbox`, `/calendar`, `/settings`, `/onboarding`

**Talent registration:**
- `<slug>.tulala.digital/talent/register` (canonical branded)
- `<customdomain>.com/talent/register`
- `<slug>.tulala.digital/join` (friendly route alias)
- After signup → `/talent/onboarding` → `/talent`
- Behind the scenes: create user, create/claim talent profile, create relationship/application to workspace, set `source_workspace_id` + `origin_domain`

**Client dashboard:**
- Branded: `<slug>.tulala.digital/client`, `<customdomain>.com/client`
- Fallback: `app.tulala.digital/client`
- Sub-pages: `/discover`, `/inquiries`, `/bookings`, `/shortlists`, `/settings`

**Client registration:**
- `<slug>.tulala.digital/client/register`
- `<customdomain>.com/client/register`
- After registration → `/client`

**Client inquiry flow from agency context:**
1. Lands on `<slug>.tulala.digital/t/<talentSlug>`
2. Clicks "Request booking"
3. If not logged in → `/client/register?next=/t/<talentSlug>&intent=inquiry`
4. After registration → `/client/inquiries/new?talent=<talentSlug>`
5. Then → `/client`

**Admin URLs:**
- Canonical: `app.tulala.digital/<workspaceSlug>/admin`
- Branded shortcut: `<slug>.tulala.digital/admin`
- Custom domain shortcut: `<customdomain>.com/admin`
- Sub-pages: `/work`, `/roster`, `/clients`, `/site`, `/workspace`, `/calendar`, `/messages`, `/operations`, etc.

**Platform admin (HQ super_admin):**
- `app.tulala.digital/platform/admin` — only entry, never on agency hosts
- Sub-pages: `/today`, `/tenants`, `/users`, `/network`, `/billing`, `/operations`, `/settings`

### 0.5 Inquiry source attribution rule (BINDING)

The source URL determines ownership.

| Inquiry origin                                  | Source                                |
|-------------------------------------------------|---------------------------------------|
| `tulala.digital/t/<talentSlug>`                 | Tulala global / talent-owned          |
| `<slug>.tulala.digital/t/<talentSlug>`          | Workspace agency (e.g. Impronta)      |
| `<customdomain>.com/t/<talentSlug>`             | Workspace agency via custom domain    |
| `tulala.digital/<slug>/t/<talentSlug>`          | Workspace agency via path             |

**The same talent can generate different inquiry ownership depending on where the client entered.**

DB requirement (additive migration, can ship anytime):
- `inquiries.source_workspace_id uuid NULL REFERENCES agencies(id)` — workspace whose context the inquiry was sent from. NULL for talent-owned global inquiries.
- `inquiries.origin_domain text NULL` — the actual host the client was on (for audit trail).

### 0.6 Technical routing rule

Same React/Next route handlers serve all hosts. Tenant context resolves per host:

| Host                               | Tenant context source                  |
|------------------------------------|----------------------------------------|
| `app.tulala.digital/<slug>/...`    | URL slug (current Phase 3 model)       |
| `<slug>.tulala.digital/...`        | Host header → `agency_domains` table   |
| `<customdomain>.com/...`           | Host header → `agency_domains` table   |
| `tulala.digital/<slug>/...`        | URL slug (path-based public surface)   |
| `tulala.digital/...`               | Marketing surface (no tenant)          |

The middleware (`web/src/middleware.ts`) resolves the tenant from whichever signal is present. The page handler reads tenant via `getTenantScope()` regardless of how it was resolved.

### 0.7 Dual-identity (AlsoTalent) model

A user account can hold multiple roles simultaneously. Three modes a user switches between:

- **Talent mode** — `<slug>.tulala.digital/talent` or `app.tulala.digital/talent`
- **Workspace/admin mode** — `<slug>.tulala.digital/admin` or `app.tulala.digital/<slug>/admin`
- **Client mode** — `<slug>.tulala.digital/client` or `app.tulala.digital/client`

The mode-switcher UI (top nav) lets the user flip between dashboards within the same branded context. Capability is gated per mode by `lib/access/`.

---

## Part 1 — Where we are today (2026-05-03)

### ✅ Already shipped

| Surface                                                  | URL                                                       | State        |
|----------------------------------------------------------|-----------------------------------------------------------|--------------|
| Marketing                                                | `tulala.digital`                                          | live         |
| Login + auth                                             | `app.tulala.digital/login`                                | live         |
| Workspace admin (canonical)                              | `app.tulala.digital/<slug>/admin`                         | live         |
| Workspace overview                                       | `/<slug>/admin` (default)                                 | live         |
| Workspace roster + bridge                                | `/<slug>/admin/roster`                                    | live (real)  |
| Workspace messages                                       | `/<slug>/admin/messages`                                  | scaffolded   |
| Workspace clients                                        | `/<slug>/admin/clients`                                   | scaffolded   |
| Workspace site (CMS pages)                               | `/<slug>/admin/site`                                      | live (real)  |
| Workspace calendar / work / production / operations      | `/<slug>/admin/{calendar,work,production,operations}`     | scaffolded   |
| Workspace settings                                       | `/<slug>/admin/settings`                                  | scaffolded   |
| **Talent self-dashboard**                                | `/<slug>/talent/{today,inbox,calendar,profile,agencies,settings}` | live (real)  |
| Public agency storefront (subdomain)                     | `<slug>.tulala.digital`                                   | live         |
| Agency-context talent profile (subdomain)                | `<slug>.tulala.digital/t/<talentSlug>`                    | live (partly v2) |
| Global talent profile                                    | `tulala.digital/t/<talentSlug>`                           | live         |
| **Platform super_admin console**                         | `app.tulala.digital/platform/admin/{today,tenants,users,network,billing,operations,settings}` | live (this commit) |
| Public marketing pages                                   | `tulala.digital/{pricing,faq,operators,...}`              | live         |

### ❌ Major gaps (work below)

1. Path-based public workspace on `tulala.digital/<slug>` (Free plan storefront)
2. Path-based talent on `tulala.digital/<slug>/t/<talentSlug>`
3. Branded admin shortcut on `<slug>.tulala.digital/admin`
4. Branded client dashboard on `<slug>.tulala.digital/client`
5. Branded talent dashboard on `<slug>.tulala.digital/talent` (today's `/<slug>/talent` is app-host only)
6. Branded talent registration `<slug>.tulala.digital/talent/register` + `/join`
7. Branded client registration `<slug>.tulala.digital/client/register`
8. Custom domain support `<customdomain>.com/*`
9. Inquiry source attribution (`source_workspace_id`, `origin_domain`)
10. Real-time messages (3-thread model + Supabase Realtime)
11. Trust badge ladder display + verification flow
12. Stripe billing integration (Phase 8 — workspace plans, talent subscriptions, trust verification fee)
13. Field catalog frontend cutover (constants → `loadFieldCatalog()`)
14. Capability migration of 27 legacy callers in `(dashboard)/*` to `lib/access/`
15. Legacy `(dashboard)/admin/*` deletion per surface (Phase 4 cleanup)

---

## Part 2 — Build phases (sequenced)

### Phase 3.10 — Client self-dashboard (NEXT UP)

**URL:** `app.tulala.digital/<slug>/client/*` (canonical, app-host)
**Branded:** `<slug>.tulala.digital/client/*` (added in Phase 3.13)

**Pages:**
- `/<slug>/client` → redirect to `/today` (or `/discover` for new clients)
- `/<slug>/client/today` — context-aware welcome, active inquiries, next bookings, unread messages
- `/<slug>/client/discover` — browse this agency's roster (filtered to talents this client can contact per trust ladder)
- `/<slug>/client/inquiries` — list of own inquiries grouped Active/Booked/Closed
- `/<slug>/client/inquiries/new` — create inquiry form (optionally pre-filled with `?talent=<slug>`)
- `/<slug>/client/inquiries/[id]` — inquiry detail view
- `/<slug>/client/bookings` — confirmed bookings list
- `/<slug>/client/shortlists` — saved talent collections
- `/<slug>/client/settings` — profile, notifications, account
- `/<slug>/client/account` — billing/funded-account (placeholder until Phase 8)

**Files to create:**
- `web/src/app/(workspace)/[tenantSlug]/client/layout.tsx` — auth gate (active client of this tenant), client topbar
- `web/src/app/(workspace)/[tenantSlug]/client/client-topbar.tsx` — `"use client"` nav
- `web/src/app/(workspace)/[tenantSlug]/client/page.tsx` — redirect to today
- `web/src/app/(workspace)/[tenantSlug]/client/today/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/discover/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/inquiries/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/inquiries/[id]/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/bookings/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/shortlists/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/client/settings/page.tsx`
- `web/src/app/(workspace)/[tenantSlug]/_data-bridge.ts` — extend with `loadClientSelfProfile`, `loadClientInquiries`, `loadClientBookings`, `loadClientShortlists`, `loadAgencyDiscoverableRoster`

**Auth gate:** `client_profiles.user_id = session.user.id` AND a client_relationship to `tenantId` exists with `status = 'active'`. If user is signed in but not a client of this tenant → redirect to `app.tulala.digital/client` (global fallback).

**Capability:** `client.workspace.view`. Already exists in `lib/access/capabilities.ts` registry.

**Acceptance:**
- A real Impronta client can sign in and reach `/impronta/client/today` with their own inquiries
- Client can create new inquiry from `/inquiries/new`
- Discover page shows talents per trust ladder
- Legacy admin still works
- typecheck + access tests + capability-keys clean

### Phase 3.4 — Real-time messages

**Goal:** wire the workspace + talent + client message surfaces against the locked two-thread Phase 1 model from `docs/admin-workspace-spec.md` with Supabase Realtime push.

**Schema decision (reconciled 2026-05-05):**
- Use existing `inquiry_messages` + `inquiry_message_reads` with `thread_type = private | group`.
- Do not introduce parallel `messages`, `message_threads`, or `message_seen_by` tables in this slice.
- Internal notes / agency-internal thread remain deferred per `docs/admin-workspace-spec.md`.
- RLS stays on inquiry participants and tenant-scoped staff policies.

**UI:**
- Workspace admin messages: real inbox + private/group thread tabs + realtime + optimistic send.
- Client inquiry detail: private thread + realtime + optimistic send.
- Talent inbox detail: group thread + realtime + optimistic send.
- Client/talent list rows show true unread counts from read watermarks.

**Files:**
- Modify: `(workspace)/[tenantSlug]/admin/messages/MessagesShell.tsx`
- Modify: `(workspace)/[tenantSlug]/admin/messages/actions.ts`
- Modify: `(workspace)/[tenantSlug]/_data-bridge.ts`
- New: `(workspace)/[tenantSlug]/_ParticipantThreadShell.tsx`
- New/modify: `(workspace)/[tenantSlug]/client/inquiries/[id]/*`
- New/modify: `(workspace)/[tenantSlug]/talent/inbox/[id]/*`

### Phase 3.7 — Trust badges in clients view

Per `project_client_trust_badges.md` (binding):

**Tiers:** Basic / Verified / Silver / Gold

**Driven by:** verification status + funded-account signals (NOT subscription)

**Schema (additive):**
- `client_trust_tiers` table: `client_id, tier ('basic'|'verified'|'silver'|'gold'), assigned_at, expires_at`
- `verification_requests` (already in plan)
- `profile_verifications` (already in plan)
- `verification_method_configs` (already in plan)

**UI:**
- Badge component shown on talent inbox row, inquiry workspace, client profile drawer
- NEVER on public roster or booking detail
- Per-tier "who can contact me" toggles in talent settings

**Talent contact controls:**
- `talent_contact_policies` table: `talent_id, tier, allow_contact bool` — default open

**Capability gates:** `agency.client.view_trust_tier` (workspace+), `talent.contact_policy.manage` (talent self).

### Phase 3.12 — Branded admin shortcut

**Goal:** `<slug>.tulala.digital/admin` renders the same workspace admin as `app.tulala.digital/<slug>/admin`.

**Steps:**
1. Surface allow-list (`web/src/lib/saas/surface-allow-list.ts`) — already allows `/admin` on agency hosts via `APP_WORKSPACE_PREFIXES`. Verify.
2. Middleware tenant resolution — when host is agency subdomain AND path is `/admin/*`, tenant comes from host (not URL). `getTenantScope()` already handles host fallback. Verify.
3. The workspace admin layout reads tenant from `getTenantScopeBySlug(tenantSlug)` — for branded host, tenant comes from host. Need new `getTenantScopeForCurrentHost()` resolver that returns scope from either URL slug OR host header.
4. Layout's `[tenantSlug]` URL param is empty on branded host — layout must handle this case by reading from host scope.

**Cleaner approach:** add a NEW non-tenant-slug route `/admin/*` directly under `(workspace)/admin/` that:
- Resolves tenant from host (must be agency subdomain or custom domain)
- Renders the same `WorkspaceAdminLayout` and child pages
- Internally redirects all sub-page URLs to the branded variant

**Files:**
- New: `web/src/app/(workspace)/admin/layout.tsx` — same as `[tenantSlug]/admin/layout.tsx` but pulls tenant from host
- New: `web/src/app/(workspace)/admin/{page.tsx,roster,clients,messages,site,...}` — re-export from the slug-based versions
- OR: middleware-level redirect from `<slug>.tulala.digital/admin` to `app.tulala.digital/<slug>/admin` (simpler, but breaks the "branded trust" principle for agency staff)

**Recommendation:** ship the branded admin route (don't redirect to app host) — that's the trust principle.

### Phase 3.13 — Branded talent + client portals on agency subdomain

**Goal:** `<slug>.tulala.digital/talent` and `<slug>.tulala.digital/client` render the same dashboards as `app.tulala.digital/<slug>/talent` and `<slug>/client`.

**Same routing pattern as Phase 3.12.** Talent and client layouts read tenant from host instead of URL slug.

**Files:**
- New: `web/src/app/(workspace)/talent/{layout,page,today,inbox,calendar,profile,agencies,settings}.tsx` — branded variant pulling tenant from host
- New: `web/src/app/(workspace)/client/{layout,page,today,discover,inquiries,bookings,shortlists,settings}.tsx` — same pattern
- Surface allow-list — already allows `/talent` and `/client` on agency hosts. Verify.

### Phase 3.14 — Branded registration flows + inquiry source attribution

**Routes:**
- `<slug>.tulala.digital/talent/register` + `/join` (friendly alias)
- `<slug>.tulala.digital/client/register`
- `<slug>.tulala.digital/client/inquiries/new`

**Files:**
- Existing: `web/src/app/(auth)/talent/register/page.tsx` — host-aware branded talent registration entry.
- Existing: `web/src/app/(auth)/client/register/page.tsx` — host-aware branded client registration entry.
- New: `web/src/app/(auth)/join/page.tsx` — friendly alias redirect to `/talent/register`.
- New: `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/page.tsx` — client portal inquiry creation, prefilled from Discover.
- New: `web/src/app/(workspace)/[tenantSlug]/client/inquiries/new/actions.ts` — tenant-scoped inquiry creation using source attribution.

**Server actions:**
- `registerTalentForWorkspace(formData, hostInfo)` — creates user, creates/claims talent profile, creates `agency_talent_roster` row with `source = 'self_application'`, sets `source_workspace_id = tenantId`, sets `origin_domain = host`
- `registerClientForWorkspace(formData, hostInfo)` — creates user, creates client profile, creates `agency_client_relationship` row, sets attribution
- ✅ `createClientWorkspaceInquiryAction(formData)` — sets `inquiries.source_workspace_id` + `origin_domain`, validates selected talent against the workspace roster, and upserts the client relationship overlay.

**Schema (additive migration):**
- `ALTER TABLE inquiries ADD COLUMN source_workspace_id uuid NULL REFERENCES agencies(id);`
- `ALTER TABLE inquiries ADD COLUMN origin_domain text NULL;`
- `ALTER TABLE agency_talent_roster ADD COLUMN source_workspace_id uuid NULL REFERENCES agencies(id);` (audit which workspace the talent registered through)
- `ALTER TABLE agency_talent_roster ADD COLUMN origin_domain text NULL;`
- Same two columns on `agency_client_relationship`

### Phase 3.15 — Path-based public workspace on tulala.digital

**Status:** ✅ Implemented locally 2026-05-04. Middleware now resolves `/<workspaceSlug>` public storefront paths on hub/marketing hosts, plus localhost app-host QA. Public header/footer, CMS homepage sections, directory cards, profile CTAs, and legacy fallback homepage links preserve the path prefix so users do not fall out of the workspace context after the first click.

**Goal:** `tulala.digital/<slug>` renders the public storefront (works for Free plan that doesn't get a subdomain).

**Routes:**
- `tulala.digital/<workspaceSlug>` — agency public storefront (path-based)
- `tulala.digital/<workspaceSlug>/t/<talentSlug>` — agency-context talent profile (path-based)
- `tulala.digital/<workspaceSlug>/talent/register` — Free-plan branded registration?
  - Open question: Free plan path-based registration UX vs Studio+ subdomain UX
- `tulala.digital/<workspaceSlug>/client/register`

**Routing:**
- Marketing and hub hosts resolve `/<slug>`, `/<slug>/directory`, `/<slug>/models`, `/<slug>/p/*`, `/<slug>/posts/*`, `/<slug>/share/*`, `/<slug>/t/*`, `/<slug>/client/register`, `/<slug>/talent/register`, and `/<slug>/join`.
- Workspace paths (`/<slug>/admin`, `/<slug>/client`, `/<slug>/talent`) remain canonical app/branded portal routes and are not swallowed by the public path-stripper.
- Local QA: `localhost:3000/<slug>` also resolves the path-based public surface, without widening production app-host behavior.

**Files:**
- Modified: `web/src/lib/saas/surface-allow-list.ts` — path-based public slug recognizer.
- Modified: `web/src/middleware.ts` — resolves slug via public tenant resolver, strips prefix for public rendering, sets path-prefix request header.
- Modified: `web/src/lib/saas/host-context.ts` — public slug → tenant resolver with local DB fallback.
- New migration: `supabase/migrations/20260901204000_public_tenant_slug_resolver.sql`.
- Added link-prefix helpers/tests so tenant-context links remain under `/<slug>`.

### Phase 4 — Custom domain support

**Goal:** `<customdomain>.com/*` renders the full agency experience (storefront, admin, talent, client portals, registration).

**Schema (already exists):** `agency_domains` table maps host → tenant_id. Just add support for arbitrary domains (not subdomains of `tulala.digital`).

**Steps:**
1. Verification flow — agency owner adds their custom domain via workspace settings → server generates verification token → owner adds DNS TXT record → server polls → marks verified
2. Vercel domain provisioning — POST to Vercel API to add domain, get SSL automatically
3. Middleware host resolution — already host-based; just needs the domain in `agency_domains`
4. Surface allow-list — already permits agency surfaces on agency hosts
5. UI — workspace settings → "Domains" panel for managing custom domains (Agency+ only)

**Files:**
- New: `web/src/lib/saas/custom-domain-actions.ts` — verification + Vercel provisioning
- New: `web/src/app/(workspace)/[tenantSlug]/admin/workspace/domains/page.tsx`
- API routes: `/api/admin/domains/verify`, `/api/admin/domains/add`

### Phase 8 — Money + Trust (billing integration) — ✅ All four lanes shipped

**8.1 Workspace plan billing (Stripe)** ✅
- Stripe checkout + billing portal for workspace plan upgrades
- Webhook handler syncs `workspace_subscriptions` + `agencies.plan_tier`
- Files: `web/src/app/api/stripe/webhook/route.ts`, `web/src/lib/stripe/workspace-billing.ts`, `web/src/app/(workspace)/[tenantSlug]/admin/account/stripe-billing-actions.ts`

**8.2 Talent subscriptions (Pro / Portfolio)** ✅
- Stripe checkout + portal for `talent_pro` and `talent_portfolio` tiers
- Webhook syncs `talent_subscriptions` + `talent_profiles.talent_plan_key`
- Files: `web/src/lib/stripe/talent-billing.ts`, `web/src/app/(workspace)/[tenantSlug]/talent/settings/stripe-talent-actions.ts`

**8.3 Client trust ladder economics** ✅
- Verification fee ($5 one-time) + balance top-up presets ($100/$250/$500)
- Webhook syncs `client_trust_state` + `client_balance_ledger`, re-evaluates trust level
- Idempotency guarded on `stripe_payment_intent_id`; refund handler in place
- Files: `web/src/lib/stripe/client-billing.ts`, `web/src/app/(workspace)/[tenantSlug]/client/settings/stripe-client-trust-actions.ts`

**8.4 Agency exclusivity + commission / booking transactions** ✅
- `booking_transactions` table + payout account schema wired
- Transaction lifecycle actions: draft → payment_requested → pending → paid → payout_pending → payout_sent (+ cancel/refund/dispute)
- Payout receiver selection/change; receiver lock before paid states
- Commission calculated via `lib/bookings/commission.ts` (plan-tier → basis-points)
- Files: `web/src/lib/bookings/commission.ts`, `web/src/lib/bookings/transactions.ts`, `web/src/app/(workspace)/[tenantSlug]/admin/work/[id]/`

### Phase X — Workspace × Talent hybrid mode

Per `project_workspace_talent_hybrid.md` — talent can simultaneously own a workspace.

UI: top-nav Talent mode (personal) + left-sidebar Admin mode (workspace), with toggle.

Plan tier × role matrix defines what owners / coordinators / editors can do.

Real-world case: talent-turned-studio-owner who still takes occasional bookings.

Big lift, deferred.

---

## Part 3 — Foundation work (do alongside surfaces)

### F1 — Phase 2 capability migration (legacy callers → lib/access/)

**Status:** 27 legacy callers remain in `web/src/app/(dashboard)/*`.

**Action:** for each call site, swap:
- `hasPhase5Capability(...)` → `userHasCapability(...)` from `@/lib/access`
- `requirePhase5Capability(...)` → `requireCapability(...)` from `@/lib/access`
- `hasCapability(...)` from `@/lib/saas/capabilities` → same swap

Already-existing `lib/saas/capabilities.ts` and `lib/site-admin/capabilities.ts` become thin re-export shims with `@deprecated` JSDoc.

**Done when:** `git grep "hasPhase5Capability\|requirePhase5Capability"` matches only the deprecated re-export shims, parity test green, capability-keys check intact.

### F2 — Field catalog frontend cutover

**Status:** ✅ Reconciled locally 2026-05-04. Production workspace settings now reads `profile_field_definitions` through `loadFieldCatalog()` via `loadWorkspaceFieldCatalog()`. Remaining `_field-catalog.ts` imports are confined to the prototype shell.

**Verification:** `http://localhost:3000/impronta/admin/settings` → Fields tab renders DB-backed groups (Universal 11, Global 22, Type-Specific 146). `npm run typecheck`, focused lint, tenant isolation, and build passed in the Phase 3.15/F2 reconciliation pass.

### F3 — Inquiry source attribution migration

**Status:** schema and code don't carry source attribution today.

**Migration:**
```sql
ALTER TABLE inquiries
  ADD COLUMN source_workspace_id uuid NULL REFERENCES agencies(id),
  ADD COLUMN origin_domain text NULL;

CREATE INDEX inquiries_source_workspace_id_idx
  ON inquiries(source_workspace_id) WHERE source_workspace_id IS NOT NULL;

ALTER TABLE agency_talent_roster
  ADD COLUMN source_workspace_id uuid NULL REFERENCES agencies(id),
  ADD COLUMN origin_domain text NULL;

ALTER TABLE agency_client_relationship
  ADD COLUMN source_workspace_id uuid NULL REFERENCES agencies(id),
  ADD COLUMN origin_domain text NULL;
```

Backfill: existing rows get `source_workspace_id = tenant_id` (best guess).

Wire writes: every server action that creates an inquiry / talent registration / client registration sets these from the resolved host context.

### F4 — Phase 4 cleanup (delete legacy `(dashboard)/admin/*` per surface)

After each Phase 3 promotion verifies, delete the legacy equivalent under `(dashboard)/admin/<feature>/`. Add 308 redirect from legacy URL to new canonical URL. Delete hardcoded plan/role/capability strings.

When all surfaces are deleted: remove `(dashboard)/` route group entirely.

### F5 — Verification + documentation

After each phase:
1. `cd web && npx tsc --noEmit` clean
2. `cd web && npm run test:access` 13/13 green
3. `cd web && npm run check:capability-keys` registry intact
4. `node scripts/taxonomy-v2-qa-phase1.mjs` 20/20
5. `node scripts/taxonomy-v2-qa-phase2.mjs` 28/28
6. Manual smoke against Impronta live URLs (each branded surface added)
7. Legacy admin still works (until Phase 4 deletes per surface)

---

## Part 4 — Schema migrations needed (additive)

| Migration                                            | Phase    | Tables touched                                                                  |
|------------------------------------------------------|----------|---------------------------------------------------------------------------------|
| `inquiries.source_workspace_id + origin_domain`      | F3       | `inquiries`                                                                     |
| `agency_talent_roster source attribution`            | F3       | `agency_talent_roster`                                                          |
| `agency_client_relationship source attribution`      | F3       | `agency_client_relationship`                                                    |
| ~~Messages 3-thread model~~ *(obsolete — shipped as `inquiry_messages` + `inquiry_message_reads` instead)* | ~~3.4~~ | ~~`messages`, `message_threads`, `message_seen_by`~~ |
| Trust ladder                                         | 3.7      | `client_trust_tiers`, `talent_contact_policies`, `verification_requests`, etc.  |
| Talent monetization                                  | 8.2      | `talent_subscriptions`, `talent_distribution_channels`, `talent_manual_earnings`|
| Booking transactions + payout accounts               | 8.4      | `booking_transactions`, `payout_accounts`, `agency_commission_terms`            |
| Custom domain table extensions                       | 4        | `agency_domains.verification_token`, `verified_at`, `domain_kind`               |
| Workspace billing                                    | 8.1      | `agency_subscriptions`, `subscription_invoices`                                 |

**No DROP / RENAME / enum reshape until Phase 4 cleanup** (per `OPERATING.md` rule).

---

## Part 5 — Sequenced commit order (recommended)

1. ✅ **Phase 3.11** — Platform admin
2. ✅ **Phase 3.10** — Client self-dashboard (app-host canonical)
3. ✅ **F3** — Inquiry source attribution migration (`inquiries.source_workspace_id`, `origin_domain`)
4. ✅ **F3 follow-up** — Relationship source attribution on `agency_talent_roster` + `agency_client_relationships`
5. ✅ **Phase 3.7** — Trust badges + contact gate foundations
6. ✅ **F1** — Tenant-guard migration baseline (`requireStaffTenantAction` sweep + tenant-isolation green)
7. ✅ **Phase 8.4** — Booking transactions finalized (receiver/transition hardening + linked refund record + manual payout external note/reference)
8. ✅ **Phase 3.4** — Real-time messages reconciled to the locked two-thread inquiry model (`private` client thread + `group` talent thread) with realtime, optimistic send, RPC read watermarks, and true unread counts across workspace admin, client, and talent surfaces.
9. ✅ **Phase 3.12** — Branded admin shortcut on `<slug>.tulala.digital/admin` (middleware internal rewrite to canonical slug handlers)
10. ✅ **Phase 3.13** — Branded talent + client portals on agency subdomain (same middleware rewrite path)
11. ✅ **Phase 3.14** — Branded registration flows + `/join` alias (role-specific register pages, `/join`, branded onboarding intent, relationship/roster creation, portal-safe tenant resolution, public profile CTA handoff, and client `/inquiries/new` creation flow are wired)
12. ✅ **Phase 3.15** — Path-based public workspace on `tulala.digital/<slug>` (implemented with localhost QA support and path-prefix-safe public links)
13. ✅ **F2** — Field catalog frontend cutover (production settings reads `loadFieldCatalog()`; prototype constants remain prototype-only)
14. ⏳ **Phase 4 (custom domains)** — `<customdomain>.com/*` support
15. ⏳ **F4** — Per-surface deletion of legacy `(dashboard)/admin/*` after parity confirmation
16. ⏳ **Phase X** — Workspace × Talent hybrid mode (deferred, big lift)

---

## Part 6 — Decision register (open items)

| #  | Item                                                                           | Decision needed                                          |
|----|--------------------------------------------------------------------------------|----------------------------------------------------------|
| Q1 | Studio plan custom domain — add-on or no?                                      | Default: no (Agency+ only). Confirm.                     |
| Q2 | `/<slug>` path-based routing on `tulala.digital` — when does Free plan get a public storefront? | Phase 3.15. Confirm priority. |
| Q3 | Admin route on branded host: render branded vs redirect to app host?           | Recommend: render branded for trust. Confirm.            |
| Q4 | Free plan registration UX — path-based or no public registration?              | Open. Plan-tier × registration matrix needed.            |
| Q5 | Talent on multiple agencies — UI for switching branded contexts?               | Defer until Phase X (hybrid mode).                       |
| Q6 | Inquiry creation from `tulala.digital/t/<global>` — does it route to talent's exclusive agency or stay talent-owned? | Per `talent-monetization.md`: stays talent-owned. Confirm. |
| Q7 | Phase 3.10 client surface — capabilities map?                                  | `client.workspace.view`, `client.inquiry.create`, `client.booking.view`, `client.shortlist.manage`. Confirm. |

---

**This document is the source of truth for remaining build work.**
**Update it whenever a phase ships or a decision is taken.**
