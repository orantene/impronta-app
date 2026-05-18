# Tulala Talent Catalog & Field Engine — Master Execution Plan (2026-05-18)

> The single authoritative execution plan for the most important system in Tulala: the talent catalog/field engine. Companion to `talent-profile-engine-master-audit-2026-05-18.md` (the evidence). This document is the *how* — deep, per-phase, executable by any engineer without re-deriving the architecture. No code; plan only.

---

## 0. Vision & the Engine Contract

**Vision.** The talent catalog engine is the single governed source of truth for how a talent is described, gated, shown publicly, searched, verified, and managed across talent, agency, client, and platform contexts. It is Impronta's (and every tenant's) operating core and Tulala's product moat. "Premium SaaS" here = **one truth, one resolver, tenant-governed, public-safe, observable, tier-aware, reversible.**

**The Engine Contract — invariants that must hold after every phase (CI-enforceable assertions):**

1. **One value store.** `talent_profile_field_values` is the only canonical dynamic value store. Legacy `field_values` is a read-mirror being retired, never a second truth.
2. **One resolver core.** A single pure module resolves "which fields apply + their effective state" for a talent+tenant. Editor, Agency Fields, public profile, talent self-edit, and Discover all call it. No second resolver, no per-surface reimplementation.
3. **One visibility function.** `effectiveVisibility(def, tenantOverride, valueOverride, viewerRole) → 'public'|'admin'|'hidden'` is pure, total, unit-tested, and the only place visibility is decided.
4. **Platform floors are absolute.** `profile_field_definitions.admin_only=true` or `is_sensitive=true` can never be raised to public by a tenant or talent. Reserved fixed identity/admin columns (`field-canonical.ts`) can never be redefined as dynamic fields.
5. **Overrides are additive & nullable.** Empty `workspace_profile_field_settings` / `workspace_field_group_settings` == platform defaults == today's exact behavior. Every override column is "null = inherit".
6. **No data loss, ever.** Categories/fields are deprecated or marked inactive — never deleted. Disabling never destroys `talent_profile_field_values` rows.
7. **Public is resolver-gated.** No public or Discover surface raw-queries values; everything routes through the resolver core + `effectiveVisibility`.
8. **Observable & reversible.** Every catalog/privacy/category mutation is audited (actor, tenant, before→after, ts) and triggers correct cache invalidation. Every phase is revertible by reverting its commits with zero data risk.
9. **Tenant isolation by RLS.** All tenant writes go through `requireStaffTenantAction` + the existing RLS policies; no cross-tenant read/write path.
10. **Shared-branch discipline.** `phase-1` is multi-agent: path-scoped commits, status check before each phase, never push/deploy/rebase others, never entangle another agent's uncommitted shell files.

**Current reality (from the audit, the starting line):** resolver real (`getFieldsForTalent` `admin-taxonomy.ts:833`); canonical store real (`talent_profile_field_values`, 2329/50); tenant override tables exist + RLS + write-policies + resolver-read but **0 rows / no writer**; public profile **bypasses** the resolver; Discover reads legacy; a **second resolver** exists for talent-self; private docs are **world-readable** (P0); split-brain stores for specialties/skills/contexts; `height_cm` triple-written; recommendations only at parent-category granularity.

---

## Target Architecture (what we are converging to)

A single module — proposed `src/lib/field-engine/` — exposing pure, side-effect-free functions, with thin server-action adapters around it:

- `resolveTalentFields(input: { talentTermIds, tenantId, catalog, tenantOverrides }) → ResolvedField[]` — the one resolver core. `getFieldsForTalent` becomes a thin caller (auth + load + delegate). `getFieldsForTalentAsTalent` is deleted and re-points here.
- `effectiveVisibility(def, tenantOverride, valueOverride, viewerRole) → Visibility` — the one visibility decision; enforces platform floors.
- `loadTenantCatalog(tenantId)` — `unstable_cache`, tenant-scoped key (`field-catalog:${tenantId}`), tag `CACHE_TAG_FIELD_CATALOG` (exported, actually revalidated).
- Value store accessors: read/write only `talent_profile_field_values` (+ history trigger).

Every surface (editor, Agency Fields, public `/t/[profileCode]`, Discover, talent-self) imports from here. This module is the moat.

