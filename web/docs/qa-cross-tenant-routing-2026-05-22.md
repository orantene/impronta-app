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

## CRITICAL — RLS infinite recursion (RESOLVED 2026-05-22)

**Status: fixed.** `infinite recursion detected in policy for relation
"talent_profiles"` (Postgres `42P17`) was failing **every authenticated read**
of `talent_profiles` / `agency_talent_roster`, and by extension `inquiries`
and `inquiry_participants` (their talent-participant SELECT policies subquery
`talent_profiles`).

Root cause: migration `20260522061318_talent_public_visibility.sql` (applied to
the shared/production Supabase but **not committed to `main`** — another
agent's uncommitted work) rewrote the `talent_select_public` policy to
inline-subquery `agency_talent_roster`. That table already has
`agency_talent_roster_talent_self_read` (migration `20260606100000`) which
inline-subqueries `talent_profiles`. The two policies referenced each other →
Postgres re-entered RLS on every hop → abort.

Blast radius observed in the dev server: workspace roster, calendar, bookings,
media, overview metrics, talent self-profile, **and inquiry-list reads**.

Fix: `supabase/migrations/20260925000000_fix_talent_rls_recursion.sql` moves
the roster check into a `SECURITY DEFINER` function so `talent_select_public`
no longer re-enters `agency_talent_roster` RLS. Same semantics, breaks every
cycle. It also re-asserts `talent_profiles.is_publicly_hidden` with
`ADD COLUMN IF NOT EXISTS` so it builds from scratch on `main` despite the
un-merged drift migration.

- **Applied to the remote/production DB** (recorded as `20260925000000`).
- **Merged to `main`** alongside this report.
- **Verified:** as an `authenticated` role carrying the test user's JWT,
  `talent_profiles` (27 rows), `agency_talent_roster` (56) and `inquiries`
  (13) all read cleanly — no `42P17`.

Note for the integrator: the drift migrations `20260522061318` and
`20260924000000` are applied to remote but not on `main`; they should be
committed to `main` by their owning agents so the migration history matches
the live DB.

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
- **Live RLS check** (post-fix): with the test user's JWT as the
  `authenticated` role, `inquiries` returns exactly **13** rows across
  exactly **2** tenants — Impronta (12) + Morena Studio (1), the two
  workspaces she belongs to. None of the 3 other test tenants leak through.
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
- **RLS infinite recursion** (above) — **RESOLVED**: fix migration
  `20260925000000` applied to the remote DB and merged to `main`.

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

## Not yet verified in-browser
The RLS recursion that blocked it is now fixed, so these are unblocked for a
follow-up pass (they were not re-run in this session after the fix landed):
in-browser workspace/admin/talent dashboards, inquiry-list cards, message
surfaces, read/unread state, mobile-viewport layout. The underlying routing,
isolation, thread fan-out and notification generation are all verified above
at the engine + DB layer.

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

---

# Phase 2 — Billing & Commission QA (2026-05-22)

## Direct answers

- **Does commission resolve correctly per tenant?** The math does, but the
  pipeline was **completely dead** — see the critical bug below. After the
  fix it resolves correctly.
- **Does commission differ by plan tier (Impronta agency vs Morena free)?**
  No — and that is **by design**. The platform take is a ratified flat 5%
  for every tier (`platform_commission_config.plan_tier_bps = {}`; decision
  log §11.2 explicitly defers tier discounts to Phase Z). The Free-vs-Agency
  commission difference is operational — a Free "friend-link" workspace
  prices its offer line items at `talent_cost = unit_price` so the workspace
  lane is $0; the platform still takes 5%. It is not a config-driven rate.
- **Is per-row owning-party honored for commission?** Commission is one
  snapshot per booking, keyed off `agency_bookings.tenant_id` (= the
  inquiry's tenant). Correct for every current (single-tenant) inquiry. The
  per-row `owning_party` frozen on `inquiry_participants` is **not** read by
  the commission engine — only relevant for the future Discover D5
  multi-owning-party fan-out, which is not live. Documented as a future gap.

## 🔴 CRITICAL bug found + fixed — commission pipeline was 100% dead

`engine_load_commission_context` (the RPC that feeds the resolver) was
written against two columns that do not exist:

| RPC referenced | Actual column |
|---|---|
| `agency_bookings.inquiry_id` | `agency_bookings.source_inquiry_id` |
| `agencies.plan` | `agencies.plan_tier` |

plpgsql resolves column names at run time, not `CREATE` time — so the RPC
deployed clean (in `20260513075408`, on `main`) and threw `42703` on **every
call**. `persistBookingCommissionSnapshot` catches that as a non-fatal
`context_load_failed`, so bookings were created with **no commission
snapshot, ever**. Confirmed in production data: 1 booking exists, 0 rows in
`booking_commission_snapshot`. Platform-fee capture, the 3-lane split, and
off-platform accrual have never run since the engine shipped (2026-05-13).

**Fixed:** `supabase/migrations/20260926000000_fix_commission_context_rpc_columns.sql`
re-creates the RPC with the correct column names (body otherwise identical).
Applied to the remote DB and merged to `main`.

## What was verified (post-fix, all in ROLLBACK transactions — nothing persisted)

1. **Context loader** — `engine_load_commission_context` now returns
   well-formed JSON for a real booking: `tenant_id`, `workspace_plan`
   (correctly read from `plan_tier`), `platform_config`, and
   `offer_line_items` with cents conversion.
2. **3-lane split** — a $1000 booking ($850 talent cost) resolves to
   platform $50 (5%) + workspace $150 + talent $800; the three lanes sum to
   gross. Verified by the pure resolver against the live platform config and
   by persisting a real `booking_commission_snapshot` row.
3. **Payment-path branching** — on-platform `card` writes only the snapshot;
   off-platform `cash` additionally writes a `platform_commission_movements`
   `accrual` row ($50) and bumps `platform_commission_balances` for the
   tenant. Both verified end-to-end.
4. **Plan tiers** — Impronta (`agency`) and Morena Studio (`free`) both
   resolve to the same 5% platform take (`resolved_from: platform_default`),
   confirming the ratified flat-rate design.

## Issues found (billing)

### Important
- **Commission test files are orphaned from CI.** `commission.test.ts`
  (22 resolver unit tests) is a Vitest file, but the Vitest config `include`
  is `test/**/*.test.tsx` — a `src/**/*.test.ts` file is never collected.
  The `commission*.characterization.test.ts` files are `node:test` files but
  are not in the `ci` script either. The bug above would have been caught by
  a single real-schema integration test; none runs. Recommend wiring a
  commission test into `ci`.

### Future
- Per-row owning-party commission (Discover D5 cross-tenant fan-out): the
  engine produces one snapshot per booking keyed off the booking tenant. A
  multi-owning-party inquiry would need per-participant commission. Not a
  current bug — no live multi-tenant inquiry.

## Billing gates
- `commission.test.ts` (resolver units) — 22/22 (run via temp Vitest config)
- `commission.characterization.test.ts` + `commission-engine.characterization.test.ts` — pass
- end-to-end pipeline probes (context → persist → off-platform accrual) — pass

## Stopped before
Live-money / Stripe Connect verification — Stripe is test-mode and Dashboard
config is deferred (`pending_stripe_live_money_testing.md`). Resolver math,
RPC wiring, snapshot + ledger writes verified; no live charges attempted.
