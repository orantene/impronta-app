# Tulala Talent Catalog Engine — Completion Prompt Pack

**Created:** 2026-05-19 · **For:** parallel/serial execution by fresh Claude Code sessions.

This document operationalizes the canonical execution plan
(`talent-engine-execution-plan-2026-05-18.md`) and the audit/status doc
(`talent-engine-status-2026-05-18.md`). Each prompt below is **self-contained**
— paste it into a fresh Claude Code chat and it has everything it needs. No
prior session context required.

---

## 1. How to use this document

For each chunk of work:
- **Metadata block** says what the chunk covers, what model + thinking level
  to use, what it parallelizes with, its prerequisites, files in/out of scope,
  effort, suggested branch name.
- **The prompt** (in a triple-fenced block) is the literal text to paste into
  a new Claude Code chat. It's self-contained — no "see above" references.
- **Acceptance** is what "done" looks like.
- **Report back** lists what the executing session should send you when done.

The prompts assume the executing session has access to the repo at
`/Users/oranpersonal/Desktop/impronta-app/` and can use Claude Code's full
tool set (Bash/Read/Edit/Write/etc.).

Run prompts in parallel where the metadata says they're parallelizable
(different file areas, no contention). Run serial where dependencies require.
**Never run more than one prompt that writes to the same file at the same time.**

---

## 2. Sequencing & Dependency DAG

```
Wave A (NOW, parallel — no contention):
  P-01 Engine unit tests           ┐
  P-02 Helper-text render          │
  P-03 9A slice 5 (per-tenant)     │  ► All independent. Run any/all in parallel.
  P-04 9A slice 6 (exports)        │
  P-05 9A slice 7 (tenant mirror)  │
  P-06 Engine architecture doc     │
  P-07 Resolver telemetry          ┘

Wave B (after SaaS plan finishes / phase-1 self-heals):
  P-08 Incident verify             ► Quick sanity-check
  P-09 Phase-4 reconcile-decide    ► Analysis only

Wave C (Phase 7a — parallel with Wave A):
  P-10 Audit log schema + writes   ┐
  P-11 Cache-correctness sweep     │  ► All independent.
  P-12 Plan-tier capability lib    ┘

Wave D (Phase 5 — STRICTLY SERIAL, db-gated):
  P-13 Runbook validate            ► First
   ─► P-14 Cutover readers
       ─► P-15 Retire legacy writes
           ─► P-16 Collapse resolver
               ─► P-17 Height path

Wave E (Phase 6 — after Wave D):
  P-18 Canonical read layer        ► First
   ─► P-19 Shadow + diff
       ─► P-20 Cutover + retire legacy reader

Wave F (Phase 7b — drawers-coupled):
  P-21 History rail UI             ► Owns drawers.tsx window; serial vs other drawer work

Wave G (Phase 8 design):
  P-22 Custom fields design doc    ► Design only; impl prompts come after approval

Wave H (Phase 9B — HARD-GATED on Waves A-G complete):
  P-23 Editable studio design doc  ► Design only; impl prompts come after approval
```

---

## 3. Conventions every prompt assumes

These are baked into each prompt's text — you don't need to add them. Listed
here for your reference:

- **Branch governance:** `phase-1` is the shared trunk. Never work directly on
  it. Always: branch off the current tip → work in isolated worktree → gate →
  path-scoped commit → cherry-pick onto `phase-1` only after gate is green.
- **Landing protocol** (proven this session, mandatory):
  1. `git worktree add -b <branch> /tmp/<dir> <phase-1-tip>`
  2. **`ln -s /Users/oranpersonal/Desktop/impronta-app/web/node_modules /tmp/<dir>/web/node_modules`**
     (and root) — the **false-pass guard**: without this, `tsc`/`lint` silently
     fail in worktrees and your "0 errors" is fake.
  3. Implement.
  4. Gate: `npx tsc --noEmit` (in `web/`) + `npm run lint`. Criterion: **zero
     new tsc errors beyond the known phase-1 baseline; zero new lint errors**.
  5. Path-scoped commit on the branch.
  6. Cherry-pick from the **main repo** cwd (`/Users/oranpersonal/Desktop/impronta-app`)
     onto `phase-1`: `git cherry-pick -x <sha>`.
- **No push** to `origin` without explicit user approval. Land on local `phase-1`.
- **Never touch other-agent dirty files.** Path-scoped commits only. Never
  `git add .` or `git commit -a`.
- **No subagents** for this engine track. Single-operator per prompt. (Wave-1
  worktree-isolation failed catastrophically; this is binding.)
- **phase-1 incident baseline (as of 2026-05-19):** `phase-1` has 4 known
  pre-existing tsc errors in `drawers.tsx` (lines 2228, 2323, 2445, 2446 —
  `Property 'has_value'/'tenant_override' does not exist on type 'ResolvedField'`).
  Your gate criterion is "no new tsc errors beyond these 4." The SaaS-plan
  agent's uncommitted `admin-taxonomy.ts` already has the resolver fix; the
  incident self-resolves when they commit. If they've already committed by
  the time you run, your baseline is 0 errors.
- **Lint baseline:** 0 errors / ~390 warnings after `lint:refresh-baseline`
  was run. Suppressions are in `eslint-suppressions.json`. Your criterion is
  zero new errors; warnings are fine but try not to add many.
- **Model fallback:** if your assigned model isn't available, escalate one
  tier (Sonnet → Opus, medium thinking → high) rather than dropping.

---

## 4. Reporting back format

After each prompt completes, the executing session should reply with:

```
## P-XX <Title> — REPORT

**Status:** DONE | BLOCKED | PARTIAL
**Branch:** <branch name + commit sha>
**Files changed:** <list>
**Gate result:** tsc <N> errors (baseline + <X> new); lint <N> errors (baseline + <X> new)
**Cherry-pick:** <new phase-1 sha> | NOT LANDED (reason)
**Verification:** <what you checked manually>
**Surprises / risks:** <anything notable>
**Recommended next step:** <e.g., "P-XY is now unblocked">
```

---

# Wave A — Parallel, run NOW (no contention)

---

## P-01: Engine unit tests for `effective-visibility.ts`

**Model:** Sonnet · **Thinking:** medium
**Why this model:** Well-specified test writing; the primitive is pure and
small (~150 lines).
**Parallelizable with:** P-02, P-03, P-04, P-05, P-06, P-07, P-10, P-11, P-12.
**Prerequisites:** none.
**Files in scope (create):** `web/src/lib/field-engine/effective-visibility.test.ts`
**Files OUT of scope:** anything else; do not touch other files.
**Effort:** ~½ day.
**Suggested branch:** `engine-tests-effective-visibility`.

**What this prompt completes:** Pays down a Phase-1 acceptance debt — the
plan said the visibility primitive should be "unit-tested first." It wasn't.
This produces a thorough test suite covering the conflict matrix in the
canonical engine plan §9.

**Prompt (paste into a new chat):**

````
You are a senior engineer adding test coverage to the Tulala talent catalog
engine. Repo: /Users/oranpersonal/Desktop/impronta-app/. Work in `web/`.

## Background
The talent catalog engine has a single shared visibility primitive at
`web/src/lib/field-engine/effective-visibility.ts`. It exports:
- `effectiveFieldVisibility(def, tenant?, valueOverride?)` → "public"|"admin"|"hidden"
- `canViewerSee(vis, role)` → boolean
- `platformBaseVisibility(def)` → FieldVisibility
- `visibilityToOverrideColumns(v)` → { show_in_public_override, admin_only_override, default_visibility_override }
- Types: FieldVisibility, ViewerRole, FieldDefVisibilityInput, TenantFieldVisibilityOverride

Read the file first to understand the precedence rules (most-restrictive-wins;
platform floor absolute; tenant override can only restrict; value override
narrow-only). The plan calls this the "single visibility decision for the
engine" — never reimplemented.

## Task
Create `web/src/lib/field-engine/effective-visibility.test.ts` using the
repo's existing test runner pattern (look at any existing `*.test.ts` in
the repo, e.g. `web/src/lib/auth-routing.test.ts`, for the `tsx --test`
convention; or check `package.json` scripts for the actual runner).

Cover at minimum:
1. Platform-base mapping — every combo of {default_visibility, show_in_public,
   admin_only, is_sensitive} → expected FieldVisibility.
2. Tenant override — only restricts (never raises to public); platform
   admin_only/is_sensitive cannot be made public.
3. Value override (talent-set) — narrows only; empty array vs non-empty.
4. Precedence — most-restrictive-wins across all three sources.
5. `canViewerSee` — every ViewerRole × every FieldVisibility.
6. `visibilityToOverrideColumns` — round-trip via the override columns.

Aim for >40 test cases. Use descriptive names.

## Constraints (binding)
- New file only; do NOT modify `effective-visibility.ts` itself.
- Branch governance: never work on `phase-1` directly. Create a worktree:
  `git worktree add -b engine-tests-effective-visibility /tmp/engine-tests <current phase-1 sha>`
  Then `ln -s /Users/oranpersonal/Desktop/impronta-app/web/node_modules /tmp/engine-tests/web/node_modules`
  Then `ln -s /Users/oranpersonal/Desktop/impronta-app/node_modules /tmp/engine-tests/node_modules`
  Do all work in /tmp/engine-tests/web/.
- The worktree's node_modules MUST be symlinked — `git worktree add` does NOT
  copy it. Without this, npx tsc / npm run lint silently fail (this is a
  documented trap; verify by checking `test -f web/node_modules/eslint/bin/eslint.js`).
- Gate: in the worktree's `web/` dir, run `npx tsc --noEmit` and `npm run lint`.
  Acceptable: total tsc errors ≤ 4 (the pre-existing phase-1 incident errors
  in drawers.tsx lines 2228/2323/2445/2446) AND zero errors in your new file.
  Lint: zero new error-severity issues in your file.
- After gate green: run your new test file (`npx tsx --test src/lib/field-engine/effective-visibility.test.ts`)
  and ensure all tests pass.