---

## Cross-cutting principles (apply to every phase)

- **Additive & reversible:** new server actions + nullable override rows; never a destructive migration; empty tables = current behavior.
- **One primitive, many callers:** introduce shared functions in Phase 1/3, reuse thereafter — never copy logic into a drawer.
- **No fake UI in production:** a control persists or is visibly locked with honest copy. No mock save.
- **Tier-agnostic data model, tier-gated UI:** store the truth; gate capability in the UI layer (Phase 7) so we never have to migrate to add plan gating.
- **Deliberate denormalization only:** mirrors (e.g. `height_cm`) allowed only single-pathed and documented; never accidental.
- **Test the primitive before wiring it:** `effectiveVisibility` and `resolveTalentFields` get unit tests with the conflict matrix before any drawer is connected.
- **Governance gate per phase:** branch status check; path-scoped commits; QA approval before the next phase; sequence integrity (do not parallelize 3–6).

---

## Dependency / sequencing graph

```
P0 (security) ──┐
P1 (privacy real) ──► P2 (catalog real) ──► P4 (Agency Fields preview)
        │                     │
        └────────────► P3 (public resolver-gate) ──► P6 (Discover canonical)
P5 (converge split-brain) ──► P6
P7 (SaaS ops: audit/cache/tier) wraps P1–P6 outputs
P8 (custom fields) after P1–P7
P9A (read-only catalog map) after core stable ; P9B after P0–P7
```
P0 is independent and urgent. P1 is the wedge (introduces `effectiveVisibility`). P3 depends on the shared resolver core extracted in P1/P3. Nothing past P2 ships until its predecessor is QA-passed.

---

# Phase-by-phase execution

## Phase 0 — Private files security hotfix (URGENT, independent)

**Outcome:** private documents (NDA/passport/W-8/contract) are only readable/writable by the owning talent's tenant staff (and the talent), never any authenticated user.

**Why it matters:** today `storage_media_originals_select_authenticated` / `_insert_authenticated` (`supabase/migrations/20250409000000_init.sql:643-648`) grant *all authenticated users* read+write to the private `media-originals` bucket with no owner/tenant/path predicate. This is a live cross-tenant data-exposure breach — it gates nothing and blocks the whole "trust" value prop. It is independent of the catalog product and must not wait.

**Approach.** New migration that **supersedes** the broad policies:
- Confirm live policy state first: `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE '%media_originals%';` (the audit could not verify prod vs migrations — **verify before writing the fix**).
- Drop `storage_media_originals_select_authenticated` and `storage_media_originals_insert_authenticated`.
- Replace with path/tenant-scoped policies: object path is `<talent_profile_id>/documents/<uuid>`; allow SELECT/INSERT/DELETE only when the requester is (a) tenant staff with that talent on `agency_talent_roster` for their tenant, or (b) the talent themselves. Mirror the predicate already used by `actionUploadTalentDocument`/`actionDeleteTalentDocument` (`media/actions.ts:816/900`) so server actions and RLS agree.
- Keep server actions using **signed URLs** (`createSignedUrl`, 300s) — never `getPublicUrl` for `media-originals`.

**Files/DB.** New file `supabase/migrations/<UTC>_media_originals_scoped_rls.sql`. No app code change required (server actions already roster-guard). `npm run db:push` is part of this commit (CLAUDE.md protocol). RLS only — no data migration.

**Acceptance.** A second authenticated user (different tenant) cannot `select`/`download` another tenant's `media-originals` object by path (proven via a scoped client test). Tenant staff + the talent still can. Server-action upload/download/delete unaffected. No public path can reach `media-originals`.

**Test matrix.** other-tenant authed read → denied; same-tenant staff read → allowed; talent self read own → allowed; anonymous → denied; insert under foreign prefix → denied; existing admin Files drawer upload/delete → still works.

**Risks & rollback.** Risk: an over-tight predicate could break the admin Files drawer. Mitigation: derive the predicate from the exact roster check the server action already passes; stage on a scoped test before push. Rollback: revert the migration (re-adds old policies) — but treat that as a known-insecure state, not a resting place.

