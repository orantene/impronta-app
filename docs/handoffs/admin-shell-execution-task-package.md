# Admin-shell promotion — Execution Task Package

**Audience:** any developer (junior, mid, senior) picking up implementation work without prior context.
**Pairs with:** `~/.claude/plans/ancient-gathering-sparkle.md` (canonical 5-phase plan), `docs/handoffs/wave-1-prep-audit.md` (Phase 0 drift audit), `web/docs/admin-prototype/FREEZE.md` (prototype freeze contract).
**Last updated:** 2026-05-02.

> Implementation-level. Not strategy. Every card lists files, types, tables, capabilities, QA commands, and a definition-of-done a developer can verify on their own machine.

**Quick reference:**
- Prototype freeze hash: `11d8fa0` (tag `prototype-freeze-2026-05-01`)
- Canonical QA tenant: Impronta (`00000000-0000-0000-0000-000000000001`) at `https://impronta.tulala.digital`
- Canonical QA owner: `orantene@gmail.com`
- Canonical access module (Phase 2 makes wired): `web/src/lib/access/` — 88 keys, 8 plans, 5 roles
- Test commands (run from `web/`): `npx tsc --noEmit`, `npm run test:access`, `npm run check:capability-keys`, `node ../scripts/taxonomy-v2-qa-phase1.mjs`, `node ../scripts/taxonomy-v2-qa-phase2.mjs`

---

## Table of contents