- Commit path-scoped on the worktree branch: `git add <files> && git commit -- <files>`
  with a clean commit message.
- Do NOT push. Do NOT cherry-pick onto phase-1 yourself — produce the branch
  and report. The orchestrator will land it.

## Report back (use the format from the prompt-pack §4)
Include: total test cases, any precedence rules you found ambiguous in the
primitive's source, suggestions for additional tests.
````

**Acceptance:** Test file exists, ≥40 cases, all pass, no new tsc/lint errors
in the file. Branch ready to cherry-pick.

**Report back includes:** test count, pass status, any documentation gaps
discovered in the primitive.

---

## P-02: Render `custom_helper` in the talent profile editor (E8 quick win)

**Model:** Sonnet · **Thinking:** medium
**Why this model:** Single small UI addition; clear scope.
**Parallelizable with:** P-01, P-03, P-04, P-05, P-06, P-07, P-10, P-11, P-12.
**Prerequisites:** none.
**Files in scope:** `web/src/components/admin/shell/internal/live-category-fields-editor.tsx`
**Files OUT of scope:** `drawers.tsx`, `admin-taxonomy.ts`, anything else.
**Effort:** ~2 hours.
**Suggested branch:** `engine-helper-render-editor`.

**What this prompt completes:** P2c (per-field helper text) is half-wired:
the resolver returns `helper` on `ResolvedField`, FieldCatalogDrawer lets
agencies set it, but `LiveCategoryFieldsEditor` (the talent-facing editor)
doesn't render it. This finishes the round-trip.

**Prompt (paste into a new chat):**

````
You are a senior engineer completing a half-wired feature in the Tulala
talent catalog engine. Repo: /Users/oranpersonal/Desktop/impronta-app/. Work
in `web/`.

## Background
The engine's `ResolvedField` type (in
`web/src/lib/server-actions/admin-taxonomy.ts`) has a `helper: string | null`
field — tenant's `custom_helper` falls back to platform definition's `helper`.
The FieldCatalogDrawer already lets agencies set custom_helper. But the
talent-facing editor `web/src/components/admin/shell/internal/live-category-fields-editor.tsx`
doesn't render it.

This is debt item "E8" in the engine status doc.

## Task
In `live-category-fields-editor.tsx`, add rendering of `f.helper` beneath
each field's label/input. Style consistent with the existing field-row design
(see how the file currently presents labels and any existing hint/helper text;
match its idiom).

Read the file first; identify where each field is rendered; add a small
muted-text element showing `f.helper` (only when non-null).

## Constraints (binding)
- Single-file edit. Do NOT touch any other file.
- `live-category-fields-editor.tsx` MAY currently be dirty in the main repo
  (other-agent SaaS-plan churn). Use the worktree protocol exclusively.
- Branch governance: never work on `phase-1` directly. Create a worktree:
  `git worktree add -b engine-helper-render-editor /tmp/helper-render <current phase-1 sha>`
  Then symlink node_modules:
  `ln -s /Users/oranpersonal/Desktop/impronta-app/web/node_modules /tmp/helper-render/web/node_modules`
  `ln -s /Users/oranpersonal/Desktop/impronta-app/node_modules /tmp/helper-render/node_modules`
  Verify: `test -f /tmp/helper-render/web/node_modules/eslint/bin/eslint.js && echo YES`.
- Gate: in worktree `web/` dir, `npx tsc --noEmit` and `npm run lint`.
  Criterion: tsc ≤ 4 errors (drawers.tsx incident baseline, none yours);
  lint zero new errors.
- Path-scoped commit: `git add web/src/components/admin/shell/internal/live-category-fields-editor.tsx && git commit -- web/src/components/admin/shell/internal/live-category-fields-editor.tsx`
- Do NOT push. Do NOT cherry-pick onto phase-1.

## Acceptance
- Each rendered field shows its `helper` text (when present) beneath the
  label/input, with muted styling.
- Fields with `helper: null` render unchanged.
- Branch ready to cherry-pick.

## Report back (use the format from the prompt-pack §4)
Include: which rendering site you placed the helper text, any visual decisions
you made (font size, color, spacing).
````

**Acceptance:** Editor shows helper text for fields that have it; clean gate.

**Report back includes:** placement decision, visual choices.

---

## P-03: Phase 9A slice 5 — per-tenant value-count breakdown

**Model:** Sonnet · **Thinking:** high
**Why this model:** Moderate complexity (new aggregate join), well-templated by
existing slice-4 loader.
**Parallelizable with:** P-01, P-02, P-04, P-05, P-06, P-07, P-10, P-11, P-12.
**Prerequisites:** Phase 9A slice 4 landed on phase-1 (commit `c497c8252` —
verify with `git log --oneline -1 phase-1`).
**Files in scope:**
- Edit: `web/src/app/(workspace)/platform/catalog-field-detail-data.ts`
- Edit: `web/src/app/(workspace)/platform/admin/catalog/[fieldKey]/page.tsx`
**Files OUT of scope:** anything else.
**Effort:** ~½ day.
**Suggested branch:** `engine-phase9a-slice5-per-tenant-values`.

**What this prompt completes:** Slice 4 shows WHICH workspaces have overrides
for a field. Slice 5 adds: per-tenant *talent value counts* — i.e., among
talents rostered to each tenant, how many have a stored value for this field.
Real platform-admin power: "who is collecting this data and how thoroughly."

**Prompt (paste into a new chat):**

````
You are a senior engineer extending the Platform Catalog Map (Phase 9A) in
the Tulala talent catalog engine. Repo: /Users/oranpersonal/Desktop/impronta-app/.
Work in `web/`.

## Background
The Platform HQ has a read-only Catalog Map at /platform/admin/catalog with a
per-field detail page at /platform/admin/catalog/[fieldKey]. The detail page
already shows which workspaces (agencies) have a per-field OVERRIDE. This
slice (slice 5) adds per-tenant TALENT-VALUE counts: of the talents rostered
to each tenant, how many have a stored value for this field?

Read these files first:
- web/src/app/(workspace)/platform/catalog-field-detail-data.ts (existing loader)
- web/src/app/(workspace)/platform/admin/catalog/[fieldKey]/page.tsx (existing detail page)
- web/src/app/(workspace)/platform/platform-data.ts (for the tenant-loading
  pattern — note: tenants live in the `agencies` table; talent roster is
  `agency_talent_roster` with status='active').

The relevant tables:
- `talent_profile_field_values` (canonical values) — columns include
  talent_profile_id, field_definition_id, workflow_state ('live'|'pending'|...).
- `agency_talent_roster` — talent_id, tenant_id, status.
- `agencies` — id, display_name, slug, plan_tier, entity_type, status.

## Task
Extend `loadPlatformCatalogFieldDetail(fieldKey)`:
1. After loading the field, run an additional query: SELECT
   talent_profile_id FROM talent_profile_field_values WHERE
   field_definition_id = <def.id> AND workflow_state = 'live'.
2. SELECT talent_profile_id, tenant_id FROM agency_talent_roster WHERE
   talent_profile_id IN (<the talent_ids>) AND status = 'active'.
3. Aggregate in JS: per tenant_id, count distinct talent_profile_ids that
   have a value AND are on that roster.
4. Return a new shape `per_tenant_value_counts: Map<tenant_id, number>` (or
   adjust the workspace rows to include this count).

For workspaces ALREADY in the override list (slice 4): augment with
value_count. Also include workspaces that have ANY talent with a value
even if no override exists (these are interesting — they're using the
field without customizing). Sort the merged list by value_count desc.

In `[fieldKey]/page.tsx`:
1. Add a "Talents with value" column to the workspace adoption table.
2. Update the section subtitle to reflect the merged set (overrides ∪
   workspaces-with-values).
3. Possibly add a top-line stat: "X tenants have at least one talent with a
   value."

## Constraints (binding)
- Strictly READ-ONLY. No new writes, no migration.
- 2 files only — the data loader and the detail page.
- Branch governance: worktree off current phase-1 tip + node_modules symlink.
  `git worktree add -b engine-phase9a-slice5-per-tenant-values /tmp/p9a-s5 $(git rev-parse phase-1)`
  `ln -s /Users/oranpersonal/Desktop/impronta-app/web/node_modules /tmp/p9a-s5/web/node_modules`
  `ln -s /Users/oranpersonal/Desktop/impronta-app/node_modules /tmp/p9a-s5/node_modules`
- Gate: tsc ≤ 4 errors (drawers.tsx baseline, none yours); lint 0 new errors.
- Path-scoped commit. Do NOT push. Do NOT cherry-pick — leave on the branch.

## Acceptance
- Field detail page shows per-tenant value counts for every tenant whose
  talents have at least one stored value for this field.
- Existing workspace-override rows show both override details AND value count.
- Empty/no-value fields render correctly (no crash).
- Branch ready to cherry-pick.

## Report back (use the format from the prompt-pack §4)
Include: how many rows the join produces on representative fields (e.g.,
physical.height_cm), any RLS / performance concerns you noticed.
````

**Acceptance:** Per-tenant value counts visible on field detail page; clean gate.

**Report back:** Join performance observations, edge cases handled.

---

## P-04: Phase 9A slice 6 — CSV/JSON exports

**Model:** Sonnet · **Thinking:** medium
**Why this model:** New API route, well-bounded scope.
**Parallelizable with:** P-01, P-02, P-03, P-05, P-06, P-07, P-10, P-11, P-12.
**Prerequisites:** Phase 9A slice 4 landed (the per-field detail loader exists).
**Files in scope (create):**
- `web/src/app/(workspace)/platform/admin/catalog/export/route.ts` (catalog map export)
- `web/src/app/(workspace)/platform/admin/catalog/[fieldKey]/export/route.ts` (per-field detail export)
**Files OUT of scope:** anything else.
**Effort:** ~½ day.
**Suggested branch:** `engine-phase9a-slice6-exports`.