**Governance.** Migration → `npm run db:push` → `npx tsc --noEmit && npm run lint` → path-scoped commit (the migration file) → **no push to prod, no promote** without explicit approval (deviates from CLAUDE.md auto-deploy because branch-governance/no-push is binding; flag to founder that the fix is local until they approve the remote apply).

---

## Phase 1 — Make Field Privacy real (the wedge)

**Outcome:** an agency setting a field's visibility (Public / Admin-only / Hidden) **persists** to `workspace_profile_field_settings`, survives refresh, and is honored identically by the Details editor, Agency Fields, and (after P3) the public profile.

**Why it matters:** this converts the first mock control into real tenant governance with **zero migration** (schema + RLS + write-policy + resolver-read already exist; the table is empty so empty == today). It also introduces `effectiveVisibility` — the primitive every later phase reuses. Highest leverage, lowest risk.

**Architecture.** Create the shared `effectiveVisibility(def, tenantOverride, valueOverride, viewerRole)`:
- Inputs: `profile_field_definitions` row (`default_visibility[]`, `show_in_public`, `admin_only`, `is_sensitive`), the tenant `workspace_profile_field_settings` row (nullable: `show_in_public_override`, `admin_only_override`, `default_visibility_override[]`), the per-value `talent_profile_field_values.visibility_override[]`, viewer role.
- Precedence (most-restrictive-wins, platform floor absolute): platform `admin_only|is_sensitive` ⇒ never public; else tenant override may only *restrict* (public→admin/hidden), never *raise*; else talent value override may only *narrow within* tenant-allowed; staff/admin see admin+hidden where roster-permitted. Pure, total, unit-tested against the conflict matrix in §9 of the audit.

**Server actions** (new, in `src/lib/server-actions/admin-workspace-field-settings.ts`, `requireStaffTenantAction`, Zod-validated):
- `getWorkspaceFieldSettings({}) → { rows: WorkspaceProfileFieldSetting[] }` (tenant-scoped read; RLS `wpfs_select_tenant_or_platform`).
- `setWorkspaceFieldVisibility({ field_definition_id, visibility: 'public'|'admin'|'hidden' }) → ok` — upserts `workspace_profile_field_settings` (onConflict `tenant_id,field_definition_id`), mapping `visibility` → `show_in_public_override`/`admin_only_override`/`default_visibility_override`, stamps `last_changed_by_user_id`, blocks raising platform `admin_only`/`is_sensitive` to public (server-side enforcement mirroring `effectiveVisibility`). RLS `wpfs_write_tenant_or_platform`.
- `resetWorkspaceFieldVisibility({ field_definition_id })` → sets overrides null (inherit platform).

**Resolver wiring.** `getFieldsForTalent` already loads `workspace_profile_field_settings` (currently always empty); route its visibility computation through `effectiveVisibility`. `LiveCategoryFieldsEditor` + `LiveCategoryFieldsPanel` already consume the resolver → automatically reflect overrides once rows exist.

**UI.** Replace `FieldPrivacyDrawer` (pages.tsx ~20252) in-memory `PROFILE_FIELD_META`/`effectiveFieldVisibility`/`setFieldVisibility` with the real actions: load on open, optimistic toggle + reconcile, per-field reset, save toast, error state, disabled+explained for platform-floored fields. Remove the proto context for this drawer.

**Cache.** Export `CACHE_TAG_FIELD_CATALOG`; make `getCachedTenantFieldCatalog` key tenant-scoped (`field-catalog:${tenantId}`); call `revalidateTag(CACHE_TAG_FIELD_CATALOG)` at the end of every successful write action. Keep the 120s TTL as backstop.

**Files/symbols.** New: `src/lib/field-engine/effective-visibility.ts` (+ unit test), `src/lib/server-actions/admin-workspace-field-settings.ts`. Edit: `admin-taxonomy.ts` (use `effectiveVisibility` in `getFieldsForTalent`; export cache tag; tenant-scoped key), `pages.tsx` `FieldPrivacyDrawer`. **No `talent_profiles`/values/migration changes.**

**Acceptance.** Toggle a field to Admin-only in the drawer → persists (`workspace_profile_field_settings` row) → refresh keeps it → Details editor shows the admin state → Agency Fields reflects it → (post-P3) public hides it. Platform `admin_only` field cannot be raised to public (UI disabled + server rejects). Empty table = byte-identical to today. No mock state remains in this drawer.

