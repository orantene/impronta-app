# QA Report — Cross-Tenant Inquiry & Message Routing (2026-05-22)

Branch `qa/cross-tenant-routing` off `origin/main` (`ef14231a3`). Worktree
`impronta-xtenant-qa`. Test identity: `more@impronta.test` — talent on the
Impronta roster, **Manager** of Impronta (`00000000-…-0001`), **Owner** of
the Free workspace Morena Studio (`e886a518-…-da26`).

## Direct answers

- **Does cross-tenant routing work?** Yes. Every inquiry's `tenant_id` is
  resolved from a server-trusted source and frozen onto the row, its
  participants, and its messages. Verified end-to-end into **both** tenants.
- **Are workspace badges clear?** Yes, structurally. The whole app is
  route-scoped per tenant (`/[tenantSlug]/…`); the workspace identity is the
  shell, and talent inquiry cards additionally show "via {agencyName}". There
  is no cross-tenant aggregated surface that could show a context-free card.
  One minor copy bug found (see below).
- **Any isolation leaks?** None. Across the entire DB, 0 participants and 0
  messages have a `tenant_id` differing from their parent inquiry.

## CRITICAL BLOCKER — RLS infinite recursion (production-affecting)

`infinite recursion detected in policy for relation "talent_profiles"`
(Postgres `42P17`) fails **every authenticated read** of `talent_profiles` /
`agency_talent_roster`, and by extension `inquiries` and
`inquiry_participants` (their talent-participant SELECT policies subquery
`talent_profiles`).