**What this prompt completes:** Lets platform admin download the catalog
map (or a single field's detail) as CSV or JSON. High admin value — enables
offline analysis, audit, sharing with stakeholders.

**Prompt (paste into a new chat):**

````
You are a senior engineer adding read-only exports to the Tulala platform
admin Catalog Map. Repo: /Users/oranpersonal/Desktop/impronta-app/. Work
in `web/`.

## Background
Platform admins have a read-only catalog map at /platform/admin/catalog with
a per-field detail page. They need to download data for offline analysis.

This Next.js version uses the App Router with Route Handlers (`route.ts`).
Check `node_modules/next/dist/docs/` if needed for the current Route Handler
syntax — this is NOT the Next.js you may know; verify the API.

## Task
Create two new Route Handlers:

1. `web/src/app/(workspace)/platform/admin/catalog/export/route.ts`
   - GET only.
   - Accepts `?format=csv|json` query param (default json).
   - Calls `loadPlatformCatalogMap()` (existing loader at
     `web/src/app/(workspace)/platform/catalog-map-data.ts`).
   - Returns CSV or JSON of all fields with: field_key, label, tier,
     section, group, visibility, admin_only, is_sensitive, show_in_public,
     required_default, deprecated, override_count, value_count.
   - Set proper Content-Type + Content-Disposition for download.
   - Filename: `catalog-map-YYYY-MM-DD.csv` (or .json).

2. `web/src/app/(workspace)/platform/admin/catalog/[fieldKey]/export/route.ts`
   - GET only. Dynamic route param: fieldKey.
   - Accepts `?format=csv|json`.
   - Calls `loadPlatformCatalogFieldDetail(decoded fieldKey)`.
   - CSV/JSON of: field summary + risks + workspace adoption rows.
   - Filename: `field-<fieldKey>-YYYY-MM-DD.csv`.

Also: add small "Export" link buttons to the catalog map page header and to
the field detail page header, linking to the appropriate route. Use
`<Link>` from next/link.

## Auth
The /platform/admin segment is gated by its `layout.tsx` (super_admin).
Route Handlers under that segment inherit nothing automatically — you must
re-check auth in the route. Pattern: import `isPlatformAdmin` from
`@/lib/access/platform-role` and `getCachedActorSession` from
`@/lib/server/request-cache`. If not a super_admin, return a 403 Response.

## Constraints (binding)
- All-new-files for the route handlers; small edit (link addition) to:
  - web/src/app/(workspace)/platform/admin/catalog/page.tsx
  - web/src/app/(workspace)/platform/admin/catalog/[fieldKey]/page.tsx
- Branch: worktree off current phase-1 tip + node_modules symlink.
  `git worktree add -b engine-phase9a-slice6-exports /tmp/p9a-s6 $(git rev-parse phase-1)`
  `ln -s /Users/oranpersonal/Desktop/impronta-app/web/node_modules /tmp/p9a-s6/web/node_modules`
  `ln -s /Users/oranpersonal/Desktop/impronta-app/node_modules /tmp/p9a-s6/node_modules`
- Gate: tsc ≤ 4 errors (baseline, none yours); lint 0 new.
- Do NOT add CSV-parsing libraries — implement a small inline CSV serializer
  (escape commas, quote fields with commas/quotes/newlines, use \r\n).
- Path-scoped commit. Do NOT push.

## Acceptance
- GET /platform/admin/catalog/export?format=csv returns a downloadable CSV.
- GET /platform/admin/catalog/export?format=json returns valid JSON.
- Same for /[fieldKey]/export.
- Unauthorized requests return 403.
- "Export" links visible on both pages.
- Branch ready.

## Report back (use the format from the prompt-pack §4)
Include: chosen Content-Disposition pattern, edge cases (empty catalog, etc.),
size of a representative export.
````

**Acceptance:** Working CSV/JSON downloads, auth-checked, links visible.

**Report back:** auth pattern used, export sizes, edge cases.

---

## P-05: Phase 9A slice 7 — per-tenant catalog mirror

**Model:** Sonnet · **Thinking:** high
**Why this model:** New page + new aggregate; mirrors existing patterns.
**Parallelizable with:** P-01, P-02, P-03, P-04, P-06, P-07, P-10, P-11, P-12.
**Prerequisites:** Phase 9A slices 1-4 landed.
**Files in scope (create):**
- `web/src/app/(workspace)/platform/admin/tenants/[id]/catalog/page.tsx`
- `web/src/app/(workspace)/platform/tenant-catalog-data.ts`
**Files OUT of scope:** anything else.
**Effort:** ~1 day.
**Suggested branch:** `engine-phase9a-slice7-tenant-mirror`.

**What this prompt completes:** Inverse of the Catalog Map — for a single
tenant, show every field they've overridden (with what), every field where
their talents have values, and risks specific to their setup. Platform-admin
ops + customer-support gold.

**Prompt (paste into a new chat):**

````
You are a senior engineer adding a per-tenant catalog inspection view to
Tulala's Platform HQ. Repo: /Users/oranpersonal/Desktop/impronta-app/. Work
in `web/`.

## Background
Platform admin has /platform/admin/catalog (catalog-first view) and
/platform/admin/tenants/[id] (tenant detail). This slice adds a NEW page
at /platform/admin/tenants/[id]/catalog showing this tenant's catalog
posture: every field they've overridden, every field where their talents
have values, risks specific to their setup.

Read these for context:
- web/src/app/(workspace)/platform/platform-data.ts (loadPlatformTenantDetail
  for tenant loading; uses `agencies` table)
- web/src/app/(workspace)/platform/catalog-map-data.ts (catalog map pattern)
- web/src/app/(workspace)/platform/catalog-field-detail-data.ts (field detail
  pattern + tenant join)
- web/src/app/(workspace)/platform/admin/catalog/page.tsx (HQ-themed
  styling tokens to mirror)

## Task

### 1. New data loader: `web/src/app/(workspace)/platform/tenant-catalog-data.ts`
- Exports `loadTenantCatalogPosture(tenantId: string)`.
- Queries:
  - `agencies` for the tenant (name, plan, entity_type, status).
  - `workspace_profile_field_settings` for tenantId → all overrides.
  - `workspace_field_group_settings` for tenantId → all group overrides.
  - `profile_field_definitions` for the field_def_ids in those overrides
    (to enrich with label/key/tier/visibility via the shared engine's
    `platformBaseVisibility`).
  - `agency_talent_roster` for tenantId, status=active → talent_profile_ids.
  - `talent_profile_field_values` for those talent_ids, workflow_state=live
    → field_definition_ids with a count (per-field, how many talents have it).
- Returns:
  - tenant header (name, plan, etc.)
  - overrides list (per-field: what they changed)
  - per-field value adoption (which fields their talents fill in, with counts)
  - risks: deprecated fields they still use; admin-only fields they made public; etc.
- Reuse the shared engine (`@/lib/field-engine/effective-visibility`) for
  the platform-default visibility column.

### 2. New page: `web/src/app/(workspace)/platform/admin/tenants/[id]/catalog/page.tsx`
- Server component, `export const dynamic = "force-dynamic"`.
- Signature: `params: Promise<{ id: string }>` (this Next version).
- HQ dark theme (match the existing catalog page tokens).
- Breadcrumb back to the tenant detail page.
- Sections:
  - Tenant header (name, plan, entity_type, status, total talents).
  - Override summary (count + cards for each overridden field).
  - Value adoption table (fields their talents have values for, with counts).
  - Risk warnings specific to this tenant.

Each field name should link to /platform/admin/catalog/[fieldKey] (cross-link
to the platform-wide view).

Also add a "Catalog" tab/link in the existing tenant detail page
(/platform/admin/tenants/[id]/page.tsx) pointing to your new page. Tiny edit.

## Constraints (binding)
- All read-only. No mutation, no migration.
- 3 files touched: 2 new + 1 small link addition.
- Branch: worktree off current phase-1 tip + node_modules symlink (mandatory).
- Gate: tsc ≤ 4 errors (baseline); lint 0 new.
- Path-scoped commit. Do NOT push.

## Acceptance
- /platform/admin/tenants/[id]/catalog renders for a real tenant with their
  override + value posture.
- Cross-links to per-field detail page work.
- "Catalog" link visible on tenant detail page.
- Branch ready.

## Report back (use the format from the prompt-pack §4)
Include: representative numbers (e.g., for Impronta), edge cases (tenant
with zero overrides), any performance concerns on large rosters.
````

**Acceptance:** New per-tenant catalog page works, cross-linked, gate clean.

**Report back:** real-tenant numbers, edge cases.

---

## P-06: Engine architecture documentation

**Model:** Sonnet · **Thinking:** medium
**Why this model:** Documentation writing from existing code; well-scoped.
**Parallelizable with:** any other Wave A.
**Prerequisites:** none.
**Files in scope (create):** `web/docs/engine-architecture.md`
**Files OUT of scope:** anything else.
**Effort:** ~½ day.
**Suggested branch:** `engine-docs-architecture`.

**What this prompt completes:** No engineer-facing overview of the engine
exists today. This is the "how to extend the engine" document — covers
tables, resolver, visibility primitive, plan-tier matrix, field-naming
conventions.

**Prompt (paste into a new chat):**

````
You are a senior engineer writing the missing architecture documentation
for the Tulala talent catalog engine. Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
The engine has these pieces but no single overview doc for new engineers:
- Canonical tables: profile_field_definitions, profile_field_groups,
  parent_category_field_groups, profile_field_recommendations,
  taxonomy_terms, talent_profile_taxonomy, agency_taxonomy_settings,
  workspace_profile_field_settings, workspace_field_group_settings,
  talent_profile_field_values.
- Legacy tables (being retired in Phase 5): field_definitions, field_values.
- Resolver: web/src/lib/server-actions/admin-taxonomy.ts (getFieldsForTalent
  + getCachedTenantFieldCatalog).
- Shared visibility primitive: web/src/lib/field-engine/effective-visibility.ts
- Plan-tier rules: FIELD_PRIVACY_PLAN_RULES in
  web/src/components/admin/shell/internal/state.tsx.
- Bridge: web/src/lib/fields/legacy-mirror.ts (canonical→legacy mirror for
  17 keys; will be retired in Phase 5).

Existing docs to reference (don't duplicate, link to):
- web/docs/talent-engine-execution-plan-2026-05-18.md
- web/docs/talent-profile-engine-master-audit-2026-05-18.md
- web/docs/talent-engine-status-2026-05-18.md
- web/docs/engine-completion-prompt-pack-2026-05-19.md

## Task
Create `web/docs/engine-architecture.md`. Target audience: a new engineer who
needs to understand the engine to extend/debug it. Sections:

1. **Overview** — one-paragraph "what the engine is and what it owns."
2. **Data model** — every table + its role + relationships (small ER
   diagram in ASCII if useful).
3. **Resolver flow** — how `getFieldsForTalent(talent_profile_id)` walks
   taxonomy → recommendations → tenant overrides → produces ResolvedField[].
   With a step-by-step example for one talent.
4. **Visibility engine** — `effectiveFieldVisibility` precedence rules,
   the 3-input model (platform default · tenant override · value override),
   most-restrictive-wins, platform floor absolute. With the truth table.
5. **Plan-tier capability matrix** — the current rules from
   FIELD_PRIVACY_PLAN_RULES + what each tier unlocks.
6. **Field naming conventions** — current state (dotted like
   `physical.body_type` vs flat like `skills`); document what we have,
   note the inconsistency as known debt.
7. **Adding a new platform field** — step-by-step: migration, INSERT INTO
   profile_field_definitions, optional INSERT INTO
   profile_field_recommendations, where it shows up automatically.
8. **The split-brain (Phase 5 in progress)** — what `mirrorWriteToLegacy`
   does, why it exists, what Phase 5 retires.
9. **Caching** — getCachedTenantFieldCatalog (120s TTL, tags
   `field-catalog` + `field-catalog:${tenantId}`), bustFieldCatalog().
10. **Platform admin inspection (Phase 9A)** — the catalog map + per-field
    detail + per-tenant catalog mirror.
11. **Known debt** — link to status doc; brief bullet list.

Read the actual code as you write — verify table names, function
signatures, etc. Don't fabricate.

## Constraints (binding)
- One new doc file. No code changes.
- Branch: doc-only change can be a simple branch off phase-1 tip; node_modules
  symlink not strictly required for a docs-only branch but doesn't hurt.
- No gate needed (docs file). But check for broken cross-doc links if you
  reference other files.
- Path-scoped commit. Do NOT push.

## Acceptance
- Doc exists with all 11 sections.
- Code references (function names, file paths) are accurate (verified
  against actual files).
- Branch ready.

## Report back (use the format from the prompt-pack §4)
Include: doc length, any ambiguities you found in the engine that need
clarification (these are bugs/design holes worth flagging).
````

**Acceptance:** Architecture doc exists, all sections, accurate.

**Report back:** doc length, ambiguities found = engineering debt items.

---

## P-07: Resolver telemetry

**Model:** Sonnet · **Thinking:** high
**Why this model:** Instrumentation needs care (don't hot-path-spam); analytical.
**Parallelizable with:** any other Wave A.
**Prerequisites:** none.
**Files in scope:**
- Edit: `web/src/lib/server-actions/admin-taxonomy.ts` (resolver instrumentation)
- Possibly: `web/src/app/t/[profileCode]/page.tsx` (aggregate the existing
  `[public-resolver-gate]` log)
- Maybe new: `web/src/lib/observability/engine-metrics.ts`
**Files OUT of scope:** drawers.tsx, anything else.
**Effort:** ~1 day.
**Suggested branch:** `engine-telemetry-resolver`.

**What this prompt completes:** Adds observability over engine reads (cache
hit rate, P95 timings). The plan acknowledges this is a premium-grade gap.

**Prompt (paste into a new chat):**

````
You are a senior engineer adding observability to the Tulala talent catalog
engine resolver. Repo: /Users/oranpersonal/Desktop/impronta-app/. Work in
`web/`.

## Background
The resolver is `getFieldsForTalent` in
`web/src/lib/server-actions/admin-taxonomy.ts`. It uses
`getCachedTenantFieldCatalog` (120s `unstable_cache`, tagged
`field-catalog` + `field-catalog:${tenantId}`). Current instrumentation:
just `console.info("[field-catalog] MISS")` and `[field-catalog] request`.

The public-profile path also logs `[public-resolver-gate]` in
`web/src/app/t/[profileCode]/page.tsx` per render.

Today there is no aggregation or metrics.

## Task
Add lightweight observability:

1. **Resolver timing.** Wrap `getFieldsForTalent` to record:
   - duration_ms
   - cache_hit (boolean — derived from whether the MISS line ran)
   - tenant_id
   - talent_profile_id
   - returned field_count
   Log as one structured line per call:
   `[engine.resolver] tenant=… talent=… cache_hit=… ms=… fields=…`

2. **Cache statistics.** Add a small in-process counter (module-local;
   process-scoped only; document that it's not durable):
   - getCachedTenantFieldCatalog hits / misses / errors
   Expose a tiny readable function `getResolverMetricsSnapshot()` that
   returns these counters for ops debug.

3. **Public-resolver-gate aggregation.** The existing
   `[public-resolver-gate]` log is per-render. Add structured key=value
   so logs are grep-able: it already does. Ensure consistent format. No
   change to behavior; just verify and improve the log line if needed.

4. **Optional: an admin-only diagnostic route**
   `web/src/app/(workspace)/platform/admin/operations/engine/route.ts`
   (GET) that returns the metrics snapshot as JSON. Guard with super_admin
   role check.

## Constraints (binding)
- DO NOT add a real metrics library (Datadog, Prometheus, etc.) — just
  structured logs + in-process counters.
- Resolver instrumentation must NOT block on telemetry — wrap in try/catch;
  if telemetry fails, the resolver still returns successfully.
- DO NOT alter the resolver's actual behavior or output shape (only add
  observability around it).
- Branch: worktree off current phase-1 tip + node_modules symlink.
- Gate: tsc ≤ 4 errors (baseline); lint 0 new.
- Path-scoped commit. Do NOT push.

## Acceptance
- Every `getFieldsForTalent` call emits one `[engine.resolver]` line.
- `getResolverMetricsSnapshot()` returns hit/miss/error counts.
- Optional diagnostic route works and is super_admin-gated.
- Branch ready.

## Report back (use the format from the prompt-pack §4)
Include: example log lines, the snapshot shape, any observed P95 from a few
test calls.
````

**Acceptance:** Structured logs + counters, no behavior change to resolver.

**Report back:** sample logs, snapshot shape, observed P95.

---

# Wave B — After SaaS plan finishes / phase-1 self-heals

---

## P-08: Incident verification

**Model:** Sonnet · **Thinking:** medium
**Why this model:** Sanity-check task.
**Parallelizable with:** P-09.
**Prerequisites:** SaaS-plan agent has committed `admin-taxonomy.ts` (verify:
`git status --porcelain -- web/src/lib/server-actions/admin-taxonomy.ts`
returns empty).
**Files in scope:** none (read-only verification).
**Effort:** ~30 minutes.
**Suggested branch:** none — read-only.

**What this prompt completes:** Confirms phase-1 tsc compiles cleanly after
the SaaS plan finishes, and inventories any unexpected damage.

**Prompt (paste into a new chat):**

````
You are a senior engineer verifying the Tulala talent catalog engine after a
multi-agent incident self-resolves. Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
Earlier in development phase-1 had 4 known tsc errors in drawers.tsx
(lines 2228, 2323, 2445, 2446 — `Property 'has_value'/'tenant_override'
does not exist on type 'ResolvedField'`). The cause: a swept-in Phase-4
panel referenced resolver fields that hadn't been committed yet. The
SaaS-plan agent has the resolver fix in their uncommitted admin-taxonomy.ts
and was expected to commit it. This prompt verifies the fix landed.

## Task
Run these checks in order, report results:

1. `cd /Users/oranpersonal/Desktop/impronta-app && git fetch origin phase-1
   && git log --oneline -5 phase-1`
2. Check working-tree state:
   `git status --porcelain -- web/src/lib/server-actions/admin-taxonomy.ts`
   (expect empty = clean = SaaS plan committed)
3. Check the resolver has the fields:
   `grep -nE "tenant_override\?|has_value\?" web/src/lib/server-actions/admin-taxonomy.ts`
4. Run full tsc:
   `cd web && npx tsc --noEmit`
   Count errors. Expect: 0 (the 4 incident errors should be gone).
5. Run lint: `npm run lint`. Expect: 0 errors (current baseline).
6. Verify Phase 9A pages still compile/render: take note of any new
   tsc errors anywhere.
7. Verify the engine-phase4-finish branch is now redundant or still useful:
   `git diff phase-1..engine-phase4-finish -- web/src/lib/server-actions/admin-taxonomy.ts`
   (likely diff is now empty or trivial — the fix converged).

## Report back
Provide:
- Current phase-1 tip sha + last 5 commit subjects.
- Working-tree state of admin-taxonomy.ts (clean/dirty).
- Resolver fields confirmed present (or not).
- tsc final error count + any non-incident errors.
- Lint error count.
- Whether engine-phase4-finish is now redundant (diff size).
- Recommended next step (e.g., "prod-promote is now unblocked" or "still
  blocked — see [X]").

## Constraints
- Read-only. Do NOT modify, commit, or push anything.
- Do NOT delete the engine-phase4-finish branch even if redundant — keep
  as a safety fallback.
````

**Acceptance:** Clear report of post-incident phase-1 health.

**Report back:** verified state, blockers (if any).

---

## P-09: Phase 4 reconcile-decide (analysis only)

**Model:** Opus · **Thinking:** medium
**Why this model:** Judgment-heavy comparison.
**Parallelizable with:** P-08.
**Prerequisites:** Incident verified (P-08 reports phase-1 tsc-clean).
**Files in scope:** none (read-only analysis).
**Effort:** ~½ day.
**Suggested branch:** none — analysis only.

**What this prompt completes:** Compares the swept-in Agent-B Phase-4 panel
(now on phase-1) against the cleaner `engine-phase4-finish` panel — produces
a recommendation: keep the swept version, or replace with the cleaner one.

**Prompt (paste into a new chat):**

````
You are a senior engineer making a quality decision about a Phase-4 UI
component in the Tulala engine. Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
Phase 4 of the engine plan is the "Agency Fields truth preview" — extending
`LiveCategoryFieldsPanel` in drawers.tsx with a read-only transparency layer
(view-as role selector + per-field source/provenance/override/value indicators).

History: An earlier multi-agent attempt produced one variant of this panel,
which got swept into phase-1 by another agent's broad `git add drawers.tsx`.
A separate, cleaner implementation exists on branch `engine-phase4-finish`
(commit 36ea80397).

The question: keep the swept-in panel, or replace it with the
engine-phase4-finish version?

## Task
1. Locate the swept-in `LiveCategoryFieldsPanel` in current phase-1's
   `web/src/components/admin/shell/internal/drawers.tsx` (it's around line
   2191; verify with grep).
2. Read both implementations side-by-side: phase-1's vs
   `engine-phase4-finish:web/src/components/admin/shell/internal/drawers.tsx`.
3. Compare across these dimensions and rate each:
   - Code quality (readability, structure, type safety).
   - Feature completeness vs the plan's Phase 4 acceptance (read
     `web/docs/talent-engine-execution-plan-2026-05-18.md` §Phase 4).
   - Visual design / UX consistency with the rest of the panel.
   - Resolver dependencies (do both use the same engine fields?).
   - Test coverage (probably neither).
4. Produce a short comparison doc + a single clear recommendation:
   - **A**: Keep swept-in (status quo; no work).
   - **B**: Replace with engine-phase4-finish panel (do a deliberate
     reconciliation pass).
   - **C**: Merge the best parts of both into a new clean implementation.
5. If the recommendation is B or C, sketch the replacement plan: what
   files, which lines, what gate, estimated effort.

## Constraints
- READ-ONLY. Do NOT modify anything. Do NOT commit. Do NOT push.
- Produce the comparison as a markdown response in your report.

## Report back
- Comparison table (rows = dimensions, cols = swept-in / engine-phase4-finish).
- Clear recommendation A/B/C with justification.
- If B or C: implementation sketch (files, line ranges, effort estimate).
````

**Acceptance:** Clear A/B/C recommendation with rationale.

**Report back:** the comparison + recommendation; the user decides.

---

# Wave C — Phase 7a (non-drawers — parallel with Wave A)

---

## P-10: Phase 7a audit log schema + write hooks

**Model:** Opus · **Thinking:** medium
**Why this model:** Schema design judgment + multi-site write integration.
**Parallelizable with:** P-01–P-07, P-11, P-12.
**Prerequisites:** none.
**Files in scope:**
- New: `supabase/migrations/<timestamp>_engine_audit_log.sql`
- New: `web/src/lib/server-actions/engine-audit.ts`
- Edit: `web/src/lib/server-actions/admin-workspace-field-settings.ts`
  (add audit-write hook to each catalog/privacy write action)
- Possibly edit: `web/src/lib/server-actions/admin-taxonomy.ts`
  (audit hook for taxonomy writes — only if it's not dirty; otherwise defer)
**Files OUT of scope:** drawers.tsx, anything UI.
**Effort:** ~1-2 days.
**Suggested branch:** `engine-phase7a-audit-log`.

**What this prompt completes:** Phase 7's audit-log foundation. Every
catalog/privacy/category change becomes attributable, queryable, reversible.
This is the SaaS-grade trust requirement.

**Prompt (paste into a new chat):**

````
You are a senior engineer building the audit-log foundation for the Tulala
talent catalog engine (Phase 7a). Repo:
/Users/oranpersonal/Desktop/impronta-app/. Work in `web/` (+ a Supabase
migration).

## Background
Today, when an agency changes a field's privacy/catalog setting via the
workspace-field-settings server actions, the change is NOT audited. The
plan's Phase 7 requires an audit log: actor user, actor tenant, surface,
field/group/category, before→after, timestamp.

Read these for context:
- web/docs/talent-engine-execution-plan-2026-05-18.md (§Phase 7)
- web/src/lib/server-actions/admin-workspace-field-settings.ts (the
  write actions: setWorkspaceFieldVisibility, resetWorkspaceFieldVisibility,
  setWorkspaceFieldCatalog, setWorkspaceFieldGroup)
- web/src/lib/saas/admin-scope.ts (requireStaffTenantAction — gives you the
  user_id + tenant_id)
- web/src/lib/talent-events/* (look for any existing event-logging pattern
  to mirror, e.g. talent_profile_field_value_history)

## Task

### 1. Migration: `supabase/migrations/<UTC timestamp>_engine_audit_log.sql`
- Create `engine_audit_log` table with columns:
  - id (uuid primary key, default gen_random_uuid())
  - tenant_id (uuid not null, references the tenants table — verify exact
    FK from existing migrations)
  - actor_user_id (uuid nullable; null for system-attributed events)
  - actor_role (text — 'agency_admin' | 'platform_admin' | 'system')
  - surface (text — 'field-privacy' | 'field-catalog' | 'field-group' |
    'taxonomy' | 'reset')
  - subject_kind (text — 'field' | 'group' | 'category')
  - subject_id (uuid — references the relevant table; not FK-constrained
    since the subject may be deleted)
  - subject_key (text — human-readable: field_key / group slug)
  - operation (text — 'set' | 'reset' | 'enable' | 'disable')
  - before_value (jsonb)
  - after_value (jsonb)
  - created_at (timestamptz default now())
- Index on (tenant_id, created_at desc) for the History rail.
- RLS: staff of the tenant can SELECT their own tenant's rows; platform_admin
  can SELECT all. INSERT only via server actions (service role bypasses RLS).
- DO NOT add update/delete RLS — audit is append-only.

Generate the timestamp with `date -u +%Y%m%d%H%M%S` per the repo's branch
governance ("one migration per agent, unique UTC timestamps").

### 2. Server action lib: `web/src/lib/server-actions/engine-audit.ts`
- Exports `logEngineAudit({ tenantId, actorUserId, actorRole, surface,
  subjectKind, subjectId, subjectKey, operation, beforeValue, afterValue })`.
- Inserts into engine_audit_log via the service-role client.
- Returns void; logs+swallows errors (audit failures must NEVER block the
  actual write — only the write's success matters for the user).

### 3. Wire hooks into existing actions
In `web/src/lib/server-actions/admin-workspace-field-settings.ts`:
- In `setWorkspaceFieldVisibility`: BEFORE the upsert, SELECT the current
  row (to capture before_value); AFTER successful upsert, call
  logEngineAudit with operation='set', subjectKind='field', etc.
- Same pattern for `resetWorkspaceFieldVisibility`,
  `setWorkspaceFieldCatalog`, `setWorkspaceFieldGroup`.
- Use the auth context's user_id + tenant_id.

DO NOT touch `admin-taxonomy.ts` if it's currently dirty in the working tree
(`git status --porcelain`). If it's clean, you may add hooks to its mutating
actions too (addCustomSubType, removeCustomSubType, setTaxonomyEnabled,
setTaxonomyFlags). If dirty, document this as a follow-up.

## Constraints (binding)
- Migration is additive — no destructive operations.
- Audit writes are fire-and-forget (errors logged, never thrown).
- Branch: worktree off current phase-1 tip + node_modules symlink.
- Gate: tsc ≤ 4 errors (or 0 if incident resolved); lint 0 new.
- Run `npm run db:push` to apply migration to remote — ONLY if explicitly
  authorized in your prompt. Default: leave the migration file uncommitted
  to the DB, report you applied it locally if you can verify, but DO NOT
  push to remote DB without explicit user OK.
- Path-scoped commit. Do NOT push to git origin.

## Acceptance
- engine_audit_log table created locally (verify with a SELECT).
- All 4 workspace-field-settings actions log audit entries.
- Tests: manually run an action via dev shell, query the audit table.
- Branch ready.

## Report back
- Migration filename + timestamp.
- Which actions are now audited.
- Sample audit row JSON.
- Whether you applied to remote DB (only if explicitly OK'd).
- Any follow-ups (e.g., admin-taxonomy.ts was dirty).
````

**Acceptance:** Audit table exists, hooks wired, sample rows captured.

**Report back:** migration + actions wired + sample row.

---

## P-11: Phase 7a cache-correctness sweep (analysis)

**Model:** Sonnet · **Thinking:** high
**Why this model:** Systematic analysis across many files.
**Parallelizable with:** P-10, P-12.
**Prerequisites:** none.
**Files in scope:** read-only.
**Effort:** ~½ day.
**Suggested branch:** none — produces a findings doc.

**What this prompt completes:** Audits every cached engine function vs every
writer to those tables; flags any cache that isn't busted on writes. The
plan's Phase 7 requires "no stale window post-save anywhere."

**Prompt (paste into a new chat):**

````
You are a senior engineer auditing cache invalidation in the Tulala talent
catalog engine. Repo: /Users/oranpersonal/Desktop/impronta-app/.

## Background
The engine caches via Next's `unstable_cache` + tag invalidation. Each
cached function has tags; each mutating action should call `revalidateTag`
on every relevant tag. Misses cause "stale data after save" bugs.

Known cached functions:
- getCachedTenantFieldCatalog in
  web/src/lib/server-actions/admin-taxonomy.ts
  Tags: `field-catalog`, `field-catalog:${tenantId}`.

Known cache-busters:
- bustFieldCatalog in
  web/src/lib/server-actions/admin-workspace-field-settings.ts
  Calls: revalidateTag(`field-catalog`, "default") +
         revalidateTag(`field-catalog:${tenantId}`, "default").

## Task
Produce `web/docs/engine-cache-audit-2026-05-19.md`:

1. List every `unstable_cache` call in `web/src/lib/**`. For each:
   - cache key parts
   - tags
   - revalidate window

2. List every action that writes to a cached table (profile_field_definitions,
   profile_field_groups, parent_category_field_groups,
   profile_field_recommendations, workspace_field_group_settings,
   workspace_profile_field_settings — these are what
   loadTenantFieldCatalogUncached reads).

3. For each writer, list which tags it busts. Flag any writer that does
   NOT bust the relevant cache tags. Note the file + line of each.

4. Also list every taxonomy-mutating action (admin-taxonomy.ts —
   setTaxonomyEnabled, setTaxonomyFlags, addCustomSubType,
   removeCustomSubType). These touch agency_taxonomy_settings /
   agency_taxonomy_terms (NOT in the cached set above) — but if they affect
   anything in the cached catalog by reference, flag it.

5. Recommendations: a prioritized list of cache-busting fixes (severity:
   "user-visible staleness after save" = HIGH; "120s natural expiry only" =
   LOW since the cache naturally expires).

## Constraints
- READ-ONLY. No code changes. Just the audit doc.
- Be precise — quote file:line for every claim.
- Branch: doc-only branch off phase-1 tip; no node_modules symlink needed.
- Path-scoped commit. Do NOT push.

## Report back
- Doc filename.
- Top-3 most important fixes (if any).
- Confirmation of which cache busts ARE properly wired.
````

**Acceptance:** Cache audit doc with findings + priorities.

**Report back:** top fixes; what's already correct.

---

## P-12: Phase 7a plan-tier capability lib

**Model:** Opus · **Thinking:** medium
**Why this model:** Refactor + new abstraction; needs design judgment.
**Parallelizable with:** P-10, P-11.
**Prerequisites:** none.
**Files in scope:**
- New: `web/src/lib/field-engine/plan-tier-capabilities.ts`
- Edit: `web/src/components/admin/shell/internal/state.tsx` (move
  FIELD_PRIVACY_PLAN_RULES + ALWAYS_INTERNAL_FIELDS to the new lib;
  re-export for back-compat)
- Possibly edit: any consumer that imports from state.tsx (re-import path).
**Files OUT of scope:** drawers.tsx.
**Effort:** ~½ day.
**Suggested branch:** `engine-phase7a-plan-tier-lib`.

**What this prompt completes:** Today plan-tier rules are scattered (in
state.tsx). This consolidates into a single source-of-truth lib in
`field-engine/` — enabling future plans to be tuned without code edits.

**Prompt (paste into a new chat):**

````
You are a senior engineer refactoring the plan-tier capability rules in the
Tulala engine. Repo: /Users/oranpersonal/Desktop/impronta-app/.

## Background
Today the plan-tier rules live in
web/src/components/admin/shell/internal/state.tsx:
- FIELD_PRIVACY_PLAN_RULES (free/studio/agency/network → boolean caps:
  canFlipPublicInternal, canHide, canCreateCustom, canSetRequired)
- ALWAYS_INTERNAL_FIELDS
- ALWAYS_VISIBLE_FIELDS
- allowedVisibilities()

This couples the rules to the admin-shell module. Phase 7 wants them as a
data-driven library so plans can be tuned without code edits and the rules
are reusable by future code (Phase 8 custom fields, Phase 9B studio, etc.).

## Task
1. Create `web/src/lib/field-engine/plan-tier-capabilities.ts`:
   - Move the type + the FIELD_PRIVACY_PLAN_RULES record verbatim.
   - Move ALWAYS_INTERNAL_FIELDS, ALWAYS_VISIBLE_FIELDS.
   - Move allowedVisibilities.
   - Add a clean named export: `getPlanCapabilities(plan: PlanTier)` that
     returns the cap record, handling unknown plans by returning the free
     defaults.
   - Add a JSDoc comment block explaining each capability.
2. In state.tsx: replace the inline definitions with re-exports from the
   new lib (to maintain back-compat for any consumers importing from
   state.tsx directly).
3. Find every consumer of FIELD_PRIVACY_PLAN_RULES (use grep). Decide:
   - If it's outside drawers.tsx and easy to update, switch the import to
     the new lib.
   - If it's inside drawers.tsx (contended), leave the re-export in
     state.tsx working — DO NOT touch drawers.tsx.

## Constraints (binding)
- Behavior must be byte-identical. Existing rules unchanged.
- DO NOT touch drawers.tsx. Use the re-export to maintain compatibility.
- Branch: worktree off current phase-1 tip + node_modules symlink.
- Gate: tsc ≤ 4 errors (baseline); lint 0 new.
- Path-scoped commit. Do NOT push.

## Acceptance
- New lib exists, fully-typed, with JSDoc.
- state.tsx re-exports from the new lib (back-compat preserved).
- Drawers.tsx untouched.
- tsc clean.
- Branch ready.

## Report back
- New lib path.
- List of consumers (grep result for FIELD_PRIVACY_PLAN_RULES).
- Which consumers were re-pointed vs left on the re-export.
````

**Acceptance:** Clean lib + back-compat re-export.

**Report back:** consumer list + import-path updates.

---

# Wave D — Phase 5 (STRICTLY SERIAL, db-gated)

These five prompts MUST run one-at-a-time, in order. Each requires user
approval to run the next.

---

## P-13: Phase 5 runbook validate

**Model:** Opus · **Thinking:** max
**Why this model:** High judgment — validating + updating a risky data-movement plan.
**Parallelizable with:** none (must complete before P-14).
**Prerequisites:** Phase 1 + 2 + 4a all live in prod (✓ done). Incident resolved (Wave B).
**Files in scope:** read-only inspection of existing runbook + code.
**Effort:** ~½ day.
**Suggested branch:** none — produces updated runbook + sequenced plan.

**What this prompt completes:** Another agent committed
`docs(engine): Phase 5 scoped execution runbook (prepared, gated)` at
`4f6c8002f`. This prompt validates that runbook against current code,
flags risks, and produces a slice-by-slice plan with rollback.

**Prompt (paste into a new chat):**

````
You are a senior engineer validating the Phase 5 (split-brain convergence)
execution runbook for the Tulala talent catalog engine. Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
The talent engine has two value-stores currently:
- Canonical: talent_profile_field_values + profile_field_definitions
- Legacy: field_values + field_definitions (read by Discover/directory/AI
  search; written via mirrorWriteToLegacy for ~17 bridged keys)

Phase 5 collapses this to one truth. An execution runbook was prepared by
another agent at commit `4f6c8002f` (`docs(engine): Phase 5 scoped execution
runbook (prepared, gated)`).

The execution plan §Phase 5 has the high-level approach.

## Task
1. Locate the runbook: `git show 4f6c8002f --stat` and read the file(s)
   added in that commit.
2. Read the current code state of the relevant pieces:
   - web/src/lib/fields/legacy-mirror.ts (the 17-key bridge)
   - web/src/lib/server-actions/admin-talent-field-values.ts (admin write
     path, uses mirror)
   - web/src/lib/server-actions/talent-field-values-catalog.ts (talent
     self-edit, has getFieldsForTalentAsTalent — the duplicate resolver)
   - web/src/lib/directory/fetch-directory-page.ts (legacy reader)
   - web/src/lib/directory/apply-directory-field-facet-filters.ts (legacy reader)
   - web/src/lib/directory/directory-search-legacy.ts (legacy reader)
   - web/src/lib/ai/ai-search-document-debug.ts (legacy reader)
   - web/src/lib/fields/values.ts (legacy reader)
   - web/src/lib/fields/field-values-height-mirror.ts (the dual height_cm path)
3. Cross-check runbook claims vs code reality. Flag any discrepancies:
   files moved, new readers added by other agents, etc.
4. Produce an updated, slice-by-slice plan with per-slice:
   - Files touched
   - Pre-flight checks (e.g., "verify backfill row count is ≥ canonical
     count for every bridged key")
   - The actual change (additive vs destructive)
   - Feature flag / shadow-run plan
   - Rollback procedure (concrete — "revert commit X, no DB work needed")
   - Gate
   - Acceptance
5. Identify the SAFEST first slice to execute (likely: dual-READ behind
   a flag, BEFORE retiring any writes).
6. Identify the HIGHEST-RISK slice (likely: retiring mirrorWriteToLegacy,
   because rollback requires re-running backfill).

## Constraints
- READ-ONLY. No code changes.
- Produce the updated runbook as a new doc:
  `web/docs/phase-5-execution-runbook-validated-2026-05-19.md` OR update
  the existing one in-place (your call; explain in the report).
- Cross-link to the canonical plan + status doc.
- Branch: doc-only; node_modules symlink not required.
- Path-scoped commit. Do NOT push.

## Report back
- Validated runbook path.
- Top 3 risks flagged.
- Discrepancies between runbook and code (if any).
- Recommended first slice to execute (P-14's exact scope).
- Per-slice rollback summary (1 line each).
````

**Acceptance:** Updated runbook with concrete slice-by-slice plan + rollback.

**Report back:** risks, discrepancies, first-slice scope.

---

## P-14: Phase 5 slice A — cutover readers (shadow → flag → switch)

**Model:** Opus · **Thinking:** max
**Why this model:** **HIGH-RISK data-movement step.** Maximum care needed.
**Parallelizable with:** none.
**Prerequisites:** P-13 complete + user `db:push` approval for any DB change
+ user explicit OK to proceed.
**Files in scope:** Per P-13's validated runbook — likely the 5+ legacy reader files.
**Effort:** ~2 days.
**Suggested branch:** `engine-phase5-slice-a-cutover-readers`.

**What this prompt completes:** Switches Discover/directory/AI-search reads
from legacy to canonical (behind a feature flag, with shadow-run first).
The legacy READ paths are retired AFTER readers prove out; legacy WRITES
stay until P-15.

**Prompt (paste into a new chat):**

````
You are a senior engineer executing Phase 5 slice A (cutover readers) for
the Tulala talent catalog engine. Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
The engine has dual value-stores: canonical + legacy. This slice switches
the READERS from legacy to canonical, behind a feature flag, with shadow-run
verification. Legacy WRITES continue (P-15 retires them later).

This is high-risk: a faulty cutover affects Discover/search/directory for
all users. Maximum care.

## Task
Read `web/docs/phase-5-execution-runbook-validated-2026-05-19.md` (or the
runbook at commit 4f6c8002f if the validated version isn't present) for the
exact slice-A scope. Follow it precisely.

General shape:
1. Add a feature flag (env var or config flag) to switch the directory
   readers between legacy and canonical.
2. Build the canonical read path for each legacy reader site:
   - fetch-directory-page.ts
   - apply-directory-field-facet-filters.ts
   - directory-search-legacy.ts
   - ai-search-document-debug.ts (if applicable)
   - lib/fields/values.ts (if applicable)
3. Shadow-run mode: log both legacy and canonical results in parallel,
   diff them, log discrepancies. Run this for 24-48 hours (or trigger
   manually for sample talents) before flipping.
4. After verified, flip the flag → canonical reads only.
5. DO NOT delete legacy reader code in this slice — leave it dead. P-15
   handles legacy-side cleanup. This makes rollback (flip flag back) trivial.

## Constraints (binding)
- NO destructive DB changes. NO retiring legacy writes (that's P-15).
- All-additive code: new canonical readers alongside legacy.
- Feature flag is the rollback mechanism.
- Branch: worktree off current phase-1 tip + node_modules symlink.
- Gate: full tsc clean; full lint clean (no new errors); add tests for any
  new query logic.
- Path-scoped commit. Do NOT push without explicit user OK.
- If any `db:push` is needed, STOP and ask for approval first.

## Acceptance
- Feature flag exists and toggles readers.
- Canonical read paths produce equivalent results to legacy (per shadow-run).
- Legacy reader code still present (dead path; for rollback safety).
- Branch ready.

## Report back
- Files changed.
- Shadow-run diff results.
- Feature flag name + how to flip.
- Rollback procedure (one line: "set FLAG=legacy").
- Recommended hold period before P-15 (default: 1 week of shadow-run + 1
  week of canonical-live).
````

**Acceptance:** Flag-gated cutover with shadow-run.

**Report back:** diff results + rollback path.

---

## P-15 through P-17: Phase 5 remaining slices

(P-15 retire-legacy-writes, P-16 collapse-resolver, P-17 height-path.)

These each follow the same pattern as P-14: read the validated runbook
section, execute the slice strictly per runbook, gate, commit, await user OK
before proceeding to the next.

**Each:**
- **Model:** Opus · **Thinking:** max
- **Parallelizable:** none (strict serial within Wave D)
- **Prerequisites:** previous slice landed + user OK
- **Constraints:** runbook-driven, additive where possible, feature-flag
  rollback, no `db:push` without explicit OK
- **Acceptance:** per runbook
- **Report back:** files changed, rollback procedure, recommended next slice

(Full prompt templates can be generated by copying P-14's structure and
substituting the slice-specific scope from the validated runbook. If you
want me to expand each into a full self-contained prompt now, ask.)

---

# Wave E — Phase 6 (after Wave D complete)

---

## P-18 through P-20: Phase 6 Discover canonical alignment

(P-18 canonical-read-layer, P-19 shadow-diff, P-20 cutover-and-retire.)

Pattern: same as Wave D — runbook-driven, flag-gated, shadow-first.

**Each:**
- **Model:** Opus · **Thinking:** medium for P-18/P-19, max for P-20
- **Parallelizable:** with each other? No — strictly serial.
- **Prerequisites:** Phase 5 fully complete + stable
- **Constraints:** new file additions OK; legacy reader code retired only
  in P-20; feature flag mandatory; shadow-run before any switch
- **Acceptance:** Discover behaves identically (or measurably better);
  every public field is canonical-searched; no admin/hidden field leaks
  into public search
- **Report back:** search-relevance diff, telemetry, recommended ramp

(Same as Wave D — expand to full prompts when you're ready to schedule
these. They depend on Phase 5 landing first.)

---

# Wave F — Phase 7b (drawers-coupled; serial vs other drawers work)

---

## P-21: Phase 7b — History rail UI

**Model:** Opus · **Thinking:** medium
**Why this model:** Substantial UI integration in a contended file; needs care.
**Parallelizable with:** **NONE** — owns the `drawers.tsx` write window.
**Prerequisites:** P-10 (audit-log schema + writes) landed + drawers.tsx
uncontended (i.e., no other agent is currently editing it).
**Files in scope:**
- Edit: `web/src/components/admin/shell/internal/drawers.tsx` (add the
  History rail drawer)
- Possibly edit: state.tsx (drawer registry)
- New: `web/src/lib/server-actions/admin-audit-history.ts` (read action for
  the engine_audit_log table)
**Files OUT of scope:** anything else.
**Effort:** ~2 days.
**Suggested branch:** `engine-phase7b-history-rail`.

**What this prompt completes:** Adds a History rail entry to the admin shell
showing every catalog/privacy/category change for the tenant. Reads from the
engine_audit_log table (built in P-10).

**Prompt (paste into a new chat):**

````
You are a senior engineer adding the History rail UI to the Tulala admin
shell (Phase 7b). Repo: /Users/oranpersonal/Desktop/impronta-app/. Work in
`web/`.

## Background
P-10 built the engine_audit_log table + write hooks. Phase 7b surfaces it
in the admin shell as a "History" rail entry (under Back Office, next to
Admin per the canonical plan).

Read these for context:
- web/docs/talent-engine-execution-plan-2026-05-18.md §Phase 7
- The drawers.tsx admin shell — find the drawer registry (around line 500
  area in drawers.tsx; look for `case "field-catalog":`) and identify how
  to add a new drawer.
- The engine_audit_log schema (in the migration produced by P-10).
- The status doc's note on the deferred History rail.

## Task

### 1. Server action: `web/src/lib/server-actions/admin-audit-history.ts`
- "use server" file.
- Exports `getTenantEngineAudit({ limit?, before? })` — paginated read of
  engine_audit_log for the staff's tenant (requireStaffTenantAction).
- Returns rows joined with display names (actor name from `profiles` or
  `auth.users`; subject label from `profile_field_definitions` /
  `profile_field_groups` / `taxonomy_terms`).
- RLS-respecting (staff sees own tenant).
- Return shape: `{ ok: true, rows: AuditRow[], hasMore: boolean } | { ok: false, error }`

### 2. New drawer in drawers.tsx
- Locate the drawer registry (search for `case "field-catalog":` to find it).
- Add a new case `"engine-history"` returning a new drawer component
  `<EngineHistoryDrawer />`.
- Build EngineHistoryDrawer: server-component-ish pattern used by other
  drawers in this file (look at FieldPrivacyDrawer / FieldCatalogDrawer
  for the exact pattern).
- UI:
  - Header: title "History" + description.
  - Body: scrollable list of audit rows, newest first. Each row shows:
    actor name · timestamp · surface · subject (with link if applicable) ·
    operation · before→after diff (compact).
  - Filter chips: surface (all/field-privacy/field-catalog/etc.); subject
    kind (field/group/category).
  - Search by actor or subject_key.
  - "Load more" button (paginated via `before` cursor).
- Plan-tier gating: Free can view; Studio+ gets filters; Agency+ gets
  search. Use the new plan-tier-capabilities lib from P-12.

### 3. Add an entry point in the admin shell
- Find where other drawers are opened from (search for `openDrawer("field-catalog")`).
- Add a "History" button/link in the Back Office area (or wherever the
  canonical plan §Phase 7 says).
- Use the existing admin-shell visual pattern.

## Constraints (binding)
- **CRITICAL: drawers.tsx contention.** Before starting, verify it's not
  dirty in main: `git status --porcelain -- web/src/components/admin/shell/internal/drawers.tsx`.
  If dirty (other agent working), STOP and report — do NOT proceed.
- Branch: worktree off current phase-1 tip + node_modules symlink.
- Gate: tsc 0 errors (incident should be resolved by this point); lint 0 new.
- Path-scoped commit. Do NOT push.
- The drawers.tsx file is HUGE (~24k lines). Be surgical — touch only the
  drawer registry + add the new EngineHistoryDrawer + the open-button location.

## Acceptance
- /admin opens History drawer (manual QA).
- Audit rows render with actor/timestamp/operation/before-after.
- Filters + search + pagination work.
- Branch ready.

## Report back
- Drawer registry line modified.
- Where the open-button was added.
- Approximate added LOC.
- Any blocking dirty-file conflicts you hit (and stopped).
````

**Acceptance:** Working History drawer with filters, search, pagination.

**Report back:** registry + open-button placement; LOC.

---

# Wave G — Phase 8 (design first)

---

## P-22: Phase 8 — Custom fields design doc

**Model:** Opus · **Thinking:** max
**Why this model:** Big design call with security + governance implications.
**Parallelizable with:** none directly, but doesn't block other Waves.
**Prerequisites:** Phase 0–7 stable (or at least Phase 5 done).
**Files in scope (create):** `web/docs/phase-8-custom-fields-design-2026-05-19.md`
**Files OUT of scope:** no code yet.
**Effort:** ~1 week (with PM/DBA collaboration).
**Suggested branch:** `engine-phase8-design-doc`.

**What this prompt completes:** The design doc + decision asks for Phase 8.
After this is approved, implementation prompts can be derived.

**Prompt (paste into a new chat):**

````
You are a senior engineer + architect producing the design doc for Phase 8
of the Tulala talent catalog engine (custom fields). Repo:
/Users/oranpersonal/Desktop/impronta-app/.

## Background
Phase 8 lets agencies (Agency/Network tier) define their own custom fields
under platform governance. Read:
- web/docs/talent-engine-execution-plan-2026-05-18.md §Phase 8 (high-level
  approach)
- web/docs/talent-engine-status-2026-05-18.md (current state)
- web/src/lib/server-actions/admin-workspace-field-settings.ts (existing
  override pattern — custom fields are similar but with tenant ownership)
- web/src/lib/server-actions/admin-taxonomy.ts (the resolver — custom fields
  must integrate here)
- web/src/lib/field-engine/effective-visibility.ts (the engine)

## Task
Produce a comprehensive design doc:
`web/docs/phase-8-custom-fields-design-2026-05-19.md`. Sections:

1. **Goal + non-goals.** What custom fields ARE and AREN'T.

2. **Ownership model.** Tenant-owned definitions. Schema options:
   - A) Separate table `agency_field_definitions` with same shape as
     `profile_field_definitions` but `tenant_id NOT NULL`.
   - B) Extend `profile_field_definitions` with nullable `owner_tenant_id`.
   - C) Single table with discriminator column.
   Compare; recommend.

3. **Governance.** How platform admin approves/reviews custom field
   definitions. State machine: draft → submitted → approved/rejected
   → published / suspended. Who can do what at each state.

4. **Hard rules.** What custom fields CANNOT do:
   - never reserved/canonical field_keys
   - never `is_sensitive=true` or `admin_only=true` (only platform can
     mark fields sensitive)
   - never show up in another tenant's resolver
   - never affect Discover/AI search unless explicitly opted in

5. **Resolver integration.** How `getFieldsForTalent` includes custom
   fields for the talent's tenant only. Add a tenant filter on the
   "custom field source" query.

6. **Visibility.** Custom fields use the same `effectiveFieldVisibility`
   primitive. Tenant override applies. No new visibility logic.

7. **Plan-tier gate.** Agency/Network only. Free/Studio: read-only display
   of any custom fields populated before downgrade.

8. **Migration.** Additive — never blocks existing flow. New migration
   adds the table(s), RLS, indices. No data movement.

9. **UI.** Where in the catalog drawer the "Add custom field" button goes
   (replaces the current "coming soon" honest lock). What the create flow
   looks like.

10. **Search/AI.** Default: custom fields excluded from Discover + AI
    search. Opt-in toggle per field. Why this default protects platform
    quality.

11. **Audit.** Custom field changes go through the engine_audit_log
    (Phase 7).

12. **Downgrade behavior.** When agency drops from Agency tier → Studio:
    existing custom fields go dormant (no edit, but display preserved);
    no data loss.

13. **Rollback.** If the entire Phase 8 needs to be reverted: drop the
    new tables; the resolver gracefully ignores missing tables.

14. **Open questions / decisions you owe the user.** Itemized.

15. **Implementation plan.** Slice-by-slice (migration → resolver →
    drawer → governance flow → search opt-in → audit hooks).

## Constraints
- Doc only. NO code yet.
- Branch: doc-only branch off phase-1 tip.
- Path-scoped commit. Do NOT push.

## Report back
- Doc filename.
- Top 3 open questions the user must decide.
- Recommended schema option (A/B/C) with justification.
- Estimated implementation effort per slice.
````

**Acceptance:** Complete design doc with recommendations + open questions.

**Report back:** open questions + recommended schema.

---

# Wave H — Phase 9B (LAST; hard-gated)

---

## P-23: Phase 9B — Editable Catalog Studio design doc

**Model:** Opus · **Thinking:** max
**Why this model:** Highest blast-radius design in the program.
**Parallelizable with:** none.
**Prerequisites:** **ALL of Phase 0–7 complete** (this is the canonical plan's
hard gate for 9B; do not start before).
**Files in scope (create):** `web/docs/phase-9b-editable-studio-design.md`
**Files OUT of scope:** no code yet.
**Effort:** ~2 weeks.
**Suggested branch:** `engine-phase9b-design-doc`.

**What this prompt completes:** The Phase 9B design doc. After approved,
implementation prompts can be derived.

**Prompt (paste into a new chat):**

````
You are a senior architect producing the Phase 9B design doc for the Tulala
talent catalog engine. Repo: /Users/oranpersonal/Desktop/impronta-app/.

## Background
Phase 9B is the Editable Platform Catalog Studio — platform admin can
safely redesign the catalog (relabel, change defaults, mark sensitive,
move between groups, deprecate, create new platform field, review tenant
overrides) via a **change-set → impact-preview → publish → rollback**
model with full audit.

This is the most blast-radius-sensitive phase. Read:
- web/docs/talent-engine-execution-plan-2026-05-18.md §Phase 9B (the canonical
  spec — read it carefully)
- The engine_audit_log + audit flow from Phase 7
- The Catalog Map + per-tenant mirror from Phase 9A (provides the impact
  preview's foundation — "which workspaces depend on this field")

## Task
Produce `web/docs/phase-9b-editable-studio-design.md`. Sections:

1. **Goal + non-goals.** What 9B IS (governed editing of the platform
   catalog) and ISN'T (not for agency-specific overrides — that's
   Phase 1/2/8).

2. **Change-set model.** Schema for storing draft changes:
   - change_set table: id, author_user_id, status (draft/published/rolled-back),
     created_at, published_at, published_by_user_id, summary
   - change_set_op table: id, change_set_id, op_kind (relabel/change-defaults/
     mark-sensitive/move-group/reassign-recommendation/deprecate/create-field),
     subject_kind, subject_id, before_value, after_value, applied_at
   Migration is additive.

3. **Allowed ops.** Strict list. Each op is reversible / non-destructive:
   - Relabel (never rename field_key).
   - Change default visibility / required / admin_only / sensitive.
   - Move field to different group.
   - Add/remove recommendation (field ↔ taxonomy_term link).
   - Deprecate (sets deprecated_at; never DELETE).
   - Create new platform field definition.
   - **NEVER**: DELETE field, rename field_key, change kind.

4. **Impact preview engine.** Computes for a draft change-set:
   - # affected talent_profile_field_values rows
   - # workspaces with an override for affected fields
   - # public-displaying talents
   - # Discover-searched fields affected
   - # duplicate or conflicting ops (e.g., two changes to same field)
   - Risk score (low / medium / high)
   Reuses Phase 9A's aggregate queries.

5. **Publish flow.** Atomic apply:
   - Validate ops (no reserved keys, no destructive intents).
   - In a transaction: apply each op to the canonical tables; insert one
     row per op into engine_audit_log; bust caches.
   - On failure: rollback transaction; mark change-set "failed".

6. **Rollback flow.** Reverse-apply ops in reverse order. Each op's
   `before_value` is the rollback target. Always preserved.

7. **Auth + RLS.** Platform admin only. Change-sets RLS-locked to author
   + co-platform-admins.

8. **UI.** New platform-admin section /platform/admin/catalog-studio.
   - Drafts list.
   - Change-set composer (add ops; impact preview updates live).
   - Publish button (with confirmation modal showing impact summary).
   - Published change-sets list (with rollback button per).
   - Audit trail link.

9. **Migration plan.** All-additive: 2 new tables + indices. No
   destructive operations on existing tables.

10. **Failure modes + recovery.**
    - Publish partial-fail mid-transaction → atomic rollback.
    - Cache busts fail post-publish → 120s natural expiry.
    - Tenant overrides conflict with published change → existing
      most-restrictive-wins rules handle (no special case).

11. **Hard rules.** Codified:
    - Never delete fields (deprecate only).
    - Never rename field_keys.
    - Never change a field's kind (string → number etc.).
    - Never bypass the impact preview before publish.
    - Never publish a change-set with unresolved conflicts.

12. **Implementation plan.** Slice-by-slice:
    - Slice 1: Migration + change_set / change_set_op tables + read-only
      list view.
    - Slice 2: Change-set composer (add/edit ops UI; no publish yet).
    - Slice 3: Impact preview engine.
    - Slice 4: Publish flow + transaction.
    - Slice 5: Rollback flow.
    - Slice 6: UI polish + audit cross-links.

13. **Open questions / decisions you owe the user.**

14. **Acceptance for the WHOLE phase.** (Per the canonical plan §Phase 9B.)

## Constraints
- Doc only. NO code yet.
- Branch: doc-only.
- Path-scoped commit. Do NOT push.

## Report back
- Doc filename.
- Top 3 design decisions the user must approve.
- Recommended slicing for implementation.
- Estimated effort per slice.
````

**Acceptance:** Comprehensive 9B design doc with slicing.

**Report back:** decisions + slicing + effort.

---

# 5. Final orchestration notes

## Wave timing recommendations

- **Today / this week:** Wave A (parallel, 5-7 prompts; pick which slices of
  9A you most want). Wave B (when SaaS plan finishes).
- **Next 2 weeks:** Wave C (Phase 7a, parallel with continued Wave A).
- **Next month:** Wave D (Phase 5, strictly serial, gated by your `db:push`
  approvals).
- **After:** Wave E (Phase 6, after 5 lands).
- **Last:** Waves F, G, H.

## When prompts finish

You'll receive reports per §4. Your job as orchestrator is to:
1. Verify the gate (re-run `tsc` + `lint` on the produced branch).
2. Cherry-pick onto phase-1 (`git cherry-pick -x <sha>`).
3. Decide if production-promote is warranted.

## Coordination tips

- **Don't run two prompts that touch the same file concurrently.** The
  conflict map: drawers.tsx (P-21 + future Phase 8/9B impls); admin-taxonomy.ts
  (Wave D slices); page.tsx of /t/ profile (Phase 3 follow-ups).
- **Hold prompts that depend on incomplete prerequisites.** Each prompt's
  "Prerequisites" section is binding.
- **For Wave D (Phase 5), expect to pause between every slice for `db:push`
  approval and a hold period to verify stability.**

## When you've executed all 23+ prompts

The engine is at "premium Tulala engine" per the §5 definition in the status
doc: one truth · trustworthy · inspectable · governable · observable ·
extensible.