**Test matrix.**

| Change | Settings drawer | Details editor | Agency Fields | Public (post-P3) | Discover |
|---|---|---|---|---|---|
| Field → Public | persists | editable | shows public | visible | unchanged (legacy) |
| Field → Admin-only | persists | editable, admin tag | shows admin | hidden | n/a |
| Field → Hidden | persists | editable, hidden tag | shows hidden | hidden | n/a |
| Reset to default | clears row | inherits platform | inherits | inherits | n/a |
| Raise platform admin_only→public | blocked (UI+server) | stays admin | stays admin | stays hidden | n/a |
| Refresh after save | retained | retained | retained | retained | n/a |

**Risks & rollback.** R: wrong precedence over-hides. M: `effectiveVisibility` unit-tested first; default override = null. R: cache stale post-save. M: explicit `revalidateTag` + tenant key. Rollback: revert the two new files + the `admin-taxonomy.ts`/`pages.tsx` diffs; empty `workspace_profile_field_settings` ⇒ exact pre-phase behavior, zero data risk.

**Governance.** Server actions + `field-engine` are clear of the other agent's hot shell files; `pages.tsx` drawer edit is the only shell touch — confirm not other-agent-dirty at start. tsc+lint gate, path-scoped commit, no push.

---

## Phase 2 — Make Field Catalog MVP real

**Outcome:** agencies really control, per workspace: enable/disable a platform field, relabel + helper text, mark required, and enable/relabel a field **group** — all persisted; deferred capabilities are visibly locked, not faked.

**Why it matters:** completes the agency control plane on top of the same ready tables. With P1+P2 an agency can shape its roster's profile without the platform — the SaaS value prop.

**Architecture.** Extend the Phase-1 action module:
- `setWorkspaceFieldCatalog({ field_definition_id, enabled?, required?, custom_label?, custom_helper? })` → upsert `workspace_profile_field_settings.enabled_override`/`required_override`/`custom_label`/`custom_helper`.
- `setWorkspaceFieldGroup({ field_group_id, is_enabled?, custom_label?, helper_text? })` → upsert `workspace_field_group_settings` (RLS `wfgs_all_tenant_staff`).
Resolver already honors `enabled_override`/group `is_enabled`/`custom_label`/`required_override` at `admin-taxonomy.ts:1037/1043/1097/1166` — so wiring the writer activates them.

**Scope decision (locked):** build now = enable/disable, relabel, helper, required, group enable/relabel. **Defer:** reorder (`display_order_override` exists, low value), category-specific requirements. **Out (P8):** agency *custom new* field definitions — `profile_field_definitions` is platform-global; needs ownership/abuse governance.

**UI.** Replace `FieldCatalogDrawer` (pages.tsx ~19913) and `WorkspaceFieldSettingsDrawer` (~19516) mock constants with real reads/writes. Custom-new-field surface = explicit locked card "Platform-managed — request via support" (no fake button). Per-row save/reset; group section with enable + relabel.

**Files.** Edit `admin-workspace-field-settings.ts` (+group action), `pages.tsx` two drawers, reuse `effectiveVisibility`/resolver. No migration.

**Acceptance.** Disable a field for the workspace → it disappears from that tenant's Details editor + Agency Fields + public, but the platform definition and other tenants are untouched and `talent_profile_field_values` rows are preserved. Relabel → new label everywhere resolved. Required → publish/completion gate honors it. Locked items render as locked, never as working buttons. Agency Fields panel updates accordingly.

**Risks & rollback.** R: disabling a field hides existing values confusingly. M: Agency Fields preview shows "disabled by workspace — value retained"; never deleted. Rollback: revert; empty table = today.

---

## Phase 3 — Resolver-gate the public profile

**Outcome:** `/t/[profileCode]` renders **only** fields that are `live` ∧ effective-visibility public ∧ applicable to the talent's *current* taxonomy ∧ tenant-enabled ∧ not admin_only/hidden/deprecated — via the same resolver core as the editor. No raw value query, no legacy `field_definitions` visibility path.