1. [Phase 1 — Real-data bridge](#phase-1--real-data-bridge)
2. [Phase 2 — Capability unification](#phase-2--capability-unification)
3. [Phase 3 — Surface-by-surface route promotion](#phase-3--surface-by-surface-route-promotion)
4. [Shared architecture extraction plan](#shared-architecture-extraction-plan)
5. [Stop-the-line conditions](#stop-the-line-conditions)
6. [First 10 executable tasks](#first-10-executable-tasks)

---

# Phase 1 — Real-data bridge

**Goal:** prove the prototype design system can render live Impronta data without breaking mock mode. Smallest blast radius, highest validation-per-byte. Single surface (workspace roster).

**Approved architecture (founder, 2026-05-02):** Server Component wrapper + initial-data prop. NOT an API route, server action, client-side Supabase call, or service-role query.

**Forbidden touches across all Phase 1 tasks:**
- `web/src/app/(dashboard)/admin/*` (legacy admin)
- `web/src/middleware.ts`
- `web/src/components/edit-chrome/*` (page builder)
- `web/src/lib/access/*`, `web/src/lib/saas/capabilities.ts`, `web/src/lib/site-admin/capabilities.ts`
- `web/src/app/t/[profileCode]/*` (public profile)
- Database schema (Phase 1 is read-only against existing tables)

---

### Task P1.1 — Convert prototype `page.tsx` to server-component wrapper

**Owner level:** mid
**Estimated complexity:** S (½ day)

**Goal:** make the route entry a server component so it can pre-fetch live data via `getTenantScope()` + Supabase SSR client. Move the existing client tree to a sibling file.

**Files touched:**
- `web/src/app/prototypes/admin-shell/page.tsx` — REWRITE (was `"use client"`, becomes server component, ~50 lines)
- `web/src/app/prototypes/admin-shell/_shell-client.tsx` — NEW (the entire previous content of `page.tsx`, with two edits: rename default export to named export `AdminShellPrototypePageClient`; accept optional `initialBridgeData` prop and pass to `<ProtoProvider>`).

**Files forbidden:** every file outside `web/src/app/prototypes/admin-shell/*`. No middleware, no capability modules, no legacy admin, no public routes, no DB.

**Implementation steps:**
1. `git mv web/src/app/prototypes/admin-shell/page.tsx web/src/app/prototypes/admin-shell/_shell-client.tsx` — preserves rename in git history.
2. In `_shell-client.tsx`, add a type-only import: `import type { BridgeData } from "./_data-bridge";` (Task P1.2 creates that file).
3. Convert `export default function AdminShellPrototypePage()` to `export function AdminShellPrototypePageClient({ initialBridgeData = null }: { initialBridgeData?: BridgeData | null } = {})`.
4. Pass the prop through to `<ProtoProvider initialBridgeData={initialBridgeData}>` (Task P1.3 wires the receiving end).
5. Create new `page.tsx` (NO `"use client"`):

   ```ts
   import { AdminShellPrototypePageClient } from "./_shell-client";
   import {
     loadWorkspaceRosterForCurrentTenant,
     type BridgeData,
   } from "./_data-bridge";

   type SearchParams = Promise<Record<string, string | string[] | undefined>>;

   function readDataSource(v: string | string[] | undefined): "live" | "mock" {
     if (Array.isArray(v)) return readDataSource(v[0]);
     return v === "live" ? "live" : "mock";
   }

   export default async function AdminShellPrototypeRoute({
     searchParams,
   }: {
     searchParams: SearchParams;
   }) {
     const params = await searchParams;
     const dataSource = readDataSource(params.dataSource);
     let initialBridgeData: BridgeData | null = null;
     if (dataSource === "live") {
       const roster = await loadWorkspaceRosterForCurrentTenant();
       initialBridgeData = { roster };
     }
     return <AdminShellPrototypePageClient initialBridgeData={initialBridgeData} />;
   }
   ```

**Diff boundaries:**
- `git diff --stat HEAD -- 'web/src/app/prototypes/admin-shell/page.tsx' 'web/src/app/prototypes/admin-shell/_shell-client.tsx'` should show one rename + one small file (page.tsx ~50 lines).
- Nothing under `web/src/app/(dashboard)/`, `web/src/middleware.ts`, `web/src/components/edit-chrome/`, or `web/src/lib/access/` should change.

**Data contract:** `searchParams.dataSource ∈ {undefined, "mock", "live"}`. Anything else falls through as mock.

**TypeScript types:**
- `BridgeData` (defined in Task P1.2): `{ roster: TalentProfile[] | null }`. `null` = "live mode not requested, use mock". `[]` = "live mode requested, no data — render empty state, NOT mock".

**Database tables involved:** none directly. Bridge does the queries (Task P1.2).

**Capability checks involved:** none in Phase 1. RLS at the database is the only gate.

**QA commands:**
- `cd web && npx tsc --noEmit` — must be clean.

**Manual smoke:**
- `https://impronta.tulala.digital/prototypes/admin-shell?surface=workspace&plan=agency&role=owner&entityType=agency&page=roster` (no `dataSource`) → existing 7 mock rows from `ROSTER_AGENCY`.
- Same URL with `&dataSource=live` → 29 real Impronta rows (after Task P1.2 + P1.3).

**Rollback plan:** `git revert <commit>` — single commit, atomic. The rename is the largest part of the diff but content-equivalent.

**Definition of done:**
- typecheck clean, mock URL renders unchanged.
- The new `page.tsx` is a server component (no `"use client"` directive).
- `_shell-client.tsx` exports `AdminShellPrototypePageClient` as a named export accepting `initialBridgeData?: BridgeData | null`.

**Dependencies:** none — this is the entry task. P1.2 and P1.3 land in the same commit.

---

### Task P1.2 — Build `_data-bridge.ts` (server-only)

**Owner level:** mid (with Supabase familiarity) or senior
**Estimated complexity:** M (~1 day including QA)

**Goal:** the single doorway through which live Impronta data enters the prototype tree. Server-side, RLS-gated, no service role, returns DTOs shaped exactly like the prototype's existing `TalentProfile` mock type.

**Function signature (locked):**
```ts
export async function loadWorkspaceRosterForCurrentTenant(): Promise<TalentProfile[]>
```

**Decision:** the bridge calls `getTenantScope()` internally. The function does NOT take a `tenantId` parameter. Tenant resolution lives entirely behind the bridge boundary so call sites cannot accidentally pass a wrong id. **Do not introduce both patterns.**

**Files touched:**
- `web/src/app/prototypes/admin-shell/_data-bridge.ts` — NEW

**Files forbidden:** everything outside the prototype tree (no edits to `lib/saas`, `lib/access`, middleware, schema, etc. — just *imports* of `getTenantScope`, `createClient`, `logServerError`).

**Implementation contract:**
1. First line: `import "server-only";` — guards against accidental client-side import.
2. Type-only import of `TalentProfile`: `import type { TalentProfile } from "./_state";` — `_state.tsx` is `"use client"`, runtime import would be wrong.
3. Imports:
   ```ts
   import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
   import { getTenantScope } from "@/lib/saas/scope";
   import { logServerError } from "@/lib/server/safe-error";
   ```
4. Export the `BridgeData` type:
   ```ts
   export type BridgeData = { roster: TalentProfile[] | null };
   ```
5. Implement `loadWorkspaceRosterForCurrentTenant()` with the exact logic below.

**Exact SQL/join shape (Supabase JS query builder syntax):**
```ts
supabase
  .from("agency_talent_roster")
  .select(`
    status,
    agency_visibility,
    talent_profile_id,
    talent_profiles:talent_profile_id (
      id,
      display_name,
      first_name,
      last_name,
      workflow_status,
      height_cm,
      cover_photo_url,
      talent_profile_taxonomy (
        is_primary,
        taxonomy_terms ( kind, slug )
      )
    )
  `)
  .eq("tenant_id", scope.tenantId)
  .neq("status", "removed")
  .order("created_at", { ascending: true });
```

**Selected columns + reasoning:**
- `agency_talent_roster.status` — drives `awaiting-approval` lifecycle state.
- `agency_talent_roster.agency_visibility` — selected but not yet used in Phase 1 (kept for future filter).
- `talent_profiles.display_name`, `first_name`, `last_name` — name fallback chain.
- `talent_profiles.workflow_status` — drives `published` / `draft` / `invited` lifecycle.
- `talent_profiles.height_cm` — converted to imperial label `5'9"` to match mock format.
- `talent_profiles.cover_photo_url` — roster card thumb.
- `talent_profile_taxonomy.is_primary` + `taxonomy_terms.kind/slug` — primary talent type chip.

**Mapping helpers (pure functions, defined in same file):**
- `deriveProfileState(row): TalentProfile["state"]` — see contract below.
- `deriveDisplayName(profile): string` — `display_name → first+last → "Unnamed talent"`.
- `derivePrimaryType(profile): string | undefined` — first `taxonomy_terms.slug` where `is_primary && kind='talent_type'`.
- `deriveHeightLabel({height_cm}): string | undefined` — cm → `${feet}'${inches}"`.

**State mapping rule (conservative — anything ambiguous falls to `draft`):**

| Supabase signal | Prototype `state` |
|---|---|
| `roster.status='pending'` | `awaiting-approval` |
| `roster.status='active'` AND `profile.workflow_status='published'` | `published` |
| `profile.workflow_status='draft'` | `draft` |
| `profile.workflow_status='invited'` | `invited` |
| anything else | `draft` (safe default — never falsely shows "published") |

**Error handling:**
- Wrap the entire body in try/catch.
- On `getTenantScope()` returning null → return `[]`. (Anonymous, no membership, or tampered cookie — fail-hard logged inside `getTenantScope`, no need to re-log here.)
- On `createSupabaseServerClient()` returning null → return `[]`. (Env not configured.)
- On query error → `logServerError("admin-shell-prototype.loadWorkspaceRoster", error); return [];`.
- On any thrown exception → same `logServerError` + `[]`.
- **Never** silently substitute mock data. The contract is "live mode failed → empty state".

**Return type:** `Promise<TalentProfile[]>` — exact prototype mock type, nothing new.

**Database tables involved (read-only):**
- `agency_talent_roster` (RLS: tenant isolation by membership)
- `talent_profiles` (global table, joined via FK)
- `talent_profile_taxonomy` (FK to talent_profile_id)
- `taxonomy_terms` (joined via FK)

**Capability checks involved:** none. RLS handles tenant isolation. The user's session (signed in as Impronta owner) gives them SELECT on their own tenant's roster rows.

**QA commands:**
- `cd web && npx tsc --noEmit` — clean.
- `node scripts/taxonomy-v2-qa-phase1.mjs` — must remain 20/20 (we touch no taxonomy state).
- `node scripts/taxonomy-v2-qa-phase2.mjs` — must remain 28/28.

**Manual smoke:**
- Hit the live URL with `dataSource=live` (after P1.3 wires the consumer); count rows in the rendered roster — must be 29. Compare visible names against the canonical Impronta talent list.

**Rollback plan:** delete `_data-bridge.ts`. Server `page.tsx` will fail to compile until P1.1's import is removed. Roll back P1.1 + P1.3 together.

**Definition of done:**
- File compiles. `import "server-only"` guard intact.
- `loadWorkspaceRosterForCurrentTenant()` returns `[]` for anonymous request, full roster for Impronta owner.
- No service-role client imported anywhere in this file.

**Dependencies:** none — but P1.1 imports from this file, so they land in the same commit.

---

### Task P1.3 — Wire bridge data into `ProtoProvider`

**Owner level:** mid
**Estimated complexity:** S (½ day)

**Goal:** thread the `initialBridgeData` prop from server through `ProtoProvider`, expose `effectiveRoster` on context, and make the workspace roster surface read it without breaking mock mode.

**Files touched:**
- `web/src/app/prototypes/admin-shell/_state.tsx` — small edit (~30 lines added):
  - Type-only import of `BridgeData`.
  - `Ctx` type gains two fields: `bridgeRoster: TalentProfile[] | null`, `effectiveRoster: TalentProfile[]`.
  - `ProtoProvider` accepts optional `initialBridgeData?: BridgeData | null`, default `null`.
  - Inside provider: `const bridgeRoster = initialBridgeData?.roster ?? null; const effectiveRoster = useMemo(() => bridgeRoster ?? getRoster(plan), [bridgeRoster, plan]);`
  - Both fields added to the `value` memo and to its dependency array.
- `web/src/app/prototypes/admin-shell/_pages.tsx` — 2 call site swaps:
  - Line ~3036 (`OverviewFree`): `const liveRoster = getRoster(state.plan);` → `const liveRoster = state.effectiveRoster;` (read from `useProto()`).
  - Line ~4918 (`TalentPage`): `const roster = getRoster(state.plan);` → `const roster = state.effectiveRoster;`.

**Files forbidden:** every file outside the prototype tree.

**Implementation steps:**
1. Edit `_state.tsx`:
   - Add `import type { BridgeData } from "./_data-bridge";` at the top.
   - Inside the `Ctx` type definition (closes around line 7772 after Phase 0), append two fields with JSDoc.
   - Update `ProtoProvider` signature to accept `initialBridgeData?: BridgeData | null`.
   - Compute `bridgeRoster` and `effectiveRoster` near the bottom of the provider, just before the `useMemo<Ctx>`.
   - Add both to the value object and to the deps array.
2. Edit `_pages.tsx`:
   - Find the two `getRoster(state.plan)` call sites.
   - Replace with `state.effectiveRoster` (already destructured from `useProto()` in both functions).

**Data contract:**
- `bridgeRoster === null` → mock-mode default. `effectiveRoster === getRoster(plan)`.
- `bridgeRoster !== null` (even `[]`) → live-mode. `effectiveRoster === bridgeRoster`.

**TypeScript types:**
```ts
// inside Ctx
bridgeRoster: TalentProfile[] | null;
effectiveRoster: TalentProfile[];
```

**Database tables involved:** none — this task only touches client-side state shape.

**Capability checks involved:** none.

**QA commands:**
- `cd web && npx tsc --noEmit` — clean.
- `cd web && npm run test:access` — 13/13 (we don't touch access).
- `cd web && npm run check:capability-keys` — 88 keys.
- `node scripts/taxonomy-v2-qa-phase1.mjs` — 20/20.
- `node scripts/taxonomy-v2-qa-phase2.mjs` — 28/28.

**Manual smoke (the Phase 1 acceptance test):**
1. Open `https://impronta.tulala.digital/prototypes/admin-shell?surface=workspace&plan=agency&role=owner&entityType=agency&page=roster` — see existing 7 mock rows.
2. Same URL with `&dataSource=live` — see 29 real Impronta rows. Names recognizable.
3. Open `https://impronta.tulala.digital/admin` — legacy admin renders unchanged.
4. Open `https://impronta.tulala.digital/t/<any-real-impronta-slug>` — public profile unchanged.
5. Edit a CMS page on the Impronta storefront — page builder unchanged.
6. Sign out → load `?dataSource=live` — empty state renders (no auth → no scope → bridge returns `[]`). Mock mode (no flag) still renders unchanged for anonymous.

**Failure modes that BLOCK the commit:**
- typecheck fails.
- Mock-mode URL shows different rows than before.
- Live mode silently shows mock data when scope is null.
- Legacy admin or public `/t/<slug>` regresses.
- Any file outside `web/src/app/prototypes/admin-shell/*` shows in `git diff --stat`.

**Rollback plan:** revert the commit. Three-file edit, atomic.

**Definition of done:**
- All 6 manual smokes pass.
- All 5 QA commands pass.
- `git diff --stat` shows only the 4 files in `web/src/app/prototypes/admin-shell/`.

**Dependencies:** P1.1 + P1.2 — same commit.

---

### Task P1.4 — Final acceptance + push

**Owner level:** any (author of P1.1–P1.3)
**Estimated complexity:** XS (~1 hour)

**Goal:** verify all gates and push to `phase-1` so Vercel deploys a preview against `impronta.tulala.digital`.

**Steps:**
1. From `web/`, run all 5 QA commands (typecheck, test:access, check:capability-keys, taxonomy phase 1, taxonomy phase 2). All must pass.
2. Verify staging discipline: `git diff --cached --stat` lists ONLY the 4 expected prototype files. Nothing in `(dashboard)`, `lib/`, `middleware.ts`, `t/`, `components/edit-chrome/`.
3. Commit with message:
   ```
   feat(phase-1): real-data bridge for workspace roster

   Server Component wrapper at admin-shell/page.tsx pre-fetches live
   Impronta roster when ?dataSource=live and passes it as
   initialBridgeData into the existing client shell. Mock mode is the
   default and unchanged. Bridge runs under user RLS (no service role).
   ```
4. `git push origin phase-1`.
5. Vercel preview builds. Promote with `vercel promote <preview-url> --yes` only after manual smoke confirms 29 rows.

**Definition of done:**
- Pushed.
- Preview promoted.
- Manual smoke at `impronta.tulala.digital/prototypes/admin-shell?…&dataSource=live` shows 29 rows.

---

# Phase 2 — Capability unification

**Goal:** make `web/src/lib/access/` the single permission system. Migrate ~12 application call sites + ~9 internal `lib/site-admin/server/*` call sites away from `hasPhase5Capability` / `requirePhase5Capability` (legacy `lib/site-admin/capabilities.ts`) and `hasCapability` / `requireCapability` (legacy `lib/saas/capabilities.ts`).

**Pre-requisite:** Phase 1 must be shipped + accepted. Phase 2 cannot start before Phase 1's acceptance test passes.

**Forbidden touches:**
- Schema changes (none needed).
- Behaviour changes (this is a parity migration — same gates, single registry).
- Prototype tree (`web/src/app/prototypes/admin-shell/*` is frozen until Phase 3).

---

## Phase 2 caller migration map

**Application callers (must migrate, ordered by directory):**

| # | File | Current helper | Current key | Target `lib/access/` key | Mapping | Risk | Test required |
|---|------|---------------|-------------|---------------------|---------|------|---------------|
| 1 | `web/src/app/(dashboard)/admin/site/setup/homepage/page.tsx:35` | `hasPhase5Capability` | `agency.site_admin.homepage.compose` | `agency.site_admin.homepage.compose` | exact (parity) | low | smoke as Impronta owner — homepage setup loads |
| 2 | `web/src/app/(dashboard)/admin/site/setup/theme/page.tsx:38` | `hasPhase5Capability` | `agency.site_admin.design.edit` | `agency.site_admin.design.edit` | exact | low | smoke — theme setup loads |
| 3 | `web/src/app/(dashboard)/admin/site/setup/theme/page.tsx:39` | `hasPhase5Capability` | `agency.site_admin.design.publish` | `agency.site_admin.design.publish` | exact | low | smoke — publish button visible to owner, hidden to viewer |
| 4 | `web/src/app/(dashboard)/admin/fields/actions.ts:60` | `hasCapability` (lib/saas) | `manage_field_catalog` | `manage_field_catalog` | exact | low | smoke — Field Catalog editable by owner |
| 5 | `web/src/app/(dashboard)/admin/site-settings/identity/page.tsx:35` | `hasPhase5Capability` | `agency.site_admin.identity.edit` | `agency.site_admin.identity.edit` | exact | low | smoke — identity drawer editable |
| 6 | `web/src/app/(dashboard)/admin/site-settings/navigation/page.tsx:65` | `hasPhase5Capability` | `agency.site_admin.navigation.edit` | `agency.site_admin.navigation.edit` | exact | low | smoke — navigation editable |
| 7 | `web/src/app/(dashboard)/admin/site-settings/navigation/page.tsx:66` | `hasPhase5Capability` | `agency.site_admin.navigation.publish` | `agency.site_admin.navigation.publish` | exact | low | smoke — publish gated |
| 8 | `web/src/app/(dashboard)/admin/site-settings/design/page.tsx:78` | `hasPhase5Capability` | `agency.site_admin.design.edit` | `agency.site_admin.design.edit` | exact | low | smoke — design editable |
| 9 | `web/src/app/(dashboard)/admin/site-settings/design/page.tsx:79` | `hasPhase5Capability` | `agency.site_admin.design.publish` | `agency.site_admin.design.publish` | exact | low | smoke — publish gated |
| 10 | `web/src/app/(dashboard)/admin/site-settings/branding/page.tsx:35` | `hasPhase5Capability` | `agency.site_admin.branding.edit` | `agency.site_admin.branding.edit` | exact | low | smoke — branding editable |
| 11 | `web/src/app/(dashboard)/admin/site-settings/pages/page.tsx:86` | `hasPhase5Capability` | `agency.site_admin.pages.edit` | `agency.site_admin.pages.edit` | exact | low | smoke — pages list editable |
| 12 | `web/src/app/(dashboard)/admin/site-settings/pages/actions.ts:443` | `requirePhase5Capability` | `agency.site_admin.pages.edit` | `agency.site_admin.pages.edit` | exact | low | smoke — page save action |
| 13 | `web/src/app/(dashboard)/admin/site-settings/pages/[id]/page.tsx:32` | `hasPhase5Capability` | `agency.site_admin.pages.edit` | `agency.site_admin.pages.edit` | exact | low | smoke — page editor loads |
| 14 | `web/src/app/(dashboard)/admin/site-settings/pages/[id]/page.tsx:33` | `hasPhase5Capability` | `agency.site_admin.pages.publish` | `agency.site_admin.pages.publish` | exact | low | smoke — publish gated |
| 15 | `web/src/app/(dashboard)/admin/site-settings/pages/new/page.tsx:21` | `hasPhase5Capability` | `agency.site_admin.pages.edit` | `agency.site_admin.pages.edit` | exact | low | smoke — new page form |
| 16 | `web/src/app/(dashboard)/admin/site-settings/pages/new/page.tsx:22` | `hasPhase5Capability` | `agency.site_admin.pages.publish` | `agency.site_admin.pages.publish` | exact | low | smoke — publish gated |

**Internal callers inside `lib/site-admin/server/*` (also migrate so the legacy module is a pure re-export):**

| # | File | Helper | Keys | Risk |
|---|------|--------|------|------|
| 17 | `lib/site-admin/server/identity.ts:177` | `requirePhase5Capability` | `agency.site_admin.identity.edit` | low — server action |
| 18-22 | `lib/site-admin/server/homepage.ts:393, 569, 822, 1111` (×4) | `requirePhase5Capability` | `agency.site_admin.homepage.compose` | low — server actions |
| 23-27 | `lib/site-admin/server/pages.ts:283, 441, 519, 656, 744` (×5) | `requirePhase5Capability` | `agency.site_admin.pages.edit/publish` | low — server actions |
| 28-31 | `lib/site-admin/server/navigation.ts:121, 220, 286, 342` (×4) | `requirePhase5Capability` | `agency.site_admin.navigation.edit/publish` | low — server actions |
| 32+ | `lib/site-admin/server/design.ts` (multiple) | `requirePhase5Capability` | `agency.site_admin.design.edit/publish` | low — server actions |

**Total:** ~32+ call sites. All map 1:1 to existing keys in `lib/access/capabilities.ts` (88 keys, audit confirmed).

---

### Task P2.1 — Migrate `(dashboard)/admin/site-settings/*` callers

**Owner level:** mid
**Estimated complexity:** M (~½ day)

**Goal:** rewrite imports + calls in 9 files in `site-settings/*`. Same behaviour, single registry.

**Files touched:** items #5–#16 in the table above.

**Files forbidden:** lib/access internals, lib/saas internals (just consume), prototype tree.

**Implementation steps:**
1. In each file, replace:
   ```ts
   import { hasPhase5Capability } from "@/lib/site-admin";
   // → 
   import { userHasCapability } from "@/lib/access/has-capability";
   ```
2. Replace each call:
   ```ts
   const ok = await hasPhase5Capability("agency.site_admin.X.Y", scope.tenantId);
   // →
   const ok = await userHasCapability("agency.site_admin.X.Y", { tenantId: scope.tenantId });
   ```
   (Confirm exact `userHasCapability` signature in `lib/access/has-capability.ts` before migrating; second arg shape may differ slightly.)
3. For `requirePhase5Capability` → `requireCapability` from `lib/access`:
   ```ts
   import { requireCapability } from "@/lib/access";
   await requireCapability("agency.site_admin.pages.edit", { tenantId });
   ```

**Capability checks involved:** all 9 site-settings keys + the homepage + theme keys.

**QA commands:**
- `cd web && npx tsc --noEmit`
- `cd web && npm run test:access` — 13/13.
- `cd web && npm run check:capability-keys` — 88 keys.

**Manual smoke (sign in as Impronta owner):**
- Visit each migrated page, confirm it loads + edit affordances appear.
- Sign in as a non-staff user → confirm 403 / hidden affordances.

**Rollback plan:** revert the commit. One commit per directory keeps blast radius small.

**Definition of done:**
- `git grep "hasPhase5Capability" web/src/app/(dashboard)/admin/site-settings/` returns nothing.
- All site-settings pages load for owner, are gated for non-staff.

**Dependencies:** none — but P2.0 (parity verification) should confirm 88-key registry first.

---

### Task P2.2 — Migrate `(dashboard)/admin/fields/actions.ts`

**Owner level:** junior (with review)
**Estimated complexity:** XS (~30 min)

**Goal:** swap `hasCapability` (lib/saas) → `userHasCapability` (lib/access).

**Files touched:** `web/src/app/(dashboard)/admin/fields/actions.ts`.

**Implementation:** mechanical import + call swap. See P2.1 pattern.

**Manual smoke:** Field Catalog edit action runs as Impronta owner; non-staff blocked.

**Definition of done:** typecheck + smoke pass.

---

### Task P2.3 — Migrate `(dashboard)/admin/site/setup/*` callers

**Owner level:** mid
**Estimated complexity:** S (~1 hour)

**Goal:** items #1–#3 in the table.

**Files touched:** `homepage/page.tsx`, `theme/page.tsx` under `web/src/app/(dashboard)/admin/site/setup/`.

**Implementation:** P2.1 pattern.

---

### Task P2.4 — Migrate `lib/site-admin/server/*` internal callers

**Owner level:** senior (touches server-action code paths)
**Estimated complexity:** M (~1 day)

**Goal:** ~16 internal callers in `identity.ts`, `homepage.ts`, `pages.ts`, `navigation.ts`, `design.ts`. Each is a server action; behaviour parity is critical because these run on form submission, not just page render.

**Files touched:**
- `web/src/lib/site-admin/server/identity.ts`
- `web/src/lib/site-admin/server/homepage.ts`
- `web/src/lib/site-admin/server/pages.ts`
- `web/src/lib/site-admin/server/navigation.ts`
- `web/src/lib/site-admin/server/design.ts`

**Implementation:** P2.1 pattern, but for `requirePhase5Capability` → `requireCapability` from `@/lib/access`.

**Manual smoke (must run all):**
- Edit + save Impronta identity (display name change). Confirm save persists.
- Edit + publish a homepage section (page-builder draft → publish). Confirm publish persists.
- Edit + publish a CMS page.
- Edit + publish navigation.
- Edit + publish design tokens.
- Each as Impronta owner. Then sign in as non-staff → confirm each save action returns 403.

**Definition of done:**
- `git grep "requirePhase5Capability" web/src/lib/site-admin/server/` returns nothing.
- All 5 publish actions verified end-to-end.

---

### Task P2.5 — Convert legacy modules to deprecated re-exports

**Owner level:** senior
**Estimated complexity:** S (~½ day)

**Goal:** `lib/saas/capabilities.ts` and `lib/site-admin/capabilities.ts` become thin deprecated re-exports. Imports stay valid; new code uses `lib/access/` directly.

**Files touched:**
- `web/src/lib/saas/capabilities.ts` — replace body with `export { userHasCapability as hasCapability, requireCapability } from "@/lib/access";` plus `@deprecated` JSDoc.
- `web/src/lib/site-admin/capabilities.ts` — same pattern: `export { userHasCapability as hasPhase5Capability, requireCapability as requirePhase5Capability } from "@/lib/access";`.
- `web/src/lib/site-admin/index.ts` — preserve named exports.

**Definition of done:**
- Two files <30 lines each, 100% re-export.
- All previously-migrated callers (P2.1–P2.4) still compile + smoke pass.
- `npm run test:access` 13/13.

**Files forbidden:** any net behaviour change.

**Rollback plan:** revert. The previous capabilities.ts implementations exist in git history.

---

### Task P2.6 — Verify zero non-deprecated usage of legacy helpers

**Owner level:** any
**Estimated complexity:** XS (~15 min)

**Goal:** prove the migration is complete.

**Steps:**
1. `git grep "hasPhase5Capability\|requirePhase5Capability"` — should match only the deprecated re-export lines in `lib/site-admin/capabilities.ts` and `lib/site-admin/index.ts`.
2. `git grep "from \"@/lib/saas/capabilities\""` — should be 0 matches outside `lib/saas/`.
3. `git grep "from \"@/lib/site-admin/capabilities\""` — should be 0 matches outside `lib/site-admin/`.

**Definition of done:** all three greps return only the expected internal references.

---

### Phase 2 deletion timing

| Step | When |
|------|------|
| Migrate callers (P2.1–P2.4) | This phase |
| Convert legacy modules to re-exports (P2.5) | This phase, last commit |
| **Delete legacy modules** | **Phase 4** — after Phase 3 promotion is complete and no `(dashboard)/admin/*` survives. Same commit as the last legacy admin route deletion. |

**Why not delete now:** other code paths (page builder server modules, structured logging, audit trail) may still pass through the deprecated helpers. Phase 4 is the safe deletion point.

---

# Phase 3 — Surface-by-surface route promotion

**Goal:** promote prototype surfaces to canonical multi-tenant URLs. Each surface = one focused commit. Each surface follows the same shape: bridge (Phase 1 pattern) → server-component wrapper → client tree from prototype → delete legacy in same commit.

**Pre-requisite:** Phase 2 must be shipped + accepted. Phase 3 cannot start before `lib/access/` is canonical.

**Target route structure:**
- `app.tulala.digital/[tenantSlug]/admin/*` — workspace surface
- `app.tulala.digital/talent/*` — talent self
- `app.tulala.digital/client/*` — client self
- `app.tulala.digital/platform/admin/*` — platform super_admin
- `tulala.digital/t/<slug>` — public talent page (already partly live)

**Universal acceptance pattern per surface:**
1. typecheck + parity tests + capability-keys check pass.
2. Surface renders against Impronta live data.
3. Legacy equivalent under `(dashboard)/admin/*` deleted in same commit (per `OPERATING.md` removal policy).
4. Public `/t/<slug>` and page builder smoke unchanged.

---

## Workspace surfaces

### Card W1 — Workspace Overview

| Field | Value |
|---|---|
| **Prototype source** | `web/src/app/prototypes/admin-shell/_pages.tsx` (`OverviewFree`, `OverviewAgency`, etc.) |
| **Current live route** | `web/src/app/(dashboard)/admin/page.tsx` |
| **Target route** | `web/src/app/(workspace)/[tenantSlug]/admin/page.tsx` |
| **Data needed** | Roster count, published count, inquiry count, team count, pending approvals count, activation tasks |
| **Existing tables** | `agency_talent_roster`, `talent_profiles`, `inquiries`, `agency_memberships`, `talent_profile_claims` |
| **New tables** | none |
| **Server loaders** | `loadOverviewMetricsForCurrentTenant()` in `_data-bridge.ts` (extends Phase 1 pattern) |
| **Server actions** | none (read-only surface) |
| **Capability checks** | `agency.workspace.view` (gates the page) |
| **Drawers involved** | `addTalent`, `inviteClient`, `inviteTeam`, `upgrade` |
| **Mock variables to replace** | `ROSTER_FREE`, `ROSTER_AGENCY`, `INQUIRIES_FREE`, `INQUIRIES_AGENCY`, `TEAM_FREE`, `TEAM_AGENCY` |
| **Legacy to delete same commit** | `web/src/app/(dashboard)/admin/page.tsx` and any `_overview.tsx` partials |
| **Page builder impact** | none |
| **Acceptance** | Owner sees real Impronta counts on `app.tulala.digital/impronta/admin`. Non-staff see 403. |
| **Rollback** | revert the commit |

---

### Card W2 — Workspace Roster / Talent

| Field | Value |
|---|---|
| **Prototype source** | `_pages.tsx::TalentPage` (line ~4910) |
| **Current live route** | `web/src/app/(dashboard)/admin/talent/page.tsx` and `[id]/page.tsx` |
| **Target route** | `(workspace)/[tenantSlug]/admin/roster/page.tsx`, `roster/[id]/page.tsx` |
| **Data needed** | Full roster (Phase 1 already wired via `loadWorkspaceRosterForCurrentTenant`); per-talent overlay; agency_talent_overlays |
| **Existing tables** | `agency_talent_roster`, `talent_profiles`, `talent_profile_taxonomy`, `taxonomy_terms`, `talent_service_areas`, `talent_languages`, `agency_talent_overlays`, `talent_profile_claims` |
| **New tables** | none (Phase 1 schema sufficient) |
| **Server loaders** | extend `_data-bridge.ts` with `loadRosterDetailForTenant(talentId)` |
| **Server actions** | `inviteTalent`, `editOverlay`, `removeFromRoster`, `setVisibility` (port from `(dashboard)/admin/talent/actions.ts`) |
| **Capability checks** | `agency.roster.view`, `agency.roster.edit`, `agency.roster.invite`, `agency.roster.remove` |
| **Drawers involved** | `talentProfile`, `inviteTalent`, `bulkImport`, `editOverlay`, `representations` |
| **Mock variables to replace** | `ROSTER_FREE`, `ROSTER_AGENCY`, `PENDING_TALENT` |
| **Legacy to delete same commit** | `(dashboard)/admin/talent/*` (entire directory) |
| **Page builder impact** | none |
| **Acceptance** | 29 Impronta talents render with full filters working; talent profile drawer pulls real data; legacy `/admin/talent` 308-redirects to new route. |
| **Rollback** | revert |

---

### Card W3 — Workspace Work / Inquiries

| Field | Value |
|---|---|
| **Prototype source** | `_pages.tsx::WorkspaceWork`, `_workspace.tsx::InquiryWorkspaceDrawer` |
| **Current live route** | `(dashboard)/admin/inquiries/*` |
| **Target route** | `(workspace)/[tenantSlug]/admin/work/page.tsx` |
| **Data needed** | Inquiries scoped to tenant; status pipeline; coordinator assignments; offer line items |
| **Existing tables** | `inquiries`, `inquiry_messages`, `inquiry_offers`, `inquiry_line_items`, `coordinator_assignments` |
| **New tables** | none |
| **Server loaders** | `loadInquiriesForCurrentTenant(filters)` |
| **Server actions** | `createInquiry`, `assignCoordinator`, `sendOffer`, `acceptOffer`, `convertToBooking` |
| **Capability checks** | `agency.work.view`, `agency.work.assign`, `agency.work.send_offer`, `agency.work.create_booking` |
| **Drawers involved** | `inquiryWorkspace`, `requirementGroup`, `offerEditor`, `coordinatorPicker` |
| **Mock variables to replace** | `RICH_INQUIRIES`, `INQUIRIES_FREE`, `INQUIRIES_AGENCY` |
| **Legacy to delete same commit** | `(dashboard)/admin/inquiries/*` |
| **Page builder impact** | none |
| **Acceptance** | Real Impronta inquiries render in pipeline; offer flow works end-to-end; coordinator assignment persists. |
| **Rollback** | revert |

---

### Card W4 — Workspace Clients

| Field | Value |
|---|---|
| **Prototype source** | `_pages.tsx::ClientsPage` |
| **Current live route** | `(dashboard)/admin/clients/*` |
| **Target route** | `(workspace)/[tenantSlug]/admin/clients/page.tsx` |
| **Data needed** | Client list scoped to tenant; trust badges (per `client-trust-and-contact-controls.md`); per-client booking history |
| **Existing tables** | `clients`, `client_verifications`, `bookings` |
| **New tables** | trust ledger if not already (`verification_requests`, `profile_verifications`, `profile_claims`, `verification_method_configs`) |
| **Server loaders** | `loadClientsForCurrentTenant()`, `loadClientTrustSummary(clientId)` |
| **Server actions** | `inviteClient`, `verifyClient`, `revokeVerification`, `setContactGate` |
| **Capability checks** | `agency.clients.view`, `agency.clients.invite`, `agency.clients.verify`, `agency.clients.contact_gate.edit` |
| **Drawers involved** | `clientProfile`, `verificationRequest`, `contactGateEditor` |
| **Mock variables to replace** | `CLIENTS_FREE`, `CLIENTS_AGENCY`, `MOCK_VERIFICATIONS`, `MOCK_TRUST_SUMMARIES` |
| **Legacy to delete same commit** | `(dashboard)/admin/clients/*` |
| **Page builder impact** | none |
| **Acceptance** | Trust badges render correctly per client tier; gate toggles persist. |
| **Rollback** | revert |

---

### Card W5 — Workspace Site / Page Builder

| Field | Value |
|---|---|
| **Prototype source** | `_pages.tsx::SitePage` (just the shell — page builder is the existing live system) |
| **Current live route** | `(dashboard)/admin/site-settings/*` (10+ subpages) |
| **Target route** | `(workspace)/[tenantSlug]/admin/site/*` (preserves the page builder routes verbatim — wraps, doesn't rewrite) |
| **Data needed** | Identity, branding, theme, navigation, pages, redirects, domains — all already wired in `lib/site-admin/server/*` |
| **Existing tables** | `agency_business_identity`, `agency_branding`, `agency_design_tokens`, `agency_navigation`, `agency_pages`, `agency_redirects`, `agency_domains` |
| **New tables** | none |
| **Server loaders** | already exist (`getAgencyIdentity`, `getDesignTokens`, etc.) |
| **Server actions** | already exist (`saveIdentity`, `publishHomepage`, `savePage`, etc.) — Phase 2 already migrated capability gates |
| **Capability checks** | `agency.site_admin.identity.edit/publish`, `.branding.edit/publish`, `.design.edit/publish`, `.navigation.edit/publish`, `.pages.edit/publish`, `.homepage.compose` |
| **Drawers involved** | identity drawer, branding drawer, theme drawer, page editor (the drawer-style page editor inside the page builder), redirects drawer |
| **Mock variables to replace** | none — entire site surface is already real |
| **Legacy to delete same commit** | `(dashboard)/admin/site-settings/*` directory |
| **Page builder impact** | **DO NOT REWRITE** `web/src/components/edit-chrome/*`. Wrap it in the new shell. Per `page-builder-invariants.md`, the canvas IS the storefront in edit mode; route promotion preserves the existing inspector + token-registry contract. |
| **Acceptance** | Edit + publish a homepage section, a CMS page, identity, navigation, design tokens — all work identically to before. Smoke against Impronta. |
| **Rollback** | revert |

---

### Card W6 — Workspace Settings (Workspace tab)

| Field | Value |
|---|---|
| **Prototype source** | `_pages.tsx::WorkspaceSettings` (multi-tab — team, plan/billing, taxonomy, fields, integrations) |
| **Current live route** | `(dashboard)/admin/team/*`, `(dashboard)/admin/billing/*`, `(dashboard)/admin/fields/*` (split across multiple routes) |
| **Target route** | `(workspace)/[tenantSlug]/admin/workspace/page.tsx` (single tabbed page consolidates) |
| **Data needed** | Memberships, plan, taxonomy enabled set, custom fields, audit log |
| **Existing tables** | `agency_memberships`, `agency_plan`, `agency_taxonomy_settings` (NEW — additive in Phase 3), `agency_custom_fields`, `agency_audit_log` |
| **New tables** | `agency_taxonomy_settings`, `talent_constraints` |
| **Server loaders** | `loadWorkspaceSettings()`, `loadAuditLog(filters)` |
| **Server actions** | `inviteTeamMember`, `changeRole`, `removeMember`, `changePlan`, `setTaxonomyEnabled`, `addCustomField`, `removeCustomField` |
| **Capability checks** | `agency.team.invite/edit/remove`, `agency.plan.upgrade/cancel`, `agency.taxonomy.edit`, `agency.custom_fields.edit`, `agency.audit_log.view` |
| **Drawers involved** | `inviteTeam`, `changeRole`, `planPicker`, `customFieldEditor`, `taxonomyPicker` |
| **Mock variables to replace** | `TEAM_FREE`, `TEAM_AGENCY`, `MOCK_AUDIT`, custom fields mocks |
| **Legacy to delete same commit** | `(dashboard)/admin/team/*`, `(dashboard)/admin/billing/*`, `(dashboard)/admin/fields/*` |
| **Page builder impact** | none |
| **Acceptance** | Each tab loads + writes; audit log shows real entries. |
| **Rollback** | revert |

---

## Talent surfaces

> Each card below targets `app.tulala.digital/talent/<page>`. Talent is **not** tenant-scoped at the URL level — it's user-scoped. `getCurrentTalentProfile()` resolves the talent's profile via `auth.users.id → talent_profiles`.

### Card T1 — Talent Today

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentToday` |
| **Current live route** | `(dashboard)/talent/today/page.tsx` (if exists) |
| **Target route** | `(talent)/today/page.tsx` |
| **Data needed** | Pending inquiries, upcoming bookings, today's calendar, location signal |
| **Existing tables** | `inquiries`, `bookings`, `talent_availability`, `talent_service_areas` |
| **Server loaders** | `loadTalentTodayDashboard()` |
| **Capability checks** | `talent.surface.view` |
| **Drawers involved** | many — `inquiryWorkspace`, `availability`, `firstSession` |
| **Mock variables** | `TALENT_BOOKINGS`, `TALENT_INQUIRIES`, `MOCK_AVAILABILITY` |
| **Acceptance** | Dashboard shows real signals; pending count matches inbox |

### Card T2 — Talent Inbox

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentInbox` (line ~? — Inbox section) |
| **Current live route** | none (talent inbox is new) |
| **Target route** | `(talent)/inbox/page.tsx` |
| **Data needed** | Threads, messages, AI reply suggestions, voice transcripts |
| **Existing tables** | `messages`, `seen_by` (additive in Phase 3.4) |
| **New tables** | `messages`, `seen_by`, `inquiry_message_threads` |
| **Server loaders** | `loadTalentInbox()`, `loadThread(id)` |
| **Server actions** | `sendMessage`, `markRead`, `useAiReply` |
| **Capability checks** | `talent.inbox.view`, `talent.inbox.send`, `talent.inbox.ai_reply` |
| **Drawers involved** | `aiReplyAssistant`, `voiceReply`, `attachFile` |
| **Mock variables** | `MOCK_CONVERSATIONS`, `MOCK_MESSAGES` |
| **Real-time** | Yes — Supabase Realtime channel scoped to thread |
| **Acceptance** | Real-time message append works; AI reply produces 3 variants |

### Card T3 — Talent Calendar

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentCalendar` |
| **Current live route** | none |
| **Target route** | `(talent)/calendar/page.tsx` |
| **Data needed** | Booking events, availability blocks, pending inquiries on calendar |
| **Existing tables** | `bookings`, `talent_availability_blocks` (NEW additive) |
| **New tables** | `talent_availability_blocks` |
| **Server loaders** | `loadTalentCalendar(rangeStart, rangeEnd, view)` |
| **Server actions** | `addAvailabilityBlock`, `removeBlock`, `confirmBooking` |
| **Capability checks** | `talent.calendar.view`, `talent.calendar.edit` |
| **Drawers involved** | `availabilityBlock`, `bookingDetail`, `pendingInquiryDrawer` |
| **Mock variables** | calendar events mocks |
| **Acceptance** | Month/week/day views render; availability persists |

### Card T4 — Talent Reach

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentReach` |
| **Current live route** | none |
| **Target route** | `(talent)/reach/page.tsx` |
| **Data needed** | Distribution channels (agencies, hubs), pause states, pro-tier value preview |
| **Existing tables** | `agency_talent_roster`, `hub_talent_roster`, `talent_distribution_channels` (NEW additive) |
| **New tables** | `talent_distribution_channels`, `talent_channel_events` |
| **Server loaders** | `loadTalentReachChannels()` |
| **Server actions** | `pauseChannel`, `unpauseChannel`, `requestRepresentation`, `removeFromAgency` |
| **Capability checks** | `talent.reach.view`, `talent.reach.pause`, `talent.reach.upgrade_pro` |
| **Drawers involved** | `agencyDetail`, `hubDetail`, `pauseConfirm`, `proValueModal` |
| **Mock variables** | reach mocks |
| **Acceptance** | Pause toggles persist; trust-impact preview accurate |

### Card T5 — Talent Profile (edit)

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentProfileEditor` |
| **Current live route** | `(dashboard)/talent/profile-editor` (if exists) |
| **Target route** | `(talent)/profile/page.tsx` |
| **Data needed** | Talent profile fields (cover, bio, services, languages, taxonomy, fields, claims) |
| **Existing tables** | `talent_profiles`, `talent_profile_taxonomy`, `talent_languages`, `talent_service_areas`, `field_values`, `field_definitions` |
| **Server loaders** | already exist (`fetchTalentProfile`, `fetchTalentLanguages`, `fetchTalentServiceAreas`) |
| **Server actions** | many edit actions (port from existing dashboard talent editor) |
| **Capability checks** | `talent.profile.edit`, `talent.profile.publish` |
| **Drawers involved** | many — language editor, service areas, taxonomy picker, field editor, photo uploader |
| **Mock variables** | profile mocks |
| **Acceptance** | Edits persist; publish flips visibility |

### Card T6 — Talent Activity

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentActivity` |
| **Current live route** | none |
| **Target route** | `(talent)/activity/page.tsx` |
| **Data needed** | Earnings, payouts, reviews, milestones, forecast |
| **Existing tables** | `bookings`, `booking_transactions`, `talent_manual_earnings` (NEW), `talent_celebration_events` (NEW), `talent_reviews` |
| **New tables** | `talent_manual_earnings`, `talent_celebration_events` |
| **Server loaders** | `loadTalentActivity()`, `loadEarningsForecast()` |
| **Server actions** | `addManualEarning`, `requestPayout`, `dismissCelebration` |
| **Capability checks** | `talent.activity.view`, `talent.activity.manual_earnings`, `talent.activity.payouts` |
| **Drawers involved** | `payoutSetup`, `manualEarning`, `taxDocs`, `celebrationDetail` |
| **Mock variables** | activity mocks |
| **Acceptance** | Forecast tile shows real numbers; payout setup completes |

### Card T7 — Talent Settings

| Field | Value |
|---|---|
| **Prototype source** | `_talent.tsx::TalentSettings` |
| **Current live route** | none |
| **Target route** | `(talent)/settings/page.tsx` |
| **Data needed** | Notification preferences, privacy gates, contact policy, network plan, tax docs, support |
| **Existing tables** | `talent_notification_preferences`, `talent_contact_policy`, `talent_payout_accounts` |
| **New tables** | possibly `talent_notification_preferences` |
| **Server actions** | `updateNotifications`, `updateContactPolicy`, `setActiveAgency` |
| **Capability checks** | `talent.settings.view`, `talent.settings.contact_policy`, `talent.settings.notifications` |
| **Drawers involved** | many |
| **Acceptance** | Preferences persist |

---

## Client surfaces

> `app.tulala.digital/client/<page>`. Client surface is user-scoped, not tenant-scoped — clients can have inquiries with multiple workspaces.

### Card C1 — Client Discover

| Field | Value |
|---|---|
| **Prototype source** | `_client.tsx::ClientDiscover` |
| **Current live route** | `(public)/directory` partly serves this; needs auth-gated personalized version |
| **Target route** | `(client)/discover/page.tsx` |
| **Data needed** | Public talent directory with personalized re-ranking + saved searches |
| **Existing tables** | `talent_profiles`, `talent_profile_taxonomy`, `taxonomy_terms`, `client_saved_searches` (additive) |
| **New tables** | `client_saved_searches`, `client_shortlists` |
| **Server loaders** | reuse existing `lib/directory/fetch-directory-page.ts` |
| **Capability checks** | `client.discover.view` (always true for authenticated clients) |
| **Acceptance** | Filters persist across sessions |

### Card C2 — Client Inquiries

| Field | Value |
|---|---|
| **Prototype source** | `_client.tsx::ClientInquiries` |
| **Current live route** | none |
| **Target route** | `(client)/inquiries/page.tsx` |
| **Data needed** | Inquiries authored by this client across workspaces |
| **Existing tables** | `inquiries` (filter by client_id) |
| **Server loaders** | `loadClientInquiries()` |
| **Capability checks** | `client.inquiries.view` |
| **Acceptance** | Cross-tenant inquiries listed correctly |

### Card C3 — Client Bookings

| Field | Value |
|---|---|
| **Prototype source** | `_client.tsx::ClientBookings` |
| **Current live route** | none |
| **Target route** | `(client)/bookings/page.tsx` |
| **Data needed** | Bookings + transactions + contracts for this client |
| **Existing tables** | `bookings`, `booking_transactions`, `booking_contracts` |
| **Server loaders** | `loadClientBookings()` |
| **Capability checks** | `client.bookings.view` |
| **Acceptance** | Booking detail loads end-to-end |

### Card C4 — Client Shortlists

| Field | Value |
|---|---|
| **Prototype source** | `_client.tsx::ClientShortlists` |
| **Current live route** | none |
| **Target route** | `(client)/shortlists/page.tsx` |
| **New tables** | `client_shortlists`, `client_shortlist_items` |
| **Server actions** | `createShortlist`, `addToShortlist`, `removeFromShortlist`, `shareShortlist` |
| **Capability checks** | `client.shortlists.view`, `client.shortlists.edit`, `client.shortlists.share` |
| **Acceptance** | Add/remove persists |

### Card C5 — Client Settings

| Field | Value |
|---|---|
| **Prototype source** | `_client.tsx::ClientSettings` |
| **Target route** | `(client)/settings/page.tsx` |
| **Data needed** | Trust badge tier (own), payment methods, notification prefs, multiple identity profiles (business vs person) |
| **Existing tables** | `clients`, `client_verifications`, `client_payment_methods` |
| **Capability checks** | `client.settings.*` |
| **Acceptance** | Profile switch + verification request flow works |

---

## Platform surfaces

> `app.tulala.digital/platform/admin/*`. Cross-tenant. Restricted to platform `super_admin` role. Last to promote because it depends on every other surface being stable.

### Card PL1 — Platform Overview

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformOverview` |
| **Target route** | `(platform)/admin/page.tsx` |
| **Data needed** | Cross-tenant counts (tenants, talents, inquiries, bookings, GMV) |
| **Server loaders** | `loadPlatformOverview()` (admin client; `is_staff_of_tenant` SECURITY DEFINER bypass) |
| **Capability checks** | `platform.overview.view` (gated to platform super_admin role) |
| **Acceptance** | Real cross-tenant numbers |

### Card PL2 — Platform Tenants

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformTenants` |
| **Target route** | `(platform)/admin/tenants/page.tsx` |
| **Data needed** | All `agencies` rows + memberships + plan + status |
| **Server actions** | `createTenant`, `suspendTenant`, `impersonate` |
| **Capability checks** | `platform.tenants.view`, `platform.tenants.create`, `platform.tenants.suspend`, `platform.tenants.impersonate` |
| **Acceptance** | Impersonate flow works, lands in tenant's admin scoped session |

### Card PL3 — Platform Trust

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformTrust` |
| **Target route** | `(platform)/admin/trust/page.tsx` |
| **Data needed** | Verification queue, method registry, trust audit log |
| **Existing tables** | `verification_requests`, `profile_verifications`, `verification_method_configs`, `verification_method_audit` |
| **Capability checks** | `platform.trust.view`, `platform.trust.approve`, `platform.trust.method_config` |
| **Acceptance** | Queue + approve flow works |

### Card PL4 — Platform Taxonomy

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformTaxonomy` |
| **Target route** | `(platform)/admin/taxonomy/page.tsx` |
| **Data needed** | Master taxonomy tree (kind hierarchy, parents, terms) |
| **Existing tables** | `taxonomy_terms`, `taxonomy_term_translations`, `taxonomy_kind_hierarchy` |
| **Server actions** | `addTerm`, `editTerm`, `deactivateTerm`, `mergeTerms` |
| **Capability checks** | `platform.taxonomy.view`, `platform.taxonomy.edit` |
| **Acceptance** | Edit propagates to workspace taxonomy settings |

### Card PL5 — Platform Billing

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformBilling` |
| **Target route** | `(platform)/admin/billing/page.tsx` |
| **Data needed** | Cross-tenant subscriptions, transaction fees, payouts queue |
| **New tables** | possibly `platform_subscription_invoices`, `platform_payout_runs` (per `transaction-architecture.md`) |
| **Capability checks** | `platform.billing.view`, `platform.billing.run_payouts` |
| **Acceptance** | Payout run executes safely |

### Card PL6 — Platform Audit

| Field | Value |
|---|---|
| **Prototype source** | `_platform.tsx::PlatformAudit` |
| **Target route** | `(platform)/admin/audit/page.tsx` |
| **Data needed** | `platform_audit_log` rows |
| **Capability checks** | `platform.audit.view` |
| **Acceptance** | Filter + search works |

---

# Shared architecture extraction plan

The prototype monolith files are too large to ship to production verbatim. Before promotion, define what gets extracted where.

**Proposed production folder structure:**

```
web/src/
├── app/
│   ├── (workspace)/
│   │   └── [tenantSlug]/
│   │       └── admin/
│   │           ├── layout.tsx                  # workspace shell (sidebar + topbar)
│   │           ├── page.tsx                    # overview
│   │           ├── roster/
│   │           ├── work/
│   │           ├── clients/
│   │           ├── site/                       # WRAPS edit-chrome — does NOT replace it
│   │           └── workspace/
│   ├── (talent)/
│   │   ├── layout.tsx
│   │   ├── today/
│   │   ├── inbox/
│   │   ├── calendar/
│   │   ├── reach/
│   │   ├── profile/
│   │   ├── activity/
│   │   └── settings/
│   ├── (client)/
│   │   ├── layout.tsx
│   │   ├── discover/
│   │   ├── inquiries/
│   │   ├── bookings/
│   │   ├── shortlists/
│   │   └── settings/
│   ├── (platform)/
│   │   ├── admin/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── tenants/
│   │   │   ├── trust/
│   │   │   ├── taxonomy/
│   │   │   ├── billing/
│   │   │   └── audit/
│   └── t/[profileCode]/                        # public talent (already exists)
├── components/
│   ├── shell/                                  # extracted from prototype
│   │   ├── workspace-shell.tsx                 # sidebar + topbar layout
│   │   ├── talent-shell.tsx                    # talent topbar
│   │   ├── client-shell.tsx
│   │   ├── platform-shell.tsx
│   │   ├── mode-toggle.tsx                     # Talent ⇄ Workspace flip
│   │   └── nav-rail.tsx
│   ├── primitives/                             # split from _primitives.tsx
│   │   ├── icon.tsx
│   │   ├── card.tsx
│   │   ├── drawer.tsx
│   │   ├── modal.tsx
│   │   ├── toast.tsx
│   │   ├── button.tsx
│   │   ├── pill.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── date-picker.tsx
│   │   ├── avatar.tsx
│   │   ├── empty-state.tsx                     # reusable empties
│   │   └── locked-card.tsx                     # plan-locked CTA
│   ├── drawers/                                # split from _drawers.tsx
│   │   ├── registry.tsx                        # DrawerId → component map
│   │   ├── upgrade-modal.tsx
│   │   ├── add-talent.tsx
│   │   ├── invite-client.tsx
│   │   ├── ... (one file per drawer)
│   ├── cards/                                  # roster card, inquiry card, etc.
│   ├── edit-chrome/                            # PRESERVED — page builder
│   └── workspace/                              # workspace-specific composites
├── lib/
│   ├── access/                                 # capabilities (canonical post-Phase-2)
│   ├── data/                                   # NEW — server loaders per surface
│   │   ├── workspace-roster.ts
│   │   ├── workspace-overview.ts
│   │   ├── workspace-inquiries.ts
│   │   ├── talent-today.ts
│   │   ├── talent-inbox.ts
│   │   ├── client-discover.ts
│   │   └── platform-overview.ts
│   ├── actions/                                # NEW — server actions per surface
│   │   ├── workspace-roster.ts
│   │   ├── ...
│   ├── dto/                                    # NEW — shared shapes
│   │   ├── talent-profile.ts
│   │   ├── inquiry.ts
│   │   ├── booking.ts
│   │   └── ...
│   ├── route-guards/                           # NEW — per-surface guards
│   │   ├── require-workspace-scope.ts
│   │   ├── require-talent-scope.ts
│   │   ├── require-client-scope.ts
│   │   └── require-platform-role.ts
│   └── ...
└── ...
```

**Files that need splitting before production:**

| Prototype file | Lines | Recommended split |
|---|---|---|
| `_state.tsx` | 9214 | `dto/*` (types) + `state/proto-provider.tsx` (provider) + `state/mocks/*` (mock data per surface; deleted in Phase 4) + `state/tokens.ts` (visual tokens — kept until token registry consumes) |
| `_drawers.tsx` | 25336 | one file per drawer in `components/drawers/*`, plus `components/drawers/registry.tsx` for the dispatcher |
| `_primitives.tsx` | 8784 | one file per primitive in `components/primitives/*` |
| `_pages.tsx` | 12062 | per-surface folders in `app/(workspace)/[tenantSlug]/admin/*/page.tsx` |
| `_talent.tsx` | 15165 | per-surface in `app/(talent)/*/page.tsx`. SPLIT FIRST during Phase 3.3 — too big to refactor as one |
| `_client.tsx` | 4083 | per-surface in `app/(client)/*/page.tsx` |
| `_platform.tsx` | 2236 | per-surface in `app/(platform)/admin/*/page.tsx` |
| `_messages.tsx` | 13146 | extract into `components/messages/*` (real-time + AI reply primitives) |
| `_workspace.tsx` | 4057 | InquiryWorkspaceDrawer → `components/drawers/inquiry-workspace.tsx`; Phone layouts → primitives |
| `_help.tsx` | 3180 | help drawer + content → `components/drawers/help.tsx` + `content/help/*.md` |

---

# Stop-the-line conditions

Execution **must stop and escalate to the founder** if any of the following happens:

| # | Condition | Dev's action |
|---|---|---|
| S1 | Bridge requires service-role access | STOP. RLS must work. If it doesn't, fix the policy first; do NOT route around it with `lib/supabase/admin.ts`. |
| S2 | Mock mode breaks on the prototype URL without `?dataSource=live` | STOP. Mock mode must be a no-op default. Revert until restored. |
| S3 | Legacy `/admin/*` breaks before its replacement is shipped | STOP. Legacy must keep working until the same commit that ships the replacement. |
| S4 | Public `/t/<slug>` regresses | STOP. Phases 1–3 do not touch this route. Investigate root cause. |
| S5 | Page builder / edit-chrome regresses | STOP. Per `page-builder-invariants.md` — the page builder is preserved verbatim until explicitly migrated in Phase 3.5 (W5). |
| S6 | Middleware needs unexpected changes during Phase 1–2 | STOP. Middleware is locked through Phase 2. Phase 3 may add minor route allow-list entries but never restructures host resolution. |
| S7 | `getTenantScope()` cannot resolve from middleware headers on the QA URL | STOP. The fail-hard log will show in server output. Diagnose `agency_domains` seeding before continuing. |
| S8 | A capability mapping during Phase 2 is NOT one-to-one | STOP. Document the mismatch in `docs/handoffs/wave-1-prep-audit.md` as a new drift item; founder ratifies the resolution before code change. |
| S9 | A surface promotion in Phase 3 requires deleting legacy *before* the replacement is shipped | STOP. The rule is delete-on-replacement in the SAME commit. If they cannot be in one commit, restructure the work so they can. |
| S10 | A migration during Phases 0–3 requires DROP / RENAME / enum reshape | STOP. Per `OPERATING.md`, additive-only until Phase 4. Use a parallel column / new enum value instead. |
| S11 | The prototype freeze (commit `11d8fa0`) is violated by new feature work in `web/src/app/prototypes/admin-shell/*` | STOP. Per `web/docs/admin-prototype/FREEZE.md` — bug fixes only with explicit acknowledgement. New feature work waits for unfreeze. |
| S12 | Vercel preview deploy on `phase-1` succeeds in CI but breaks on `impronta.tulala.digital` | STOP. Likely an `agency_domains` row missing or middleware allow-list gap. Check `web/CLAUDE.md` deploy notes; do not promote to prod. |

When stopped, the developer writes a 1-paragraph note in the relevant Phase 0 audit (`docs/handoffs/wave-1-prep-audit.md`) describing what was hit and what they did, then waits for a founder decision before proceeding.

---

# First 10 executable tasks

In order. The first 4 are Phase 1; #5–7 are Phase 2 starter; #8–10 prepare Phase 3.

| # | Task | Owner | Files | Tests | Done state | Blockers |
|---|------|-------|-------|-------|-----------|---------|
| 1 | **Resume Commit 3 / P1.1** — convert `page.tsx` to server wrapper, move client tree to `_shell-client.tsx` | mid | `page.tsx`, `_shell-client.tsx` | typecheck | new server `page.tsx` ≤60 lines; `_shell-client.tsx` exports `AdminShellPrototypePageClient` named | freeze respected |
| 2 | **P1.2** — implement `_data-bridge.ts` with `loadWorkspaceRosterForCurrentTenant()` | mid+ | `_data-bridge.ts` | typecheck | function returns 29 rows for Impronta owner, `[]` for anonymous | none |
| 3 | **P1.3** — wire `initialBridgeData` through `ProtoProvider`, swap two `getRoster(state.plan)` call sites in `_pages.tsx` for `state.effectiveRoster` | mid | `_state.tsx`, `_pages.tsx` | typecheck + access tests | mock URL unchanged; `?dataSource=live` shows 29 rows | P1.1 + P1.2 |
| 4 | **P1.4** — final acceptance test + push + promote to prod alias | any | none | all 5 commands + 6 manual smokes | preview promoted; `impronta.tulala.digital/prototypes/admin-shell?…&dataSource=live` shows 29 real rows | P1.1–P1.3 |
| 5 | **P2.0** — verify lib/access parity test still passes; no code change | junior | none | `npm run test:access` | 13/13 green | Phase 1 shipped |
| 6 | **P2.1 (split A)** — migrate site-settings page renders (4 files: `identity`, `branding`, `navigation`, `design`) | mid | 4 page.tsx files | typecheck + smoke | each page loads + edits work for owner | P2.0 |
| 7 | **P2.1 (split B)** — migrate site-settings pages CRUD: `pages/page.tsx`, `pages/[id]/page.tsx`, `pages/new/page.tsx`, `pages/actions.ts` | mid | 4 files | typecheck + smoke + page save end-to-end | save action works | P2.1 split A |
| 8 | **P3.0 — extraction prep**: split `_state.tsx` mocks into a separate file `_state-mocks.tsx` so future Phase 3 commits can delete mocks per surface without touching shared types | senior | `_state.tsx`, `_state-mocks.tsx` (new) | typecheck | all imports stable; mocks isolated | Phase 2 shipped |
| 9 | **P3.0 — extraction prep**: split `_drawers.tsx` registry from drawer bodies — `_drawer-registry.tsx` (dispatcher) + `_drawer-bodies/` folder | senior | `_drawers.tsx`, new files | typecheck | drawers still render | task #8 |
| 10 | **P3.W1 — Workspace Overview promotion** — first surface promoted to `(workspace)/[tenantSlug]/admin/page.tsx`. Same commit deletes `(dashboard)/admin/page.tsx`. Bridge pattern from Phase 1 reused. | senior | new files in `(workspace)/`, deletion of legacy `(dashboard)/admin/page.tsx`, `lib/data/workspace-overview.ts` | typecheck + smoke + legacy redirect | new URL serves real Impronta overview; legacy returns 308 | Phase 2 fully shipped |

---

## Glossary

- **Bridge** — `_data-bridge.ts` and the server-component wrapper at `page.tsx`. The doorway through which live data enters the prototype.
- **Surface** — one of: workspace, talent, client, platform. Top-level UX containers.
- **Tenant scope** — resolved by `getTenantScope()` from middleware headers. Single source of "which workspace are we acting on."
- **Capability** — a string key in `lib/access/capabilities.ts` checked by `userHasCapability` / `requireCapability`. 88 keys total post-Phase-2.
- **Plan-locked** — UI state where a feature is visible but disabled because the workspace plan doesn't unlock it.
- **Frozen** — `web/src/app/prototypes/admin-shell/*` is feature-frozen at `11d8fa0` until Phase 1 ships.
- **Stop-the-line** — see section 5; conditions under which a dev escalates to founder before continuing.

---

*Owners: founder ratifies; senior dev oversees Phase 1+2; mids own surface promotions in Phase 3 with senior review on architectural decisions; juniors can pick up XS/S tasks (P2.2, P2.6, P1.4, smoke tasks).*
