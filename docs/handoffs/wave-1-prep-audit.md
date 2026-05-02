# Phase 0 — Wave 1 Prep Audit & Drift Resolution

**Status:** Phase 0 active. **Locked decisions captured 2026-05-01.**
**Author:** engineer (audit + recommendations); founder (decisions on D1–D7).
**Plan file:** `~/.claude/plans/ancient-gathering-sparkle.md` (canonical execution plan).

This document is the Phase 0 deliverable. Captures the drift-register findings discovered during ground-truth audit + the founder-ratified decisions on each. Phase 1 (real-data bridge) does not start until this doc + the freeze contract (`web/docs/admin-prototype/FREEZE.md`, next commit) are both committed.

---

## 1. Scope of this audit

Five concrete questions answered:

1. What is currently live and working from the prototype? **Nothing — pure mock, client-side only.**
2. What is the live admin's current state? **`web/src/app/(dashboard)/admin/*` runs against real Supabase, capability-gated, tenant-scoped.**
3. What's the status of `web/src/lib/access/`? **Dormant. 88 capability keys exist. Zero application callers.**
4. What product/architectural drifts exist between the prototype and the locked architecture? **Seven drifts (D1–D7 below).**
5. What's the safest first wiring move? **Real-data bridge for the workspace roster surface, opt-in via `?dataSource=live` URL flag.**

---

## 2. Drift register — D1 through D7

Each item has: current state, founder decision, action owner, target phase.

### D1 — Studio plan price

**Drift:** Prototype `web/src/app/prototypes/admin-shell/_state.tsx:170` says `$29 / month`. Locked architecture `web/src/lib/access/plan-catalog.ts` says `monthlyPriceCents: 4900` (i.e. `$49 / month`).

**Decision (founder, 2026-05-01):** **$49/month is canonical.** Prototype updates to match during Phase 0.