**Why it matters:** public safety + trust + correctness. Today the public page (`src/app/t/[profileCode]/page.tsx`, `fetchPublicFieldValues` ~:377) bypasses the resolver: its own visibility logic + sidebar gating via legacy `field_definitions` (`public-profile-field-visibility.ts:24`). A value written for a category the talent no longer has still shows publicly; once P1/P2 overrides exist they would NOT apply publicly. This is the highest-severity correctness/safety gap after P0.

**Architecture.** Extract a public-safe resolver entry from the shared core: `resolvePublicFields(profileCode) → { talent, fields }` that (a) loads the talent + tenant + taxonomy, (b) runs `resolveTalentFields`, (c) filters to `effectiveVisibility(...) === 'public'` for `viewerRole='public'`, (d) joins values from `talent_profile_field_values` for only those resolved field ids. Replace `fetchPublicFieldValues` + the legacy `getPublicProfileFieldVisibility` sidebar gate with this single path. Values for non-applicable/disabled categories are simply not in the resolved set → not rendered (DB rows preserved).

**Files.** `src/app/t/[profileCode]/page.tsx` (swap read path), retire/replace `public-profile-field-visibility.ts` usage, reuse `field-engine`. Also audit `share/talent` if it uses the same path. No migration; no value mutation.

**Acceptance.** Admin-only/hidden never appear publicly (incl. once tenant overrides exist). A value from a disabled/removed category does not render publicly but remains in DB and admin editor. Deprecated/non-live values never render. Empty fields render per the agreed rule ("not provided" vs hidden — confirm in §20). Public output is a strict subset of `resolveTalentFields ∩ public`.

**Test matrix.** field public → shows; admin-only → never; hidden → never; talent changes type, old value exists → not public, preserved; deprecated def → not public; tenant hides a public field (P1) → not public; two agency sites, different overrides → different public sets, same underlying values.

**Risks & rollback.** R (medium, public-facing): gating could hide currently-shown fields. M: ship behind a server flag; diff the resolved public set vs current for a sample of live profiles before flipping; values never deleted ⇒ fully reversible. Rollback: revert page read path.

---

## Phase 4 — Agency Fields truth preview

**Outcome:** the Back-Office "Agency Fields" panel becomes the **read-only transparency layer**: per talent, per field — why it appears (which category/recommendation), universal vs type-specific, effective visibility, required (platform vs agency), platform-default vs agency-override, active/inactive, value present/missing — with **"view as: public client / admin / talent"** modes.

**Why it matters:** trust. Agencies will only rely on the engine if they can see exactly what it resolves and what each audience sees. Cheap once P1–P3 exist (pure reuse of the resolver + `effectiveVisibility`).

**Architecture.** Extend `LiveCategoryFieldsPanel` (`drawers.tsx:2174`) to render, alongside each resolved field: `source` (recommendation/parent category id + universal/global/type-specific tier), `effectiveVisibility(viewerRole)` for the selected "view as" role, `required` + its origin, override badge (platform vs `workspace_profile_field_settings`), active flag, and value-present indicator (read `talent_profile_field_values` existence, not the value, unless admin view). Stays read-only; editing remains in Details. "View as" is a client-side role selector feeding `effectiveVisibility`.

**Files.** `drawers.tsx` (`LiveCategoryFieldsPanel` only — confirm not other-agent-dirty), reuse `field-engine`. No migration.

**Acceptance.** For any talent, the panel correctly explains every field's presence + visibility + source + override + missing-value; "view as public" matches exactly what P3 renders publicly; read-only (no writes).

**Risks & rollback.** Low. Rollback: revert the panel diff (panel reverts to definitions-only).

---

## Phase 5 — Converge split-brain storage (one value store, one resolver)

**Outcome:** specialties/skills/contexts/refinement persist to canonical `talent_profile_field_values` (not legacy `field_values`); `getFieldsForTalentAsTalent` is deleted and talent-self uses the shared resolver core; dual-store conditionals (languages/service-area/`height_cm`) reduced to one documented path each.

**Why it matters:** removes the structural fragility that blocks scale and causes editor/Discover/public divergence. Prerequisite for trustworthy Discover (P6) and for any future onboarding/API.

