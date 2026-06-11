# Field-Engine Final QA + "One-Database" Audit — Handoff

> Self-contained brief for a fresh agent/engineer to QA the entire profile-field engine on
> production, prove or disprove the "one database / single source of truth" goal
> (`public.profile_field_definitions`), and produce a ranked punch-list of what remains.
> Created 2026-06-10 after shipping the Services-section duplication fix (PR #308).

## MISSION
Three parts, in order:
1. **QA every surface of the profile-field engine on PRODUCTION** and report PASS/FAIL with evidence.
2. **Prove or disprove the goal: "the whole engine runs off ONE source of truth"** — `public.profile_field_definitions`.
3. **Produce a ranked punch-list of what remains** to make it truly one source of truth, with effort + risk + danger flags. Do NOT silently fix-and-ship large changes; investigate, report, and only change after stating a plan and (for irreversible steps) getting a go-ahead.

Read `CLAUDE.md` and the auto-memory at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/` first — especially `project_field_engine_unification.md`, `incident_supabase_compute_throttle_2026-06-10.md`, and `MEMORY.md`.

## BACKGROUND — what's already built (QA, don't rebuild)
- **P0** registered ~309 fields into `profile_field_definitions` + tagged each field's `section` to an editor-section slug; built the platform-admin "Profile Fields / Section Fields" hub ("N mapped / 0 unmapped").
- **P1** repointed the client editor to the DB registry (resolver `resolveTalentFields`).
- **P2** retired the static field catalog to fallback/seed only.
- **P3** ran a 5-stage value-unification ladder per family (Tier D rosters, A scalars, B JSONB blobs, C pronouns): dual-write → backfill → parity SQL → flip reads → **Stage-5 column drops (DEFERRED — never run)**.
- **Gender** migration (inclusive option set) — gender kept on a dedicated column (legacy mirror + query-critical).
- **Registration wizard** flipped to the full DB field set; admin **drag-drop registration-fields configurator** shipped (`/platform/admin/tenants/[id]/registration-fields`).
- **Pagination fix** for the 1000-row PostgREST cap on `taxonomy_terms`.
- **Services-section duplication fix (PR #308, commit `2ee3017c4`)** — the editor's "Services/Details" catalog editor leaked ~10 sub-groups duplicating dedicated rail sections; fixed by routing the catalog editor by `profile_field_definitions.section` and only rendering the "Details" catch-all sections. Canonical `SECTION_FIELD_SECTIONS` map moved to `web/src/lib/profile-editor/section-field-mapping.ts`. **NOT visually QA'd in the live drawer (see gotcha) — confirming it is part of this job.**

## DATA MODEL (the crux of the audit)
Canonical registry: **`public.profile_field_definitions`** (~309 active). Key columns:
- `field_key`, `label`, `tier` ∈ {universal, global, type-specific}
- `section` — rail section (identity/about/location/logistics/media/albums/polaroids/rates/commercial_terms/availability/credits/limits/files/social_proof/verifications/agency_fields/admin/measurements/wardrobe/type-specific/refinement/skills/…)
- `field_group_id` → `profile_field_groups` (13), mapped to talent types via `parent_category_field_groups`
- `render_mode` ∈ {catalog (generic FieldEditor), bespoke (hand-coded section editor)}
- `storage_mode` ∈ {field_values (`talent_profile_field_values`), dedicated (column on `talent_profiles` / dedicated table)}
- `deprecated_at`, `display_order`, `show_in_registration|edit_drawer|public|directory`, …

Value store: **`talent_profile_field_values`**. Per-tenant overrides: **`workspace_profile_field_settings`** + **`workspace_field_group_settings`**. Editor layout: **`profile_editor_sections`** + **`profile_editor_section_groups`**.
Resolver (single read path): `web/src/lib/field-engine/resolve-talent-fields.ts` → `ResolvedField[]` + `ResolvedFieldGroup[]`; consumed by `getFieldsForTalent` (`web/src/lib/server-actions/admin-taxonomy.ts`) and the editor (`web/src/components/admin/shell/internal/live-category-fields-editor.tsx`).

**Systems NOT (yet) unified into `profile_field_definitions` — the audit targets:**
1. **`public.field_definitions`** (a SECOND field system, ~42 rows) — powers DIRECTORY FILTERS with its own vocabulary (System A slug vs System B label; dual-catalog select-value bug patched in PR #196). **The prime "other database to move."**
2. **Dedicated columns** (`storage_mode='dedicated'`) — gender, dob, legalName, stageName, businessLine, contacts, etc. still on `talent_profiles` columns, mirrored as catalog entries. P3 Stage-5 drops never run; gender + dob deliberately kept dedicated.
3. **Taxonomy** (`taxonomy_terms`, `talent_profile_taxonomy`) — skills/categories; legitimately a separate taxonomy, not a "field." Confirm intentional.
4. **Media** (`media_assets`, `media_albums_data`) — separate + appropriate; confirm.

## ENVIRONMENT & ACCESS
- **Prod Supabase ref: `pluhdapdnuiulvxmyspd`** (Small / `ci_small`, us-east-2). Use read-only SELECTs for the audit (`execute_sql` MCP / Management API).
- **Vercel: project `tulala`, team `oran-tenes-projects`.** Domains: `improntamodels.com` (storefront), `app.tulala.digital` (admin), `tulala.digital` (marketing), `impronta.tulala.digital`. `main` auto-deploys; **re-alias all four after any deploy** + `cd web && npm run deploy:smoke`.
- **Login WITHOUT a password** (don't type passwords; qa-admin@impronta.test = SUPER_ADMIN):
  `POST {NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link` headers apikey+Bearer = `SUPABASE_SERVICE_ROLE_KEY`, body `{"type":"magiclink","email":"qa-admin@impronta.test","options":{"redirect_to":"https://app.tulala.digital/platform/admin"}}` → take `hashed_token` → navigate to `https://app.tulala.digital/auth/confirm?token_hash=<hashed_token>&type=magiclink&next=/platform/admin`. (env in `web/.env.local` / `web/.env.vercel.local`.)
- **Test talents** (read/edit, don't delete): **vv** = `TAL-92067` / `f6128d30-d82f-43b6-8e18-7e0dd642f701` (Fashion Model, the duplication-bug subject); **Pau** = `c61df1e3-4db9-4deb-8706-d94beffd1d09`; Orlando (TAL-92026, MXN); Opus Tester (TAL-92027).

## HARD CONSTRAINTS / GOTCHAS
- **DO NOT fan out heavy parallel DB work against prod.** A prior session throttled the Small compute and took the live site down (localhost dev points at PROD Supabase). Serialize; keep SELECTs light.
- **The talent editor drawer (`TalentProfileShellDrawer`) will NOT open via automated/synthetic clicks** — it opens via an `openDrawer()` React-context action (`TalentPage-1.tsx` `openProfile`) that doesn't fire from MCP/Preview clicks (verified across Chrome MCP + Preview MCP, card + "Continue editing"). It opens instantly for a human. So for drawer-visual checks: drive it another way, ask the human to click+screenshot, or verify the underlying data/logic and mark the visual human-pending.
- **Raw `*.vercel.app` previews 404** (middleware gates on `agency_domains`). QA on real domains; promote/alias a preview to test it.
- **Migrations**: `npm run db:push` often fails on history drift — fallback `node --env-file=.env.vercel.local scripts/apply-migration.mjs <file>`; `npm run db:check` lists unapplied. Any new migration MUST be applied to remote before the dependent code merges.
- Gate before every commit: `cd web && npx tsc --noEmit && npm run lint`. Tests: `tsx --test <file>` (NOT `node --test` — can't load .ts) or `npm run test:components` (vitest).

## PART 1 — QA EVERY SURFACE (PASS/FAIL + evidence)
A. **Platform-admin Profile Fields hub** — `app.tulala.digital/platform/admin/catalog`. Walk all tabs (types, groups, fields, editor, sections, section-fields). Confirm **"Section Fields" = mapped == total active, unmapped == 0** (the single-source invariant); badges/reorder/group-assignment work; no console errors.
B. **Workspace-admin field settings + override propagation** — set a visibility/label/required override for the Impronta tenant; confirm it reaches that tenant's talent editor (prove `workspace_profile_field_settings` → resolver → editor). Revert.
C. **Talent editor drawer (the #308 fix)** — open **vv** → Services. **Confirm duplicate sub-groups are GONE** (no About/Identity/Commercial/Logistics/Rates/Admin/Albums/Social proof/Verifications/Credits children); only Physical/measurements, Model details, Other remain. Then open Identity/Logistics/Rates/Credits and **confirm every ex-Services field is still present + editable + saves** in its own section (esp. `identity.gender`, `commercial.*`, `logistics.driversLicense/visas`, `credits.event_types`). Click EVERY section for vv + a 2nd type (chef/performer) — nothing orphaned or duplicated. (Drawer-open is human-pending.)
D. **Registration wizard** — confirm the talent signup wizard renders the DB field set per type (do NOT complete signup — account creation is off-limits; verify the resolver + rendered first step).
E. **Registration-fields configurator** — `/platform/admin/tenants/<impronta-id>/registration-fields`. Drag-rows, Shown/Required/Overridden stats, Reset, Save-order persist.
F. **Public storefront** — open published profiles on `improntamodels.com`; DB-driven fields render, photos load, no broken sections.
G. **End-to-end sync** — change a field's config in admin → see it in the talent editor AND on the storefront. The ultimate "one engine" proof.

## PART 2 — THE "ONE DATABASE" AUDIT (read-only)
```sql
-- canonical size + how much is still on dedicated columns vs field_values
select tier, render_mode, storage_mode, count(*)
from public.profile_field_definitions where deprecated_at is null
group by 1,2,3 order by 1,2,3;

-- the SECOND field system (directory filters) — still separate?
select count(*) as system_b_rows from public.field_definitions;
select * from public.field_definitions order by 1 limit 60;

-- any DB section value not claimed by the editor map (would show 'unmapped')
select section, count(*) from public.profile_field_definitions
where deprecated_at is null group by section order by section;

-- value-ladder parity per migrated family (Stage-5 can only run at 0-diff):
--   derive per-family parity queries from project_field_engine_unification.md (Tier D/A/B/C).
```
Then grep `web/src` for **hard-coded field lists** that bypass the registry (a "second source"): `FIELD_CATALOG`, `TAXONOMY_FIELDS`, `field-catalog.ts`, any `Record<…>` of field keys used for rendering — confirm they're fallback/seed only (P2), not authoritative. Confirm `resolve-talent-fields.ts` is the single read path for editor/wizard/storefront.

**Deliver a verdict: "Is the engine one database? YES/NO"** + a table of every store still holding field data outside `profile_field_definitions` + `talent_profile_field_values`.

## PART 3 — KNOWN REMAINING WORK (verify + expand into a ranked plan)
1. **System-B `field_definitions` (directory filters) unification** — the prime "other database to move." Map its ~42 rows to canonical fields; design the migration to drive directory filters off `profile_field_definitions` (+ workspace overrides) + the cutover. LARGE, own RLS/vocab — plan, don't blind-migrate.
2. **P3 Stage-5 column drops** — drop now-redundant dedicated columns for migrated families ONCE parity = 0 and a human has done a live QA pass. IRREVERSIBLE — gate on explicit go-ahead, write a down-migration/backup first. gender + dob deliberately NOT dropped.
3. **gender / dob consolidation** — decide: stay dedicated (query-critical) forever, or a unification path. Document.
4. **Services-dedup #308 live visual confirm** — the human-pending drawer check from 1C.
5. **Any orphaned field** found in 1C/2 — wire a home (bespoke section editor or per-section catalog mount) BEFORE relying on suppression.
6. **Compute** — currently Small; confirm headroom post-QA (Realtime WAL is the #1 load).

## DELIVERABLE
A single structured report:
- **QA results table** (surfaces A–G: PASS/FAIL + evidence + defects).
- **One-database verdict** (YES/NO + table of remaining external stores).
- **Ranked punch-list** to reach single-source-of-truth — each item: what, files/tables, effort (S/M/L), risk, reversibility, needs-human-go-ahead?
- Any fix safely shipped (small, reversible, verified tsc+lint+test+smoke, domains re-aliased) — list PRs/commits. Hold large/irreversible for explicit approval.
- A **"one engine" completeness %** with justification. Be blunt and honest — the owner wants the real state + a concrete path, not reassurance.

---
### Expected landing point (for orientation, verify don't assume)
The field *engine* is already effectively one database — `profile_field_definitions` is canonical (≈309 fields, 0 unmapped; editor + wizard + storefront all read it via the resolver). The two things keeping it from being *literally* one store: (1) the separate **`field_definitions`** table still driving directory filters (a real, scoped migration), and (2) **dedicated-column mirrors** (gender/dob deliberately, plus the P3-migrated families whose **Stage-5 drops** were never run). Confirm precisely and produce the ranked plan.