**Action:** during Phase 0 (or as part of Phase 1's first wiring), update prototype `planPrice()` and `planPriceCompact()` (lines 168–186 of `_state.tsx`) from `$29` → `$49`. Sweep any other Studio-pricing references in prototype.

### D2 — Public talent profile route

**Drift:** Prototype's mock route is `/share/talent/<slug>`. Locked architecture in `talent-monetization.md` §4 says canonical is `tulala.digital/t/<slug>`. The `/t/[profileCode]/page.tsx` route already exists in production and is partly v2-wired (reads `talent_languages` + `talent_service_areas`).

**Decision (founder, 2026-05-01):** **`/t/<slug>` is canonical.** `/share/talent/<slug>` is prototype-only mock.

**Action:** during Phase 4 cleanup, remove prototype's `/share/talent/<slug>` references. Phase 1 / 2 / 3 do not touch this — it's a mock route in prototype-land and harmless until cleanup.

### D3 — Prototype iteration tempo / freeze

**Drift:** Prototype received four polish commits within the past week:

```
93b46c4  docs(handoff): add §26 for the polish + bug-fix batch
11d8fa0  fix(prototype): scroll-lock recovery + black-CTA leak + talent profile polish
553ef8f  docs(prototype): handoff prep — sprint 2026-05-01 changes
5e0ce66  feat(prototype-shell): admin-shell modernization sprint
```

Promoting against a moving target wastes Phase 1 cycles.

**Decision (founder, 2026-05-01):** **Freeze the prototype now.** Most recent prototype-code commit is `11d8fa0`. Freeze contract committed in next commit (Commit 2 of Phase 0, `web/docs/admin-prototype/FREEZE.md`) with a `prototype-freeze-2026-05-01` git tag.

**Rule from freeze:** only bug-fix commits to `web/src/app/prototypes/admin-shell/*` until further notice; each must explicitly acknowledge the freeze in the commit message.

### D4 — `lib/access/` dormant vs legacy capability modules in production use

**Drift:** The new `web/src/lib/access/` module (88 capability keys, role + plan + status registries) has zero application callers. Grep confirms only its own parity test imports it. Production routes use legacy `lib/saas/capabilities.ts` (`hasCapability`, `requireCapability`) and `lib/site-admin/capabilities.ts` (`hasPhase5Capability`, `requirePhase5Capability`) at ≥12 call sites in `(dashboard)/admin/site-settings/*` and `(dashboard)/admin/fields/actions.ts`.

**Decision (founder, 2026-05-01):** **`lib/access/` becomes canonical before route promotion.** Phase 2 migrates legacy callers (mechanical, ~1 day). Legacy modules become thin re-exports pointing at `lib/access/`, marked `@deprecated`.

**Action:** Phase 2 work. Not Phase 1.

**Rationale:** with two permission systems alive, Phase 3 surface promotion would create divergence as the new shell wires through one path and the old admin enforces another. Migrating now keeps the codebase honest.

### D5 — Field catalog: migrations applied vs frontend constants

**Drift:** Profile field catalog migrations (`20260901120000` through `20260901120400`) are **already applied** on hosted Supabase — bringing the migration count to 198, not the 172 cited in earlier planning. Frontend still reads from `web/src/app/prototypes/admin-shell/_field-catalog.ts` constants.

**Decision (founder, 2026-05-01):** **Per-surface frontend cutover during Phase 3.** No big-bang. As each surface is promoted (Phase 3.1 onwards), it cuts over from `_field-catalog.ts` constants to `loadFieldCatalog(supabase)` from `web/src/lib/profile-fields-service.ts`.

**Action:** Phase 3 work, surface-by-surface.

### D6 — Plan/role/capability dialect alignment between prototype and backend

**Drift check:** prototype `_state.tsx` defines `Plan = "free" | "studio" | "agency" | "network"` (line 18), `Role = "viewer" | "editor" | "coordinator" | "admin" | "owner"` (line 19), and `WORKSPACE_PAGES` aligned to the 6-parent-page consolidation map. Backend `lib/access/plan-catalog.ts` + `lib/access/roles.ts` define identical values. Capability namespace in `lib/access/capabilities.ts` (88 keys) matches the ones used by `(dashboard)/admin/site-settings/*` callers.

**Decision (founder, 2026-05-01):** **No dialect drift detected.** Prototype and locked architecture use the same vocabulary. Phase 1+ wiring proceeds without renames.

**Caveat:** prototype's `WorkspacePage` enum has legacy aliases (`inbox`, `work`, `talent`, `site`, `billing`, `workspace`) that map to canonical names. Phase 3 surface promotion should resolve aliases to canonical values via the existing `resolveWorkspacePage()` helper.

### D7 — Prototype `/share/talent/<slug>` mock route

**Drift:** Prototype defines a `/share/talent/<slug>` URL pattern that doesn't correspond to any production route. The production canonical is `/t/<slug>` (per D2).

**Decision (founder, 2026-05-01):** **Prototype-only.** Remove from prototype during Phase 4 cleanup. No action in Phase 0–3.

---

## 3. Foundational rule (locked)

> **The prototype is the UX/design source of truth. The live admin/backend is the data/auth/tenant/source of truth. Each surface gets safely promoted from the prototype to canonical multi-tenant routes only after the bridge proves the design system can consume real data.**

This rule sits above the 5 phases. Every commit honors it.

Concretely:
- **No prototype edits during Phases 0–3** beyond bug fixes acknowledged in commit messages.
- **No legacy admin deletions** until Phase 4, and only per surface as the new replacement ships in the same commit.
- **No page-builder rewrites.** `web/src/components/edit-chrome/` is wrapped and integrated, not replaced (per `docs/page-builder-invariants.md`).
- **No two permission systems coexisting forever.** Phase 2 unifies before Phase 3 promotes.

---

## 4. Per-surface live-vs-mock matrix

Captured to identify the smallest, highest-leverage starting surface for Phase 1.

| Prototype surface | Mock state in prototype | Real-data path that would replace it | Live counterpart in production |
|---|---|---|---|
| **Workspace × 4 plans (Free / Studio / Agency / Network)** — 6 parent pages: Overview / Work / Talent / Clients / Site / Workspace | Fully mock. Drives off `MOCK_*`, `RICH_INQUIRIES`, `TALENT_BOOKINGS`, etc. in `_state.tsx`. URL params control plan + role + page + entityType + drawer + alsoTalent. | Per page: `agencies` + `agency_memberships` + `agency_talent_roster` + `talent_profiles` + `taxonomy_terms` + `inquiries` + `bookings` + `messages`. | `web/src/app/(dashboard)/admin/*` — 40+ subroutes, real Supabase reads, capability-gated. |
| **Talent surface** — 7 nav pages: Today / Messages / Profile / Calendar / Agencies / Public-page / Settings | Fully mock. `MOCK_TALENT_PROFILE`, `MOCK_TALENT_REQUESTS`, etc. | `talent_profiles` (own) + `talent_languages` + `talent_service_areas` + `talent_distribution_channels` (NEW) + `talent_manual_earnings` (NEW) + inquiries the talent is on + `talent_bookings` + conversations. | `web/src/app/(dashboard)/talent/*` exists. `/t/[profileCode]` (public) is **already partly v2-wired** (reads `talent_languages` + `talent_service_areas`). |
| **Client surface** — 7 nav pages: Today / Messages / Discover / Shortlists / Bookings / Notifications / Settings | Fully mock. | `client_profiles` + `inquiries` (own) + `bookings` + talent directory queries + favorites/shortlists. | `web/src/app/(dashboard)/client/*` exists as stubs. Client-trust ladder schema not yet applied (Wave 3 / `client-trust-and-contact-controls.md`). |
| **Platform (Tulala HQ)** — 7 nav pages: Today / Tenants / Users / Network / Billing / Operations / Settings | Fully mock. | Cross-tenant queries + `platform_audit_log` + identity-review queues + super_admin gate. | No live counterpart yet. New surface entirely. |

---

## 5. Recommended Phase 1 starting surface — workspace roster

**Why workspace roster:**
1. **Smallest schema scope.** A single join graph: `agency_talent_roster` → `talent_profiles` → `talent_profile_taxonomy` → `taxonomy_terms` (filtered to `relationship_type='primary_role'`) ←→ `talent_service_areas` (filtered to `service_kind='home_base'`).
2. **29 known live rows** for Impronta to validate against.
3. **Already partly v2-wired in production.** `web/src/app/t/[profileCode]/page.tsx` uses the same join shape. We're proving an existing read pattern works through the prototype UI — not inventing a new one.
4. **Highest validation density.** A single bridge function exercises taxonomy v2, service-areas v2, languages v2, and the `descendants_of()` recursive function in one read.
5. **Lowest blast radius.** No mutations. No capability changes. No route changes. No permission churn.

**What Phase 1 explicitly does NOT do:**
- Promote prototype routes to canonical multi-tenant URLs (Phase 3 work).
- Delete legacy admin (Phase 4 work).
- Migrate capability callers (Phase 2 work).
- Touch page builder internals (preserved per `page-builder-invariants.md`).
- Apply destructive migrations.

---

## 6. Phase 1 acceptance test

Repeated here so anyone reading this audit knows the bar.

**URL:** `https://impronta.tulala.digital/prototypes/admin-shell?surface=workspace&plan=agency&role=owner&entityType=agency&page=roster&dataSource=live`
(or `http://impronta.local:31xx/...` locally via `local-host-proxy`)

**User:** Impronta owner — `orantene@gmail.com`.

**Tenant:** Impronta — UUID `00000000-0000-0000-0000-000000000001`.

**Data expected:**
- 29 real talent rows
- Each row: real name + primary talent type from v2 `talent_profile_taxonomy.relationship_type='primary_role'` + home location from `talent_service_areas.service_kind='home_base'`
- Avatar: real photo URL or deterministic-tint initial fallback
- No `MOCK_*` strings appear in the rendered DOM

**Checks (all must pass):**
1. `cd web && npx tsc --noEmit` clean
2. `cd web && npm run test:access` 13/13 green
3. `cd web && npm run check:capability-keys` 88 keys
4. `node scripts/taxonomy-v2-qa-phase1.mjs` 20/20
5. `node scripts/taxonomy-v2-qa-phase2.mjs` 28/28
6. Open Phase 1 URL with `dataSource=live` → 29 real rows visible
7. Open same URL **without** `dataSource=live` → mock rows render unchanged
8. Open `https://impronta.tulala.digital/admin` (legacy) → unchanged
9. Open `https://impronta.tulala.digital/t/<any-real-impronta-talent-slug>` → public profile unchanged
10. Page builder editing flow on impronta storefront unchanged

---

## 7. Phase ordering recap

Captured here for cross-reference; full detail in `~/.claude/plans/ancient-gathering-sparkle.md`.

```
Phase 0 — Stabilization and truth audit (THIS DOC + freeze contract)
Phase 1 — Real-data bridge for workspace roster (opt-in dataSource=live)
Phase 2 — Capability unification (lib/access/ canonical)
Phase 3 — Route promotion begins (surface by surface)
Phase 4 — Replace old admin modules (delete-on-replacement)
```

Each phase has explicit acceptance criteria. Each surface in Phase 3 follows the same pattern Phase 1 establishes.

---

## 8. Cross-references

**Locked architecture (binding):**
- `docs/page-builder-invariants.md`
- `docs/talent-relationship-model.md`
- `docs/transaction-architecture.md`
- `docs/talent-monetization.md`
- `docs/client-trust-and-contact-controls.md`
- `docs/taxonomy-and-registration.md`
- `OPERATING.md` §12

**Prototype dev handouts:**
- `web/docs/admin-prototype/dev-handoff.md` — entry index
- `web/docs/admin-prototype/architecture.md`
- `web/docs/admin-prototype/production-handoff.md`
- `web/docs/admin-prototype/consolidation-map.md`
- `web/docs/admin-prototype/talent-backend-handoff.md`
- `web/docs/admin-prototype/TRUST.md`
- `web/docs/admin-prototype/MASTER_FIELD_CATALOG.md`
- `web/docs/admin-prototype/canonical-flow.json`
- `web/docs/admin-prototype/tokens.json`
- 21 more in the same directory

**Existing v2 work (live):**
- `docs/handoffs/taxonomy-v2-handoff-2026-04-30.md` — PR 1 shipped end-to-end
- `web/src/app/t/[profileCode]/page.tsx` — partly v2-wired live route
- 198 migrations applied (taxonomy v2 + profile field catalog)

**Live capability call sites (don't break in Phase 2):**
- `web/src/app/(dashboard)/admin/site-settings/identity/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/branding/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/design/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/navigation/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/pages/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/pages/[id]/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/pages/new/page.tsx`
- `web/src/app/(dashboard)/admin/site-settings/pages/actions.ts`
- `web/src/app/(dashboard)/admin/site/setup/homepage/page.tsx`
- `web/src/app/(dashboard)/admin/site/setup/theme/page.tsx`
- `web/src/app/(dashboard)/admin/fields/actions.ts`

---

## 9. Closing — what this commit delivers

**Phase 0 commit 1 (this commit):** drift register captured in writing. 7 drifts resolved by founder. No code changes. No prototype edits. No DB changes. No legacy admin touched.

**Phase 0 commit 2 (next):** prototype freeze contract + git tag. Freezes against `11d8fa0` (most recent prototype-code commit).

**Phase 1 commit (after both):** real-data bridge for workspace roster. Single new file `web/src/app/prototypes/admin-shell/_data-bridge.ts`. Single touchpoint in `_state.tsx` to read `?dataSource=live`. Single conditional swap in roster page renderer. Acceptance test as §6.

The bridge proves the pattern. Other surfaces follow. The legacy admin keeps running.