**Approach (staged, data-safe).**
- Inventory the ~17 bridged keys + the `profile-shell-dyn-field-values.ts:143` legacy writes + `mirrorWriteToLegacy`. For each: define the canonical `profile_field_definitions` target.
- Dual-write → backfill → cutover: keep legacy mirror writing during transition; write canonical too; backfill historical legacy `field_values` into `talent_profile_field_values` (idempotent, never overwrite a newer canonical value); switch readers to canonical; retire legacy writes last. Migration is *additive* (backfill), never deletes legacy until a separate explicit cleanup phase.
- Collapse resolvers: re-point `getFieldsForTalentAsTalent` (`talent-field-values-catalog.ts:183`) to `resolveTalentFields` with `viewerRole='talent'`; delete the divergent reimplementation.
- `height_cm`: single mirror path (drop one of the two) documented in `field-values-height-mirror.ts`.

**Files/DB.** `profile-shell-dyn-field-values.ts`, `talent-field-values-catalog.ts`, `field-values-height-mirror.ts`, `field-engine`. Additive backfill migration(s) — one per agent, unique UTC timestamp, `npm run db:push` part of commit, **never delete legacy rows in this phase**.

**Acceptance.** Specialties/skills/contexts edited in the drawer land in `talent_profile_field_values` and resolve in the editor + Agency Fields; talent-self and admin resolve byte-identical field sets (same core); no talent value lost (row counts: canonical ≥ pre-phase; legacy untouched); `height_cm` written by exactly one path.

**Risks & rollback.** R (high — data movement): backfill collisions. M: idempotent, never-overwrite-newer, dry-run counts first, keep legacy intact (reversible by reverting readers). Rollback: switch readers back to legacy; canonical extra rows are harmless.

---

## Phase 6 — Discover/search canonical alignment

**Outcome:** Discover card display, facet filters, and keyword search read canonical `talent_profile_field_values` through the shared resolver + `effectiveVisibility`, so search reflects the real engine and never leaks hidden/admin-only.

**Why it matters:** discovery at scale. Today `fetch-directory-page.ts:733`, `apply-directory-field-facet-filters.ts:56`, `directory-search-legacy.ts:56` read legacy `field_values`/`field_definitions` (407/25 — a fraction of 2329/50); non-bridged fields are unsearchable; future bridge expansion risks leaking restricted fields.

**Approach.** After P5 (canonical is complete), introduce a Discover-facing read that selects canonical values filtered by `effectiveVisibility(viewerRole='public') === 'public'` for facetable/searchable defs; build/refresh a denormalized search projection (deliberate, single-pathed) keyed off canonical + the resolver, not a hand-maintained mirror. Retire the legacy bridge reads. This is its own search-infra phase with its own QA; **deferred until P5 lands**.

**Acceptance.** Every public field is searchable/facetable; no admin-only/hidden field influences public search; disabled-category talents drop from that facet; editor and Discover never silently disagree.

**Risks & rollback.** R (medium): search relevance regression. M: shadow-run new vs legacy results before cutover; keep legacy path behind a flag for one release. Rollback: flip flag to legacy.

---

## Phase 7 — SaaS operations layer

**Outcome:** the engine is operable across many tenants: audited, cache-correct, reset-able, plan-tier-gated.

**Why it matters:** turns the control plane into a sellable, supportable SaaS product. Without this, agency edits are silent, support can't see who changed what, and plan packaging can't be enforced without a later migration.

**Approach.**
- **Audit:** extend the existing `talent_profile_field_value_history` model with a catalog/privacy/category change log (actor user, actor tenant, surface, field/group/category, before→after, ts). Resolve actor name tenant-scoped (RLS-safe) and actor agency. Surface in Back Office → History (the deferred rail entry — needs the shell, schedule when `drawers.tsx` is clear).
- **Cache:** finalize tenant-scoped keys + `revalidateTag` on every Phase-1/2/5 write (audit there is no missed path).
- **Reset-to-platform-default:** per field/group/category, one action that nulls overrides (already partly in P1; generalize).
- **Plan-tier gating:** wire capability checks (Free=view, Studio=privacy+enable/disable, Agency=+relabel/required/group, Network=+future custom) to the plan catalog. Data model already tier-agnostic (Phase 1–2 stored truth); this is UI/guard only — no migration.