Root cause: migration `20260522061318_talent_public_visibility.sql` (created
today, **applied to the shared/production Supabase**, **not committed to
`origin/main`** — another agent's uncommitted work) rewrote the
`talent_select_public` policy to inline-subquery `agency_talent_roster`. That
table already has `agency_talent_roster_talent_self_read` (migration
`20260606100000`) which inline-subqueries `talent_profiles`. The two policies
now reference each other → Postgres re-enters RLS on every hop → abort.

Blast radius observed in the dev server: workspace roster, calendar, bookings,
media, overview metrics, talent self-profile, **and inquiry-list reads**.

Fix delivered (NOT applied — needs Oran's go-ahead, it is a production DB
change): `supabase/migrations/20260925000000_fix_talent_rls_recursion.sql`
moves the roster check into a `SECURITY DEFINER` function so
`talent_select_public` no longer re-enters `agency_talent_roster` RLS. Same
semantics, breaks every cycle. Apply with `npm run db:push` (or
`npm run migrate:apply`).

This blocked all in-browser QA of the workspace/admin/talent UI. Routing,
isolation and thread fan-out below were verified at the engine + DB layer
with a service-role client (bypasses RLS).

## What was verified

### 1. Owning-tenant resolution at `submitInquiry` (code audit)
All four entry paths resolve the inquiry `tenant_id` from a server-trusted
source — the client never picks the tenant:
- **Public directory** — `getPublicTenantScope()` (UUID-validated header set
  by middleware from a verified host/path). Roster-gated by
  `assertAllTalentOnTenantRoster`.
- **Logged-in client form** — `getTenantPortalScopeBySlug(routeSlug)`.
  Roster-gated.
- **Talent-profile request** — `hostCtx.tenantSlug` for the agency host the
  visitor is on → `createInquiryFromIntent`. (Note: this path does **not**
  roster-gate — see Important issues.)
- **Admin manual** — `tenantId` from the admin's authenticated workspace
  scope; routes through `createInquiryFromIntent`.

`submitInquiry` requires `tenant_id` and fails closed (`tenant_required`)
when absent. The owning-**party** resolver (`resolveOwningPartiesForTalents`)
is separate and freezes per-talent commission/routing party onto
`inquiry_participants`.

### 2. Engine routing into both tenants (live DB harness)
`web/scripts/qa-xtenant-engine.mts` called `submitInquiry` for both tenants:

| Case | inquiry.tenant_id | participants.tenant_id | talent owning_party |
|---|---|---|---|
| Impronta directory_client + talent=More | Impronta ✓ | Impronta ✓ | `(workspace, Impronta)` ✓ |
| Impronta admin manual | Impronta ✓ | Impronta ✓ | — |
| Morena directory_client + Morena talent | Morena ✓ | Morena ✓ | `(workspace, Morena)` ✓ |

owning_party = `workspace` for both is correct: More is `is_primary=false`
on Impronta; Morena is a Free-tier workspace (Free is excluded from the
exclusive-agency tiers). A 4th submission returned `rate_limited` — expected
engine behavior (guest cap 3/hr, in-process limiter).

### 3. Thread fan-out
Each inquiry's auto-ack system message (`inquiry_messages`) carries
`tenant_id` identical to its inquiry's `tenant_id` — Impronta messages →
Impronta, Morena message → Morena. `target_owning_party_*` is null
(single-tenant inquiry; correct — fan-out targeting is for Discover
cross-tenant rows).

### 4. Tenant isolation
- `inquiries_tenant_staff` policy = `is_staff_of_tenant(tenant_id)`
  (SECURITY DEFINER) → staff scoped to their own tenant.
- App code filters `.eq("tenant_id", tenantId)` on every admin inquiry query
  (defence in depth).
- Global DB leak check: **0** participants and **0** messages with a
  `tenant_id` differing from their parent inquiry.
- `npm run test:tenant-isolation`: 25/26 pass (the 1 failure —
  `surface-allow-list` `/api/directory` on the `app` host — is pre-existing
  on `origin/main`, already fixed in commit `94837ba74` ahead of it,
  unrelated to inquiry routing).

### 5. Notification / email routing
The post-submit notification path generated the correct per-tenant content
("Your inquiry to **Impronta Models** is received" / "…**Morena Studio**…")
and correctly **skipped delivery** — `RESEND_API_KEY` is unset
(`[email] RESEND_API_KEY not set — skipping email`). Auto-ack system message
fired into the private thread for all three inquiries. Delivery NOT claimed.

## Issues found

### Critical
- **RLS infinite recursion** (above). Blocks the workspace/admin/talent UI.
  Fix migration delivered, not applied.

### Important
- **Talent-profile inquiry path is not roster-gated.** The public directory
  and logged-in client form both call `assertAllTalentOnTenantRoster`;
  the `/t/[profileCode]` → `InquiryDrawer` → `createInquiryFromIntent` path
  does not. On an agency host a client could inquire about a talent not on
  that agency's roster and the inquiry would still be created under that
  agency's tenant. Not a cross-tenant *leak* (tenant is still correct for the
  host), but it lets an off-roster talent be attached. Recommend gating the
  intent submit path the same way.

### Minor / future
- **`_real-identity-banner.tsx`** hardcodes the word `talento` in the English
  render (`{rosterTotal} talento`) — should be "talent" in EN. Also observed a
  `STUDIO` plan chip for Morena Studio whose `plan_tier` is `free` (expected
  `FREE`). The banner is explicitly marked for deletion, so low priority.
- **`conversation-adapter-1.tsx`** falls back to the generic string
  `"Agency"` when `bridgeTalentSelfProfile.agencyName` is null — a
  context-free label on talent inquiry cards. Prefer the route tenant's
  display name.

## Could NOT verify (blocked by the RLS recursion)
- In-browser workspace/admin/talent dashboards, inquiry-list cards, message
  surfaces, read/unread state, mobile-viewport layout. All require RLS-bound
  reads of `talent_profiles` / `inquiries`. Re-run once the fix migration is
  applied.

## Test data left in the DB (QA artifacts)
3 inquiries with `contact_name` prefixed `QAX-1779460891359` — 2 in Impronta,
1 in Morena Studio (ids in `web/.qa-xtenant-ids.json`). Harmless
`submitted`-status rows; left in place rather than hard-deleting. Safe to
delete.

## Gates
- `npx tsc --noEmit` — CLEAN
- `test:inquiry-workspace` — 10/10
- engine submit / owning-party / cross-tenant unit tests — 42 pass, 2 skipped
- `test:tenant-isolation` — 25/26 (1 pre-existing unrelated failure)