**Acceptance.** Every catalog/privacy/category change is attributable (who/tenant/when/before→after) and visible in History; no stale window post-save anywhere; reset returns to platform default; capabilities match plan tier; downgrading a plan never deletes stored overrides (they go dormant).

**Risks & rollback.** Low–medium (audit schema = additive migration). Rollback: revert; audit table additive.

---

## Phase 8 — Custom fields (future, platform-governed)

**Outcome:** agencies (Agency/Network tier) can request/define tenant-scoped custom fields under platform governance, never global, never sensitive, never reserved.

**Why it matters:** the long-tail flexibility selling point — but only safe once the core is one truth (P1–P7), else it multiplies the mess and breaks search.

**Approach (high-level; full spec when scheduled).** New ownership model: tenant-scoped definitions (a `tenant_id` owner on a custom-defs surface or a separate `agency_field_definitions` table) — **migration required**, platform-admin approval workflow, hard exclusion of reserved/canonical keys, tier gate, included in the resolver + `effectiveVisibility` like any field but flagged `agency-custom`. Search/AI inclusion explicit opt-in. **Risk: high.** Deferred.

**Acceptance (when built).** A tenant custom field resolves only for that tenant, never leaks cross-tenant, cannot be sensitive/admin-floor-violating, is searchable only if explicitly enabled, and is fully governed/auditable.

---

## Phase 9A — Read-Only Platform Catalog Map

**Outcome:** platform admin can inspect the *entire* engine from one place — taxonomy → groups → resolved fields, global vs category-specific, visibility/required defaults, fixed-vs-dynamic, **workspace adoption + field-usage intelligence + risk warnings**. Zero mutation.

**Why it matters:** Tulala becomes a platform-owned engine, not a pile of forms. Platform admin can answer "what exists, who depends on it, what's unused/dangerous, what breaks if I change `height`" — the prerequisite for ever safely redesigning the catalog.

**Architecture.** Platform-admin-only route/section (separate from tenant Settings; gated by platform-admin role, not tenant staff). All data via **read-only aggregate queries over the canonical engine** (`profile_field_definitions`, `parent_category_field_groups`, `profile_field_recommendations`, `taxonomy_terms`, `talent_profile_field_values`, `workspace_profile_field_settings`, `agency_taxonomy_settings`, tenant + plan tables) + the shared resolver — **never a second engine**. Heavy aggregates → cached, paginated, indexed; consider read-replica/materialized view for usage counts if volume warrants (decide at build).

**Capabilities (read-only):**
- **Catalog map:** parent_category → category_group → talent_type → field groups → resolved fields; tier (universal/global/type-specific); visibility/required defaults; fixed-schema vs dynamic.
- **Workspace usage intelligence:** per type/category/field/group — counts by workspace type (agency/studio/hub/free) & plan, total talents, public vs hidden, active vs inactive; expandable to workspace names (name·type·plan·talent count·public profiles·last active).
- **Field usage intelligence:** per field — talents-with-value, workspaces/agencies/studios/hubs using, public-displaying, override count, which types/categories cause it, global vs category-specific, fixed vs dynamic; expandable type + workspace tables.
- **Filters/analytics:** workspace type, plan, parent category, talent type, group, field, visibility, required, has-override, has-values, used-in-public/Discover/AI, deprecated/active, duplicate/conflict, high/low usage, last updated/used (e.g. "fields >100 talents", "fields no workspace uses", "public+sensitive", "types enabled but zero talents", "all fields overridden by Impronta").
- **Risk warnings:** duplicate/unused/deprecated/over-broad/unsafe assignments; "risky to change" (many workspaces depend).

**Files/DB.** New platform-admin surface + read-only aggregate server actions; reuse `field-engine`. No mutation, no migration (read-only; add indexes only if needed for aggregate performance — additive).

**Acceptance.** For any field/type/category, platform admin sees accurate adoption + usage + risk, expandable to real workspace names, with the filter set above; no write/delete/publish path exists; numbers reconcile with direct DB counts.

**Risks & rollback.** R: heavy aggregates on prod. M: cache + pagination + (if needed) materialized view; read-only so worst case is slow, not unsafe. Rollback: remove the surface.

---

## Phase 9B — Editable Platform Catalog Studio (governed)

**Outcome:** platform admin can safely redesign the catalog — relabel, change default visibility/required, mark sensitive/admin-only, move field between groups, (re)assign to parent/category-group/talent-type, deprecate, create replacement/new platform field, review tenant overrides — each via **draft → impact-preview → publish → rollback** with full audit. **Deprecate, never delete; preserve all values.**

**Why it matters:** completes platform ownership of the engine. But it edits *global* truth affecting every tenant — only safe after the core is real, gated, observed.

**Hard prerequisites (gate):** P0 (files secure), P1 (privacy real), P2 (catalog real), P3 (public resolver-gated), P5/P6 (one store + search aligned), P7 (audit + reliable cache). Do not start 9B before all of these.

**Architecture.** Mutations are platform-admin-only, RLS-enforced, behind a **change-set model**: draft change-set → computed **impact preview** (affected talent types / workspaces / talent profiles / public-displaying count / agency-studio-hub usage / Discover+public usage / override count / duplicates) → explicit publish (with audit) → rollback (revert change-set). Destructive intents are redirected: rename ⇒ relabel; remove ⇒ deprecate + optional replacement field; reassignment ⇒ additive recommendation change with impact shown. New platform field = create definition (+ optional recommendation), never auto-enabled per tenant. Every action audited (Phase 7 log).

**Boundary (codified).** Platform owns: which fields exist, sensitive/admin-only hard floors, default assignments, category/type recommendations, global fields, groups, search/AI/verification flags. Agency only overrides within allowed bounds per plan (P1/P2). Agency can't make sensitive public, redefine reserved fixed fields, or create global fields. 9B governs the platform side; the engine remains one.

**Acceptance.** No destructive op exists (deprecate/replace only); every edit shows accurate impact before publish; publish is audited and reversible; tenant overrides surfaced before a platform change; reserved/canonical keys are uneditable; zero talent values destroyed.

**Risks & rollback.** R: highest in the program (global blast radius). M: change-set + mandatory impact preview + draft/publish/rollback + audit + the full gate of prerequisite phases. Rollback: revert change-set; values never destroyed.

---

## Program-level acceptance (definition of done for the engine)

The engine is "premium SaaS core" when: every surface (editor, Agency Fields, public, talent-self, Discover) resolves from one core + one `effectiveVisibility`; tenant privacy/catalog/category controls are real, RLS-isolated, audited, cache-correct, reversible; the public profile cannot leak admin-only/hidden/stale/private data; private files are tenant-scoped; specialties/skills/contexts are canonical; plan tiers gate capability without migration; and platform admin has full read (9A) — later governed write (9B) — visibility of the whole engine. CI asserts the §0 invariants.

## Risk register (top, program-wide)

1. Cross-tenant private-doc exposure (P0) — **critical, fix first**.
2. Public stale/over-exposure until P3 — high.
3. Split-brain divergence until P5 — high (search/public correctness).
4. Dual-resolver drift until P5 — medium.
5. Cache staleness until P1/P7 — medium.
6. L1-only recommendations (all 584) — medium product limitation; field sets don't differ per subtype (accept for MVP; revisit as a dedicated phase).
7. 9B global blast radius — highest if mis-sequenced; fully gated.
8. Shared-branch entanglement — process risk; mitigated by governance.

## Final recommendation

Approve and execute in this exact order, one phase fully QA-passed before the next, no parallelization of 3–6:

1. **Phase 0 now** (security — independent, urgent; flag remote-apply for approval).
2. **Phase 1 next** (the wedge: introduces `effectiveVisibility`, real privacy, zero migration, fully reversible).
3. Then 2 → 3 → 4 → 5 → 6 → 7; 8 and 9 are future, 9A high-value/low-risk once core is stable, 9B only after 0–7.

**Before any coding:** founder approval of the §17 product decisions in the master audit (privacy model + precedence floors, catalog MVP scope, category-preserve rule, cache strategy, governance, plan-tier matrix) and confirmation that Phase 0's remote DB apply is authorized. **Do not touch yet:** Discover/legacy bridge (until P6), custom fields, `profile_field_definitions` as platform-global (until 9B), the Details write path, talent values, and any other-agent-dirty shell file. No push/deploy without explicit approval.

*Plan only — no code, no runtime change. Companion evidence: `talent-profile-engine-master-audit-2026-05-18.md`.*
