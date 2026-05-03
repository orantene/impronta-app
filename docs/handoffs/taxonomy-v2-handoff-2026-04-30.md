# Taxonomy v2 — Session Handoff (2026-04-30 + 2026-05-02 update)

> **Read this entire file before taking any action.** It is the complete record of what shipped across two sessions on the hosted Supabase project AND the prototype. The handoff prompt for the next agent is at the bottom. This file was updated on 2026-05-02 — see §"Session 2 (2026-05-02) update" below for everything added since the original handoff.

## TL;DR

Phase-1 of the Talent Type taxonomy rewrite (PR 1) is **shipped, verified, and live on the hosted Supabase project**. The schema now supports a real hierarchy (parent_category → category_group → talent_type → specialty), structured `talent_languages` with proficiency + service flags, and a structured `talent_service_areas` junction (home_base / travel_to / remote_only). All existing taxonomy IDs and live `talent_profile_taxonomy` assignments were preserved — zero destructive operations.

The next work is to promote the existing `web/src/app/prototypes/admin-shell/` prototype into the primary dashboard. That promotion is split into PR-A through PR-E (briefs below). PR-A is read-only consumption of the v2 schema by the prototype's pickers — smallest delta, no schema changes. Do **not** bundle PRs.

## Project context

- Repo: `/Users/oranpersonal/Desktop/impronta-app`
- This is **NOT** the Next.js you know — read `web/AGENTS.md` and consult `node_modules/next/dist/docs/` before touching frontend code
- Pre-launch shipping rule: ship straight to prod (the user will say "we are live" when that changes); pre-launch additive migrations on the hosted Supabase are fine
- The hosted Supabase project ref is `pluhdapdnuiulvxmyspd` (URL `https://pluhdapdnuiulvxmyspd.supabase.co`). Direct DB DNS (`db.<ref>.supabase.co`) is **NOT reachable** from sandboxed runners. Use the Supabase Management API endpoint `POST https://api.supabase.com/v1/projects/{ref}/database/query` with the `SUPABASE_ACCESS_TOKEN` from `web/.env.local`. The helper in `scripts/_pg-via-mgmt-api.mjs` already wraps this.
- Plan file from the prior session: `~/.claude/plans/you-are-working-on-calm-valiant.md`
- User's auto-memory directory: `/Users/oranpersonal/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/` — read `MEMORY.md` first

## What shipped in PR 1 (LIVE on hosted Supabase)

### Migrations applied (14 files, 7 batches)

```
20260801120000_taxonomy_v2_hierarchy_columns.sql
20260801120100_taxonomy_v2_assignments_extend.sql
20260801120150_talent_service_areas.sql
20260801120200_talent_languages.sql
20260801120300_talent_languages_backfill.sql
20260801120350_talent_service_areas_backfill.sql
20260801120400_taxonomy_v2_seed_parents.sql
20260801120410_taxonomy_v2_seed_category_groups.sql
20260801120420_taxonomy_v2_seed_talent_types_a.sql
20260801120430_taxonomy_v2_seed_talent_types_b.sql
20260801120440_taxonomy_v2_seed_specialties.sql
20260801120450_taxonomy_v2_seed_skills_contexts.sql
20260801120460_taxonomy_v2_seed_legacy_reattach_fix.sql   # post-QA hotfix
20260801120500_taxonomy_v2_search_index.sql
```

### Schema additions (additive only — no DROP, no RENAME, no enum reshape)

**`public.taxonomy_terms`** — extended in place, all existing IDs preserved. New columns:

| Column | Type | Default |
|---|---|---|
| `parent_id` | UUID FK to taxonomy_terms(id) ON DELETE SET NULL | NULL |
| `term_type` | TEXT NOT NULL | (backfilled from kind) |
| `level` | INTEGER NOT NULL | 1 |
| `plural_name` | TEXT | NULL |
| `description` | TEXT | NULL |
| `icon` | TEXT | NULL |
| `is_active` | BOOLEAN NOT NULL | TRUE |
| `is_public_filter` | BOOLEAN NOT NULL | FALSE |
| `is_profile_badge` | BOOLEAN NOT NULL | TRUE |
| `is_restricted` | BOOLEAN NOT NULL | FALSE |
| `restriction_level` | TEXT | NULL |
| `search_synonyms` | TEXT[] NOT NULL | `{}` |
| `ai_keywords` | TEXT[] NOT NULL | `{}` |

`term_type` CHECK values: `parent_category, category_group, talent_type, specialty, skill_group, skill, context_group, context, credential, attribute, language` (legacy `language` retained for transition).

`UNIQUE (term_type, slug)` added (additive — old `UNIQUE (kind, slug)` stays).

**`public.talent_profile_taxonomy`** — extended in place, PK unchanged. New columns:

| Column | Type | Default |
|---|---|---|
| `tenant_id` | UUID FK agencies(id) ON DELETE CASCADE | NULL (Phase 1 — backfilled from talent_profiles.created_by_agency_id with fallback to default tenant `00000000-0000-0000-0000-000000000001`) |
| `relationship_type` | TEXT NOT NULL CHECK | derived from is_primary + term.kind |
| `proficiency_level` | TEXT (CHECK basic/conversational/professional/fluent/expert OR NULL) | NULL |
| `years_experience` | NUMERIC(4,1) | NULL |
| `display_order` | INTEGER NOT NULL | 0 |
| `verified_at` | TIMESTAMPTZ | NULL |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL | now() |

`relationship_type` values: `primary_role | secondary_role | specialty | skill | context | credential | attribute`.

**Constraints added:**
- Partial unique index `ux_talent_profile_taxonomy_one_primary` on `(talent_profile_id) WHERE relationship_type='primary_role'` — enforces "exactly one primary_role per profile".
- BEFORE INSERT/UPDATE trigger `trg_talent_profile_taxonomy_validate_relationship` rejects e.g. attaching a `term_type='skill'` term as `relationship_type='primary_role'`.

**`public.talent_languages`** (NEW table) — canonical structured language data per profile.

```sql
id UUID PK,
tenant_id UUID FK agencies(id),
talent_profile_id UUID FK talent_profiles(id) ON DELETE CASCADE,
language_code TEXT NOT NULL,                       -- ISO 639-1 lower-cased
language_name TEXT NOT NULL,
speaking_level TEXT NOT NULL CHECK ∈ {basic, conversational, professional, fluent, native},
reading_level / writing_level TEXT NULL,
is_native BOOLEAN NOT NULL DEFAULT FALSE,
can_host / can_sell / can_translate / can_teach BOOLEAN NOT NULL DEFAULT FALSE,
display_order INTEGER NOT NULL DEFAULT 0,
created_at / updated_at,
UNIQUE (talent_profile_id, language_code)
```

RLS: tenant-aware from day one (public read iff parent profile is approved+public; owner read; staff via `is_agency_staff()` OR `is_staff_of_tenant(tenant_id)`).

Triggers: standard `updated_at` + cache-refresh that updates `talent_profiles.languages TEXT[]` to keep M8 editorial code working without rewrite.

**`public.talent_service_areas`** (NEW table) — canonical structured location/service-area data.

```sql
id UUID PK,
tenant_id UUID FK agencies(id),
talent_profile_id UUID FK talent_profiles(id) ON DELETE CASCADE,
location_id UUID FK locations(id) ON DELETE RESTRICT,
service_kind TEXT NOT NULL CHECK ∈ {home_base, travel_to, remote_only},
travel_radius_km INTEGER (0..25000) NULL,
travel_fee_required BOOLEAN NOT NULL DEFAULT FALSE,
notes TEXT,
display_order INTEGER NOT NULL DEFAULT 0,
created_at / updated_at,
UNIQUE (talent_profile_id, location_id, service_kind)
```

Constraints: partial unique index `ux_talent_service_areas_one_home_base` on `(talent_profile_id) WHERE service_kind='home_base'` — exactly one home base per profile.

Triggers: standard `updated_at` + cache-refresh that updates `talent_profiles.destinations TEXT[]` (M8 editorial cache).

**Helper functions:**
- `public.taxv1_uuid(term_type, slug)` — deterministic MD5-derived UUID for re-runnable seed
- `public.descendants_of(term_id UUID) RETURNS SETOF UUID` — recursive walk, used by directory parent→children filtering
- `public.language_level_rank(text) RETURNS int` — 1..5 for `basic..native`, used for "≥ minimum level" filters

### App-code changes (web/src/)

**Modified:**
- `lib/talent-taxonomy-service.ts` — exported `RelationshipType`, `defaultRelationshipForTerm`. `assignTaxonomyTermToProfile` now accepts an optional `relationshipType` param; default derived from term's `term_type` (or kind for legacy). Existing callers untouched.
- `lib/directory/taxonomy-filters.ts` — `TaxonomyFilterOption` extended with `termType, parentId, level, isPublicFilter, isActive, searchSynonyms`. Existing consumers ignore the new fields.
- `lib/ai/build-ai-search-document.ts` — `BuildAiSearchDocumentInput` extended with `primaryTalentTypeLineage, secondaryRoles, serviceAreas, structuredLanguages, skills, contexts, credentialsAndAttributes, searchSynonyms`. Output shape is the v2 ordered structure (Name → Type → lineage → Also bookable as → Home base → Travels to → Languages → Skills → Best for → Credentials/Attributes → Bio → Synonyms). Synonyms capped at 8 deduped. Legacy `taxonomyTerms` callers still work — when v2 fields are populated, `kind='language'/'skill'/'event_type'` fallback lines are skipped.

**New:**
- `lib/talent-languages-service.ts` — `setTalentLanguages(profile, tenant, rows[])` (full-replace), `removeTalentLanguage`, `languageLevelRank` helper.
- `lib/talent-service-areas-service.ts` — `setTalentServiceAreas` (full-replace, enforces ≤1 home_base), `removeTalentServiceArea`. Includes `travel_fee_required` field.

**Tests added (all PASS):**
- `lib/talent-taxonomy-service.test.ts` — `defaultRelationshipForTerm` mapping (v2 + legacy fallback)
- `lib/talent-languages-service.test.ts` — `languageLevelRank` ordering
- `lib/ai/build-ai-search-document.test.ts` — v2 ordering, v2-over-legacy precedence, synonym cap, locationLabel fallback, back-compat

### Verification results

| Check | Result |
|---|---|
| `pnpm --filter web typecheck` | PASS |
| New tests (10 cases) | 10/10 PASS |
| `pnpm run test:ai-guardrails` | 16/16 PASS |
| `pnpm run test:tenant-isolation` | 21/24 PASS — **3 failures pre-existing** on phase-1 branch (verified by stashing changes; same 3 fail unmodified). Unrelated to this PR. |
| Phase 1 schema QA | 20/20 OK |
| Phase 2 seed QA | 28/28 OK |
| Manual UI smoke (Impronta storefront homepage) | PASS — live cards display "Fashion Model · Cancun, MX", "Commercial Model · Cancun, MX", "Brand Ambassador", "Influencer", "Showroom Model", "Actor". No leakage of `term_type`, `relationship_type`, or raw slug. |
| Server-rendered profile pages | PASS — `GET /t/TAL-91014 → 200 OK` confirmed in server logs. Preview tool's React hydration limitation prevented in-browser eval; per user's auto-memory `reference_preview_hydration.md`, accept this as a verified-via-logs case. |
| Live profile coverage via parent_category descendants | **29/29 (100%)** of approved+public profiles roll up to a parent_category filter. |

### Live database state on hosted Supabase

| Table | Pre-PR | Post-PR | Δ |
|---|---|---|---|
| `taxonomy_terms` | 215 | 859 | +644 |
| `taxonomy_terms WHERE term_type='parent_category'` | 0 | 19 | +19 (8 with `is_public_filter=TRUE`, 11 in More rollup) |
| `taxonomy_terms WHERE term_type='category_group'` | 0 | 75 | +75 |
| `taxonomy_terms WHERE term_type='talent_type'` | (existed at flat kind) | 425 | (preserved + seeded) |
| `taxonomy_terms WHERE term_type='specialty'` | 0 | 23 | +23 |
| `taxonomy_terms WHERE term_type='skill_group'` | 0 | 9 | +9 |
| `taxonomy_terms WHERE term_type='skill'` | (existed at flat kind) | 129 | (preserved + seeded) |
| `taxonomy_terms WHERE term_type='context'` | 0 | 83 | +83 |
| `talent_profiles` | 42 | 42 | 0 |
| `talent_profile_taxonomy` | 495 | 495 | 0 |
| `talent_languages` | n/a | 64 | +64 (backfilled from existing `talent_profiles.languages TEXT[]`) |
| `talent_service_areas` | n/a | 30 | +30 (all `home_base` from `talent_profiles.location_id`; `travel_to=0` because every existing destination string equaled the profile's home location) |
| `locations` | 5 | 5 | 0 |
| `agencies` | 6 | 6 | 0 |

Backup of all 5 tables (taxonomy_terms, talent_profile_taxonomy, talent_profiles, locations, agencies) saved to `.codex-artifacts/taxonomy-v2-backup/` before any migration ran.

### Operational scripts written

These remain useful for future PRs:

- `scripts/_pg-via-mgmt-api.mjs` — wraps Supabase Management API SQL execution
- `scripts/taxonomy-v2-apply.mjs` — apply a list of SQL files via Management API
- `scripts/taxonomy-v2-backup-and-counts.mjs` — backup tables + snapshot row counts
- `scripts/taxonomy-v2-qa-phase1.mjs` — schema QA bundle (20 checks)
- `scripts/taxonomy-v2-qa-phase2.mjs` — seed QA bundle (28 checks)

## What was NOT shipped (intentional)

- **Test profiles seed (`supabase/seed_taxonomy_v2_test_profiles.sql`)** — file written, NOT applied to hosted Supabase. Contains 6 QA profiles (Sofia, Maria, Liam, Lucia, Diego, Carlos) with assignments + languages + service_areas + expected-query doc block. Awaits explicit user approval before applying.
- **PR 2 (hub profiles, restricted hubs, profile renderer redesign, middleware host-context rewiring)** — out of scope. Original plan documented in `~/.claude/plans/you-are-working-on-calm-valiant.md`.
- **Phase 2 RLS rebind** (`talent_profile_taxonomy.tenant_id NOT NULL` + RLS rebind to `is_staff_of_tenant`) — `tenant_id` is now backfilled and nullable; setting NOT NULL + rebinding RLS is a separate planned migration.
- **Cleanup of `talent_profiles.languages TEXT[]` and `destinations TEXT[]` columns** — kept as derived caches for back-compat with M8 editorial code; future PR drops once all readers migrate.

## Prototype review findings

User asked for review of three prototype URLs in the prior session:

1. `/prototypes/admin-shell?surface=workspace&plan=agency&role=owner&entityType=agency&alsoTalent=true&page=roster&drawer=talent-profile-shell` — agency-owner roster + talent-profile-shell drawer
2. `/prototypes/admin-shell?surface=talent&talentPage=profile` — talent's own profile editor (Marta Reyes)
3. `/prototypes/admin-shell?surface=workspace&plan=free&role=owner&entityType=agency&alsoTalent=true&page=overview&drawer=new-talent` — Free-plan agency overview + new-talent drawer

### What the prototype gets right (preserve these)

- Three-column primary picker (Models / Hosts & Promo / Performers) maps cleanly to `term_type='parent_category'` + descendant `talent_type` rows.
- "PRIMARY TALENT TYPE" wording matches the DB constraint (validator trigger + partial unique index).
- HOME BASE + "Service areas and travel radius are set in the full profile builder" maps to `talent_service_areas` (home_base singleton + travel_to + travel_radius_km + travel_fee_required).
- Languages with role flags ("Native SP · Fluent EN · IT · Int. FR") matches `talent_languages` (speaking_level enum + can_host/can_sell/can_translate/can_teach).
- Refinement section split into "skills" + "contexts they shine in" matches `relationship_type='skill'` and `'context'`.
- Profile completeness ("17%, Add 5 things to publish") is the correct derived view.
- Hybrid "Talent + Workspace" affordance matches `project_workspace_talent_hybrid.md`.
- Plan-tier ladder matches `project_talent_subscriptions.md` + `project_agency_exclusivity_model.md`.

### Renames to align with schema (no schema work)

| Prototype shows | Schema reality | Recommended fix |
|---|---|---|
| URL 2 "Specialties" chips: Fashion, Editorial, Commercial, Lifestyle | These are `talent_type` rows (secondary_role candidates), NOT `specialty` rows | Rename chip group to "Also bookable as" (matches `relationship_type='secondary_role'`). Reserve "Specialties" for `term_type='specialty'` (Salsa under Latin Dancer, Belly Dancer under Cultural Dancer). |
| URL 1 drawer skips category_group middle layer | Schema has 75 category_groups | Keep compressed display for speed. Surface category_group as a breadcrumb label when drilling. Persist FK chain for `descendants_of()`. |
| URL 1 hardcoded three columns | Schema has 8 `is_public_filter=TRUE` parents + 11 in More rollup | Drive columns from `taxonomy_terms WHERE term_type='parent_category' AND is_public_filter=TRUE ORDER BY sort_order`. Add "More…" expander. |

### Real schema gaps the prototype reveals (future PRs)

1. **`talent_constraints`** — wardrobe & limits (No nudity hard / No fur hard / Lingerie soft). Booking-blocker if free-text. Recommended schema:
   ```sql
   CREATE TABLE public.talent_constraints (
     id UUID PK, tenant_id UUID, talent_profile_id UUID FK,
     enforcement TEXT CHECK ('hard','soft'),
     category TEXT, label TEXT NOT NULL, notes TEXT, ...
   );
   ```
2. **`talent_trust_badges`** — ID verified / Age verified / Agency-verified / Top-rated / Featured / Background check. Per `project_client_trust_badges.md` you need lifecycle (granted_at, expires_at, source). Don't put as booleans on `talent_profiles`.
3. **`agency_enabled_taxonomy_terms`** — per-workspace facet visibility. Drives Add-Talent picker, public storefront facet, registration link's "Only shows the Talent Types your workspace has enabled" copy. Mirrors future `hub_taxonomy_terms`.
4. **`talent_credits`** + **`talent_reviews`** — tearsheet entries + booked-client testimonials.
5. **`talent_rate_card`** — tiered rate card (Editorial day / Commercial day / E-commerce day).

## Recommended PR sequence (canonical)

Each PR is a separate prompt to a separate agent session. **Do not bundle.** Briefs below are self-contained.

### PR-A — Read-only consume v2 data in prototype

**Scope:** wire `web/src/app/prototypes/admin-shell/` to read live v2 schema. No writes. No new tables. No migrations.

**Specifically:**
1. Replace hardcoded parent-category columns in URL 1's `talent-profile-shell` drawer and URL 3's `new-talent` drawer with a query against `taxonomy_terms WHERE term_type='parent_category' AND is_public_filter=TRUE ORDER BY sort_order` (returns 8 rows). Add a "More…" expander that loads the other 11.
2. For each parent_category column, list its descendant `talent_type` rows via `descendants_of(parent_category_id)` filtered to `term_type='talent_type'`. Compress the category_group middle layer in the display but keep the FK chain intact.
3. In URL 2, rename the "Specialties" chip group to "Also bookable as". Reserve the word "Specialties" for `term_type='specialty'` rows.
4. URL 2's Languages section reads from `public.talent_languages` (speaking_level + can_host/can_sell flags).
5. URL 1 / URL 2 Home Base + travel_to chips read from `public.talent_service_areas`.

**Out of scope:** writes, new tables, completeness refactor, trust badges, constraints, rate card.

**Acceptance:** prototype renders identically to today against live data. `descendants_of(Models id)` returns the expected talent_type rows.

### PR-B — Write through service modules

**Scope:** prototype's "Save / Publish" buttons persist via:
- `web/src/lib/talent-taxonomy-service.ts` (already extended for `relationship_type` in PR 1)
- `web/src/lib/talent-languages-service.ts` (set-replace, ships in PR 1)
- `web/src/lib/talent-service-areas-service.ts` (set-replace, ships in PR 1)

**No new schema.** This is the moment new profiles start populating the v2 tables end-to-end.

**Acceptance:** creating a new talent via the URL 3 drawer + opening the URL 1 talent-profile-shell drawer + adding a language + saving → row appears in `talent_languages` with the correct shape; row appears in `talent_service_areas` for home_base.

### PR-C — Derived completeness function

**Scope:**
- New migration: `public.talent_profile_completeness(p UUID) RETURNS TABLE(score INT, missing TEXT[])` that checks (1) primary_role exists, (2) home_base service_area exists, (3) ≥1 media_asset, (4) bio not null, (5) ≥1 talent_languages row.
- Wire URL 1 drawer's "Add 5 things to publish" UI to its output.
- Deprecate `talent_profiles.profile_completeness_score NUMERIC` (keep column for now; stop writing to it).

**Acceptance:** drawer's "% complete" matches `SELECT score FROM talent_profile_completeness(<id>)`. Missing items list is single-source-of-truth.

### PR-D — talent_constraints

**Scope:**
- New `public.talent_constraints` table (schema in "Real schema gaps" above).
- RLS: same pattern as `talent_languages` (public/own/staff/write_own_or_staff).
- Service module: `web/src/lib/talent-constraints-service.ts` (set-replace).
- URL 2 chip UI reads/writes via the new module.
- Directory filter integration: hard limits exclude profiles from matching searches.

**Acceptance:** booking a "no nudity" inquiry against a profile with `enforcement='hard' category='nudity'` is excluded from results.

### PR-E — Trust badges + per-workspace enabled terms

**Scope:**
- New `public.talent_trust_badges` table with lifecycle (granted_at, expires_at, source_ref).
- New `public.agency_enabled_taxonomy_terms` table (default-enabled all v1 parent_categories).
- URL 2 Trust panel reads from `talent_trust_badges`.
- URL 3 new-talent drawer's picker filters parent_category by `agency_enabled_taxonomy_terms`.
- Public storefront facet filtered by the same.
- Registration link `/atelier-roma/join` filters by the same.

**Acceptance:** disabling Models in workspace settings hides the Models column from URL 1 / URL 3 drawers AND the public storefront facet.

### PR 2 (taxonomy hub layer — original plan)

After PR-A through PR-E, the original PR 2 (hub profiles, restricted hubs, profile renderer redesign, middleware host-context rewiring) is much smaller because `agency_enabled_taxonomy_terms` already established the per-tenant enabled-terms pattern. Original plan in `~/.claude/plans/you-are-working-on-calm-valiant.md`.

### Long-tail (after PR 2)

- `talent_credits` + `talent_reviews`
- `talent_rate_card`
- "Discover rank" daily aggregator job (consumes `talent_embeddings` + `match_talent_embeddings`)
- Phase 2 RLS rebind on `talent_profile_taxonomy` (tenant_id NOT NULL + RLS to `is_staff_of_tenant()`)
- Drop `talent_profiles.languages TEXT[]` and `destinations TEXT[]` once all readers migrated

## Hard rules (NON-NEGOTIABLE)

1. **Talent Type vocabulary is sacred.** Do not mix skills, locations, gender, language, context, attributes, or verification labels into Talent Type. The four-layer rule:
   - Talent Type = the role a client books (Model, Promotional Model, Fire Dancer, Singer, Bartender, Driver, Travel Agent, Massage Therapist, etc.)
   - Specialty = refinement of a Talent Type (Salsa under Latin Dancer)
   - Skill = ability that enhances bookability but is not itself the booked role
   - Context = where they work (Beach Clubs, Yachts, Weddings)
   - Attribute = profile metadata (Bilingual, Travels Globally, Tattooed)
   - Credential = verified qualification (CPR Cert, Drone License)
2. **Generic legacy terms stay generic.** "Model" stays under General Models. "Hostess" stays under General Hostesses. "Dancer" stays under General Dancers. Don't auto-classify live data into specific subtypes without admin opt-in.
3. **Talent Type + Location are V1.** Skills, languages, contexts, attributes, credentials, hubs are secondary refinement layers. The form's first decision is always primary_role + home_base; everything else can be deferred without breaking discoverability.
4. **One canonical term per role concept** (no uncontrolled duplicate role terms). Cross-discovery is via `search_synonyms` and `ai_keywords`, not duplicate rows.
5. **`relationship_type` strict rules** enforced by DB trigger:
   - `primary_role`: max 1 per profile, term must be `term_type='talent_type'`
   - `secondary_role`: 0..N, must be `talent_type`
   - `specialty`: 0..N, must be `specialty` (or `talent_type` for transitional)
   - `skill`: 0..N, must be `skill`
   - `context`: 0..N, must be `context`
   - `credential`: 0..N, must be `credential`
   - `attribute`: 0..N, must be `attribute` or `language` (transitional)
6. **`talent_languages` is canonical**, `talent_profiles.languages TEXT[]` is a derived denormalized cache. App code must NOT write to the cache after PR 1.
7. **`talent_service_areas` is canonical**, `talent_profiles.location_id` is a back-compat mirror of the `home_base` row, `talent_profiles.destinations TEXT[]` is a derived cache.
8. **AI search document follows the v2 ordered structure**: Name → Type → lineage → secondary roles → home_base/travel_to → languages → skills → contexts → credentials/attributes → bio → synonyms (capped 8). Do not stuff synonyms blindly.
9. **No destructive migrations** without explicit user approval. No DROP TABLE, no DROP COLUMN, no RENAME, no enum reshape mid-flight.
10. **Test profiles** (`supabase/seed_taxonomy_v2_test_profiles.sql`) are NOT applied to hosted Supabase without explicit user approval.

## Open questions / pending decisions

1. **Test profile seeding on hosted Supabase** — file is written, awaits user approval to apply.
2. **Phase 2 RLS rebind** — when to flip `tenant_id NOT NULL` on `talent_profile_taxonomy` and rebind RLS to `is_staff_of_tenant()`. Coordinate with broader Phase 2 plan.
3. **Pre-existing tenant-isolation test failures (3 of 24)** — unrelated to this PR but worth a separate cleanup PR.
4. **Hub `hub_kind` discriminator column** — deferred to PR 2.
5. **Background-check / verification badges lifecycle** — needs product input on grant/expiry windows.

## How to verify the system is healthy from a fresh session

```bash
cd /Users/oranpersonal/Desktop/impronta-app
node scripts/taxonomy-v2-qa-phase1.mjs    # 20/20 OK
node scripts/taxonomy-v2-qa-phase2.mjs    # 28/28 OK
pnpm --filter web typecheck               # PASS
pnpm --filter web exec tsx --test src/lib/talent-taxonomy-service.test.ts src/lib/talent-languages-service.test.ts src/lib/ai/build-ai-search-document.test.ts    # 10/10 PASS
```

If any of these fail, **stop and investigate** before taking action. The hosted DB state should match the post-PR counts above.

## Critical files reference (paths)

**Source-of-truth services (read these first):**
- `web/src/lib/talent-taxonomy-service.ts`
- `web/src/lib/talent-languages-service.ts`
- `web/src/lib/talent-service-areas-service.ts`
- `web/src/lib/ai/build-ai-search-document.ts`
- `web/src/lib/directory/taxonomy-filters.ts`

**Schema migrations (in order):**
- `supabase/migrations/20260801120000_taxonomy_v2_hierarchy_columns.sql` through `..._120500_taxonomy_v2_search_index.sql` (14 files)

**Prototype to promote:**
- `web/src/app/prototypes/admin-shell/_drawers.tsx`
- `web/src/app/prototypes/admin-shell/_talent_drawers.tsx`
- `web/src/app/prototypes/admin-shell/_talent.tsx`
- `web/src/app/prototypes/admin-shell/_pages.tsx`
- `web/src/app/prototypes/admin-shell/_state.tsx`

**Prior plan file:**
- `~/.claude/plans/you-are-working-on-calm-valiant.md`

**User auto-memory (read MEMORY.md first):**
- `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/MEMORY.md`
- `..._memory/project_impronta_blueprint.md` — full stack
- `..._memory/project_inquiry_flow_spec.md` — booking pipeline spec
- `..._memory/project_admin_workspace_vision.md`
- `..._memory/project_saas_build_charter.md`
- `..._memory/project_workspace_talent_hybrid.md`
- `..._memory/project_talent_subscriptions.md`
- `..._memory/project_client_trust_badges.md`
- `..._memory/project_agency_exclusivity_model.md`
- `..._memory/project_vercel_deployment.md`
- `..._memory/feedback_pre_launch_shipping.md`
- `..._memory/reference_preview_hydration.md`

---

# Session 2 (2026-05-02) update

This block captures everything that landed AFTER the original handoff was written. Read this section in full — three things changed:

1. **One new migration is live on hosted Supabase** (`20260801120600_taxonomy_v2_reverse_sync.sql`).
2. **One follow-up seed migration** (`20260801120460_taxonomy_v2_seed_legacy_reattach_fix.sql`) was applied earlier between sessions; included for completeness.
3. **Prototype + storefront UI was fixed** to enforce the parent-first rule. PR-A is mostly done (read-path); a small storefront facet rebind ("PR-A2") landed in this session. PR-B (write path) is still the next concrete PR.

## What landed in Session 2

### S2-1. Reverse-sync trigger (drift safety net) — LIVE

**Migration:** `supabase/migrations/20260801120600_taxonomy_v2_reverse_sync.sql` — applied to hosted Supabase (1726ms).

Adds `trg_talent_profiles_reverse_sync_v2` on `public.talent_profiles AFTER UPDATE OF languages, destinations, location_id`. When the legacy admin M8 editorial form (or any code path) writes the cache columns directly, the trigger syncs the change BACK to `talent_languages` and `talent_service_areas` so the canonical tables don't drift.

**Loop prevention:** `pg_trigger_depth() = 0` `WHEN` clause. Forward triggers (`trg_talent_languages_refresh_cache`, `trg_talent_service_areas_refresh_cache`) write to `talent_profiles` at depth ≥ 1, which the WHEN clause rejects, so the reverse trigger only fires for outermost (app-direct) writes.

**Live smoke test result:**
- `UPDATE talent_profiles SET languages = ARRAY['English','Spanish','French']` → 3 rows appeared in `talent_languages` with correct ISO codes (`en/es/fr`).
- Cache stayed at 3 entries (no double-sync).
- Forward direction still works (insert into talent_languages → cache picks it up).
- No infinite loop.

**Operational impact:** The drift risk that existed between session 1 and this trigger is now **eliminated**. App code that still writes the cache columns directly (e.g. `web/src/app/(dashboard)/admin/talent/[id]/admin-talent-editorial-form.tsx`, `editorial-fields-actions.ts`) will silently sync back. No urgent migration needed for those forms — they can be moved to the new service modules at PR-B's pace.

### S2-2. Legacy reattach fix — LIVE

**Migration:** `supabase/migrations/20260801120460_taxonomy_v2_seed_legacy_reattach_fix.sql` — applied to hosted Supabase (686ms).

Background: post-deployment QA in session 1 found 8 legacy talent_type slugs that had been seeded by the pre-v2 import but were missed by the v2 reattachment in `20260801120410`. Four of them had live profile assignments (commercial-model: 6 profiles, actor: 2, event-model: 1, showroom-model: 1) — they wouldn't roll up under any parent_category descendant filter.

The migration sets `parent_id` + `level=3` for: commercial-model, showroom-model, event-model, luxury-model, actor, musician, mascot-performer, athlete-talent.

**Result:** zero flat talent_types remain. `descendants_of(parent_category 'models')` now correctly includes commercial-model. **All 29/29 approved+public live profiles now roll up to a parent_category** (was 25/29 before this fix).

### S2-3. Prototype UI parent-first reset

The user identified that the prototype's `TalentProfileShellDrawer` "Services" section was showing 80+ specific talent_type chips as a flat wall — violating the "shallow UI, deep vocabulary" rule. Multiple surfaces audited and fixed.

**File modified:** `web/src/app/prototypes/admin-shell/_drawers.tsx` (~7300 lines)

#### S2-3a. `ServicesEditor` — secondary picker scoped to primary's parent_category

Before: `allowedParents.flatMap(p => p.children)` rendered ALL talent_types from ALL parent_categories under "Also available as", regardless of which primary role was picked.

After:
- `sameCategoryChildren` defaults to siblings within the primary's parent_category.
- Header reads `"Also available as · within Models"` (or the appropriate parent name, using the short label).
- New collapsed `+ Also bookable in another category (N)` toggle reveals the remaining parent_categories as labeled groups (emoji + short label) with chips below each.
- Internal `useState(showOtherCategories)` keeps the toggle local to the drawer instance.

#### S2-3b. "What I'm growing into" → collapsed `<details>` "Career interests"

Before: Always-visible flat 80+ chip wall titled "What I'm growing into".
After: Collapsed by default. Renamed to "Career interests · optional · open-to-grow signals". The underlying `AspirationsEditor` component is unchanged — only the wrapper changed to a native `<details>` with a custom `<summary>`.

#### S2-3c. `PrimaryTalentTypeGrid` — removed Popular flat row + Show-all flat wall

Before:
- Lead with "★ Popular · top 8" — a flat row of 8 specific talent_types (Promotional Model, Fashion Model, Dancer, Singer, etc.).
- Bottom button "Show all types (N)" expanded into a 425-chip flat wall grouped by parent.

After:
- Removed the Popular row entirely.
- Removed the `showAll` state + flat-wall view.
- Lead with one-line instruction: "Choose a category to see the specific roles inside it."
- Per-parent rolled-up rows are now the leading UI (parent → click → drill into types).
- Search bar retained as the escape hatch for power users.
- Footer note: "Looking for something specific? Use the search above."

#### S2-3d. Add Talent drawer + Talent Registration drawer

Audited; **already parent-first**. No code changes needed.
- `NewTalentDrawer` uses `PrimaryTalentTypeGrid` (now fixed) for primary + parent_category chips for secondary roles (`web/src/app/prototypes/admin-shell/_drawers.tsx:10947, 10977`).
- `TalentRegistrationDrawer` uses a wizard with parent_categories at step 2 and specific talent_types at step 3 under each picked parent (lines 1980–2392).

### S2-4. Storefront facet rebind (PR-A2) — read-path

The legacy storefront top-bar was fed by `web/src/lib/home-data.ts` querying `taxonomy_terms WHERE kind='talent_type'` — that returns 425 specific talent_types. Switched to `term_type='parent_category' AND is_public_filter=TRUE` so the bar now renders the 8 marketplace top-level groups.

**Files modified:**
- `web/src/lib/home-data.ts:58–63` — query rebound.
- `web/src/components/home/talent-type-shortcuts.tsx`:
  - `iconMap` keyed by parent_category slug (Models / Hosts & Promo / Performers / Music & DJs / Chefs & Culinary / Wellness & Beauty / Photo Video & Creative / Influencers & Creators) with curated lucide-react icons (Sparkles / Megaphone / Star / Music / ChefHat / Leaf / Camera / Users).
  - Legacy slug fallbacks preserved (`model`, `hostess`, etc.) so older databases still render until they re-deploy with v2.
  - Labels rendered via `shortParentLabel({ slug, name })` so the bar shows "Models · Hosts · Performers · Music · Chefs · Wellness · Photo & Video · Creators" instead of the canonical full names.

### S2-5. Shared `parent-labels` module

**New file:** `web/src/lib/taxonomy/parent-labels.ts`

Exports:
- `SHORT_PARENT_LABEL: Record<string, string>` — keyed by both kebab-case live Supabase slugs (`hosts-promo`, `music-djs`, `chefs-culinary`, etc.) AND the prototype's snake_case ids (`hosts`, `music`, `chefs`).
- `shortParentLabel({ id?, slug?, name?, label? })` — resolution order: `slug → id → name → label → key`.

Used by:
- Prototype: `web/src/app/prototypes/admin-shell/_drawers.tsx` (PrimaryTalentTypeGrid header, Services "within X" subheader, cross-category expander group labels). The inline copy of the map that briefly lived in `_drawers.tsx` was removed in favor of the shared module.
- Storefront: `web/src/components/home/talent-type-shortcuts.tsx` chip labels.

**Rule:** Schema preserves canonical full names ("Hosts & Promo", "Music & DJs"). UI surfaces use `shortParentLabel(...)` for the friendly forms ("Hosts", "Music"). When you add a new parent_category, add its short-label entry to this module.

## Acceptance criteria — all met

| Requirement | Status |
|---|---|
| First-level UI shows parent categories, not all talent types | ✅ S2-3c |
| Specific talent types appear only after selecting a parent | ✅ S2-3c (per-parent rolled-up rows, drill-in only) |
| Secondary roles scoped to primary parent by default | ✅ S2-3a |
| Cross-category secondary behind "Also bookable in another category" | ✅ S2-3a |
| "What I'm growing into" removed or collapsed | ✅ S2-3b (collapsed `<details>`) |
| No 80-chip flat wall in Add Talent / Registration / Profile Edit | ✅ Verified by audit (S2-3d) and S2-3c removal |
| Directory top filters use parent categories | ✅ S2-4 (read-path; UI rendering uses parent_category + is_public_filter=TRUE) |
| Registration uses parent-first selection | ✅ S2-3d (already was — confirmed by code review) |
| Add Talent uses parent + specific Talent Type | ✅ S2-3d (uses fixed PrimaryTalentTypeGrid) |
| Master vocabulary deep, UI shallow | ✅ enforced via `shortParentLabel` + parent-first picker |
| No drift between cache columns and canonical tables | ✅ S2-1 reverse-sync trigger live |
| Live profile descendant coverage | ✅ S2-2 — 29/29 (100%) of approved+public profiles roll up |

## Files changed in Session 2

**New files:**
- `web/src/lib/taxonomy/parent-labels.ts` — shared SHORT_PARENT_LABEL map + shortParentLabel() helper
- `supabase/migrations/20260801120600_taxonomy_v2_reverse_sync.sql` — reverse-sync trigger (LIVE)
- `supabase/migrations/20260801120460_taxonomy_v2_seed_legacy_reattach_fix.sql` — legacy talent_type reattach fix (LIVE)

**Modified:**
- `web/src/app/prototypes/admin-shell/_drawers.tsx`:
  - `ServicesEditor` (~lines 5347–5510) — scoped secondary picker + cross-category toggle
  - "What I'm growing into" → `<details>Career interests` (~line 4413)
  - `PrimaryTalentTypeGrid` (~lines 11458–11725) — removed Popular row + Show-all wall
  - Imports `shortParentLabel` from shared module
  - Removed inline SHORT_PARENT_LABEL map (replaced by import)
- `web/src/lib/home-data.ts:58–63` — rebound to parent_category + is_public_filter
- `web/src/components/home/talent-type-shortcuts.tsx` — parent-keyed icon map + shortParentLabel for chip text

**Documentation:**
- This file (`docs/handoffs/taxonomy-v2-handoff-2026-04-30.md`) updated with this Session 2 block.

## Verification (Session 2)

| Check | Result |
|---|---|
| `pnpm --filter web typecheck` | **PASS** |
| New unit tests (10 cases) | 10/10 PASS |
| Phase 1 schema QA (`scripts/taxonomy-v2-qa-phase1.mjs`) | 20/20 OK |
| Phase 2 seed QA (`scripts/taxonomy-v2-qa-phase2.mjs`) | 28/28 OK |
| Reverse-sync live smoke (3-row sync, no loop, forward path still works) | PASS |
| Storefront homepage (live data, Impronta tenant) | Live cards display "Fashion Model · Cancun, MX", "Commercial Model · Cancun, MX", etc. — no leakage of term_type/relationship_type/raw slug |
| Browser preview verification of the prototype's Services section | Partial — preview React hydration limitation per `reference_preview_hydration.md`. Static grep + typecheck cover correctness; manual browser sweep recommended. |

## What's still NOT done (carried forward into next PRs)

These are from the audit. Each is documented so the next agent doesn't re-discover or re-do work.

### Still legacy (functional but not v2-aware)

| Concern | Where | Severity | Fix |
|---|---|---|---|
| **AI rebuild path doesn't pass v2 fields** | `web/src/lib/ai/rebuild-ai-search-document.ts` | Medium | Patch to load `talent_languages` + `talent_service_areas`, walk parent lineage via recursive CTE up `parent_id`, split taxonomy joins by `relationship_type` into skills/contexts/secondary_roles, pass to `buildAiSearchDocument` as `structuredLanguages`/`primaryTalentTypeLineage`/`secondaryRoles`/`skills`/`contexts`. ~50 lines. **Fold into PR-B.** |
| **No production callers of `talent-languages-service.ts` / `talent-service-areas-service.ts` write APIs** | grep returns 0 importers in production code (only test file) | Medium | The prototype drawer currently writes its own internal state on Save. PR-B wires the drawer's "Save / Publish" buttons through `setTalentLanguages` + `setTalentServiceAreas`. Reverse-sync trigger (S2-1) covers drift in the meantime. |
| **Admin M8 editorial form writes `talent_profiles.languages TEXT[]` directly** | `web/src/app/(dashboard)/admin/talent/[id]/admin-talent-editorial-form.tsx`, `editorial-fields-actions.ts:154` | Low (covered by reverse-sync) | Migrate to call `setTalentLanguages` from the new service module. Until then, the reverse-sync trigger keeps the canonical tables in sync. |
| **`featured_talent/fetch.ts:241` queries `talent_profiles.destinations` cache** | `.contains("destinations", [destinationSlug])` | Low (cache is synced) | Migrate to query `talent_service_areas` joined to `locations.city_slug`. |
| **20+ callsites use `kind='talent_type'`** | `lib/home-data.ts:80,197`, `lib/directory/fetch-directory-page.ts:821`, `lib/dashboard/admin-dashboard-data.ts:626`, `lib/ai/{ai-search-document-debug.ts:62, refine-suggestions.ts:98, rebuild-ai-search-document.ts:86}`, `lib/site-admin/sections/featured_talent/fetch.ts:344`, `app/api/directory/preview/[talentId]/route.ts:182`, `app/(dashboard)/admin/talent/[id]/page.tsx:265`, `app/(dashboard)/talent/{actions.ts:267,374, talent-taxonomy-editor.tsx:105,535}`, `lib/talent-dashboard-data.ts:235,462`, `lib/client-inquiry-details.ts:220` | Low (functional — every v2 talent_type row has both `kind='talent_type'` AND `term_type='talent_type'`) | One-line replacements: `term_type === 'talent_type'` instead of `kind`. Schedule as a single mechanical cleanup PR. |
| **`talent_profile_taxonomy.tenant_id` is nullable** | All 495 rows backfilled, `NOT NULL` not enforced | Low (mitigated by `is_agency_staff()` policy) | Small migration: `ALTER COLUMN tenant_id SET NOT NULL` + replace global staff policy with `is_staff_of_tenant(tenant_id)`. Coordinate with broader Phase-2 plan. |

### Schema gaps the prototype reveals (still pending)

These remain unchanged from §"Real schema gaps the prototype reveals" earlier in this doc — no work landed for them in Session 2. Listed here for cross-reference:

1. **`talent_constraints`** (wardrobe & limits) — booking-blocker if free-text. PR-D.
2. **`talent_trust_badges`** with lifecycle (granted_at, expires_at, source) — PR-E.
3. **`agency_enabled_taxonomy_terms`** (per-workspace facet visibility) — PR-E.
4. **`talent_credits`** + **`talent_reviews`** — long-tail.
5. **`talent_rate_card`** — long-tail.

### Out-of-scope for the prototype-promotion track

Original PR 2 (hub_profiles, restricted hubs, profile renderer redesign, middleware host-context rewiring) — unchanged. Awaits PR-A through PR-E completion.

## Updated PR sequence (post-Session 2)

| PR | Status | Notes |
|---|---|---|
| **PR-A** (read-only consume v2) | **DONE** | Done in Session 2: prototype `_taxonomy-loader.ts` reads live taxonomy; `PrimaryTalentTypeGrid` and Services secondary picker are fully v2-aware; `talent_languages` + `talent_service_areas` are read by `t/[profileCode]/page.tsx`. |
| **PR-A2** (storefront facet rebind + short labels) | **DONE** | Done in Session 2 (S2-4, S2-5). `home-data.ts` queries parent_category + is_public_filter; `TalentTypeShortcuts` uses parent-keyed icon map + `shortParentLabel`; shared `parent-labels` module created. |
| **PR-B** (write through service modules + AI rebuild v2 fields) | **NEXT** | Wire prototype Save buttons through `setTalentLanguages`, `setTalentServiceAreas`, the extended `assignTaxonomyTermToProfile(relationshipType)`. Patch `rebuild-ai-search-document.ts` to populate v2 fields. Reverse-sync trigger (S2-1) is the safety net while this is pending. |
| **PR-C** (derived completeness function) | Pending | `public.talent_profile_completeness(p UUID)` SQL function + UI rewire. |
| **PR-D** (talent_constraints) | Pending | Wardrobe/limits schema + chip UI + directory-filter integration. |
| **PR-E** (talent_trust_badges + agency_enabled_taxonomy_terms) | Pending | Two new tables; unlocks most of URL 2 + URL 3 chrome. |
| **kind='talent_type' → term_type cleanup** | Pending | 20+ call-site mechanical replacement. Single cleanup PR. |
| **Phase 2 RLS rebind** | Pending | `talent_profile_taxonomy.tenant_id NOT NULL` + RLS to `is_staff_of_tenant`. |
| **PR 2 (hub layer)** | Pending | After PR-A through PR-E. Original plan in `~/.claude/plans/you-are-working-on-calm-valiant.md`. |
| **Long-tail** | Pending | Rate card, credits, reviews, discover-rank job, drop legacy `languages`/`destinations` cache columns. |

## Hosted Supabase state (post-Session 2)

| Table | Row count | Notes |
|---|---|---|
| `taxonomy_terms` | 859 | unchanged from Session 1 + 8 reattached parent_ids |
| `taxonomy_terms WHERE term_type='parent_category'` | 19 | 8 with `is_public_filter=TRUE` |
| `taxonomy_terms WHERE term_type='talent_type' AND parent_id IS NULL` | 0 | all reattached after S2-2 |
| `talent_profiles` | 42 | unchanged |
| `talent_profile_taxonomy` | 495 | unchanged |
| `talent_languages` | 64 | unchanged (no new edits since backfill) |
| `talent_service_areas` | 30 | unchanged (all home_base) |
| Triggers | forward (2 from PR 1) + reverse (1 from S2-1) | All 3 active and verified |
| RLS policies | unchanged | Phase-2 rebind still pending |

---

# Session 3 (2026-05-02 evening) update — Taxonomy Engine + read-side consolidation

This session consolidated the scattered taxonomy logic behind a **single engine**, migrated the user-visible read paths to consume it, and rebuilt the AI search document on the v2 structured signals. Read this section carefully — it lands one cohesive piece of architecture, not 7 unrelated patches.

## TL;DR

- **NEW: `web/src/lib/taxonomy/engine.ts`** — one module with all the taxonomy decisions. Every consumer in the app should import from it.
- **7 user-visible callsites migrated** from inline `kind === 'talent_type'` walks to engine helpers.
- **AI rebuild path patched** to load v2 data (talent_languages, talent_service_areas, lineage walk, relationship splitting) and pass it to `buildAiSearchDocument`. Embeddings now have the rich v2 structure instead of the legacy "every term as a flat list" lump.
- **15 new unit tests** for the engine (25/25 total now).
- **0 destructive changes.** Typecheck PASS. Both QA bundles PASS (20/20 + 28/28).

## What landed in Session 3

### S3-1. The engine — `web/src/lib/taxonomy/engine.ts`

One module, ~280 lines. Public API:

| Export | Purpose |
|---|---|
| `isTalentTypeTerm(term)` | Replaces `kind === 'talent_type'`. v2-aware (term_type wins, kind fallback). |
| `isParentCategoryTerm(term)` | True if `term_type === 'parent_category'`. |
| `extractPrimaryRoleTerm(rows)` | Profile primary role term. v2 (`relationship_type='primary_role'`) → legacy (`is_primary` + `kind='talent_type'`) → null. |
| `extractPrimaryRoleRow(rows)` | Same but returns the entire assignment row (so callers needing FK ids like `taxonomy_term_id` can read them). |
| `extractSecondaryRoleTerms(rows)` | All secondary role terms; v2 first, legacy fallback (any non-primary talent_type). |
| `extractTermsByRelationship(rows, kind)` | Skill / context / specialty / credential / attribute. v2-only — legacy rows without relationship_type are skipped. |
| `getParentCategoryFromMap(termId, map)` | Walks `parent_id` chain in memory. Caller provides a Map<id, term>. |
| `getLineageFromMap(termId, map)` | Returns the full root-to-leaf path (parent_category → … → leaf). |
| `fetchParentCategoryByTermId(supabase, termId)` | Async parent walk (one query per level, max 10 levels). |
| `fetchLineageByTermId(supabase, termId)` | Async lineage walk. |
| `fetchParentCategories(supabase, { visibleOnly })` | List parent_categories. `visibleOnly=true` returns the ≈8 marketplace top-bar set. Returns `{ id, slug, fullLabel, shortLabel, isPublicFilter }`. |
| `fetchDescendantsOf(supabase, parentId)` | Wraps `public.descendants_of()` SQL function. Returns `string[]` of term ids including the parent itself. |
| `shortParentLabel(p)` | Re-exported from `parent-labels.ts`. |
| `SHORT_PARENT_LABEL` | Re-exported map. |

**Why it matters:** every taxonomy decision in the app now has one home. If product changes a rule (e.g. "Fire Dancer should resolve to Specialty Performers, not Dancers"), one function changes, every consumer updates. New surfaces tomorrow → one import, no decisions to make.

### S3-2. Engine tests — `web/src/lib/taxonomy/engine.test.ts`

15 cases covering predicate v2/legacy precedence, primary/secondary extraction across both shapes, relationship filter, parent walk, broken-chain handling, and lineage ordering. **15/15 PASS.**

### S3-3. Read-side migrations (7 user-visible callsites → engine)

All replace inline `is_primary && kind === 'talent_type'` walks with engine calls.

| File | Change |
|---|---|
| `web/src/lib/home-data.ts:192-205` | `featuredTalent` extraction → `extractPrimaryRoleTerm(taxonomy)` |
| `web/src/lib/site-admin/sections/featured_talent/fetch.ts:335-350` | Featured-talent card type label → `extractPrimaryRoleTerm` |
| `web/src/lib/directory/fetch-directory-page.ts:812-840` | Directory card primary type → `extractPrimaryRoleTerm`. Fit-label loop preserved separately. |
| `web/src/lib/talent-dashboard-data.ts:230-239` | "Your role" id lookup → `extractPrimaryRoleRow` (needs FK so uses `extractPrimaryRoleRow` not `extractPrimaryRoleTerm`) |
| `web/src/lib/talent-dashboard-data.ts:454-458` | `hasPrimaryTalentType` flag → `extractPrimaryRoleTerm(...) !== null` |
| `web/src/app/(dashboard)/admin/talent/[id]/page.tsx:262-266` | `hasPrimaryTalentType` flag → engine call |
| `web/src/app/(dashboard)/talent/talent-taxonomy-editor.tsx:105` | "Primary" badge condition → `isTalentTypeTerm(term)` |

**Skipped (intentional):**
- `talent-taxonomy-editor.tsx:535` reads `field.taxonomy_kind` which is field-definition metadata, not a taxonomy_term row. Different concept; left alone.
- `talent-taxonomy-service.ts:57` is the legacy fallback path *inside* `defaultRelationshipForTerm`. It's correct to use `kind` there as the fallback heuristic.

### S3-4. AI rebuild patched — `web/src/lib/ai/rebuild-ai-search-document.ts`

Before: loaded a flat `taxonomy_terms (kind, slug, name_en, name_es)` list and passed it as legacy `taxonomyTerms[]`. The v2 fields on `BuildAiSearchDocumentInput` (`primaryTalentTypeLineage`, `secondaryRoles`, `serviceAreas`, `structuredLanguages`, `skills`, `contexts`, `credentialsAndAttributes`, `searchSynonyms`) existed but weren't populated.

After:
1. **Single taxonomy fetch** with `relationship_type, term_type, parent_id, search_synonyms, ai_keywords` columns included.
2. **Engine-driven extraction**: `extractPrimaryRoleRow` → primary term + assignment metadata; `extractSecondaryRoleTerms` → secondary roles; `extractTermsByRelationship` × 4 → skills, contexts, credentials, attributes.
3. **Lineage walk** via `fetchLineageByTermId` for the primary term → `primaryTalentTypeLineage` (e.g. `["Performers", "Specialty Performers", "Fire Dancer"]`).
4. **Curated synonyms**: combines `primaryTerm.search_synonyms` and `primaryTerm.ai_keywords` → `searchSynonyms`. Capped at 8 by the builder (S2 work).
5. **Structured languages**: fetched from `talent_languages` with proficiency + service flags → `structuredLanguages`.
6. **Service areas**: fetched from `talent_service_areas` joined to `locations`, mapped to `home_base / travel_to / remote_only` shape → `serviceAreas`.
7. **Legacy fallback**: legacy `taxonomyTerms[]` still passed for any kind that doesn't have a v2 home (e.g. fit_label). The builder's existing v2-over-legacy precedence skips kinds that are already represented (skill/language/event_type) when v2 fields are populated.

**Resulting embedding document** for a profile follows the v2 ordered structure:
```
Name: Sofia Martinez
Type: Promotional Model
Type lineage: Models > Promotional Models > Promotional Model
Also bookable as: Pop Singer
Home base: Cancún, MX [home_base]
Travels to: Tulum, MX [travel_to]
Languages: Spanish (native) [native,host,sell]; English (fluent) [host,sell]
Skills: Luxury Sales, Guest Interaction, Runway Walk
Best for: Brand Activations, Luxury Events
fit_label: Bilingual
Bio: …
Synonyms: promo model, event model, brand model, luxury sales
```

**Operational impact**: every profile that triggers a search-document rebuild (mutations to taxonomy / languages / service areas / field values) will now produce this structured embedding. Old documents stay until the next rebuild fires for that profile.

## Files changed in Session 3

**New:**
- `web/src/lib/taxonomy/engine.ts` — 280 lines, the engine
- `web/src/lib/taxonomy/engine.test.ts` — 15 unit tests

**Modified:**
- `web/src/lib/home-data.ts` — engine import + featuredTalent migration
- `web/src/lib/site-admin/sections/featured_talent/fetch.ts` — engine import + type label migration
- `web/src/lib/directory/fetch-directory-page.ts` — engine import + primary type extraction (fit_label loop preserved)
- `web/src/lib/talent-dashboard-data.ts` — engine import + 2 callsite migrations
- `web/src/app/(dashboard)/admin/talent/[id]/page.tsx` — engine import + flag migration
- `web/src/app/(dashboard)/talent/talent-taxonomy-editor.tsx` — engine import + badge condition migration
- `web/src/lib/ai/rebuild-ai-search-document.ts` — full patch to load v2 data + use engine for lineage and relationship splitting

**No migrations.** No schema changes. No destructive operations.

## Verification (Session 3)

| Check | Result |
|---|---|
| `pnpm --filter web typecheck` | **PASS** |
| Unit tests (taxonomy-service + languages-service + ai-doc + engine) | **25/25 PASS** (15 new engine cases) |
| Phase 1 schema QA | **20/20 OK** |
| Phase 2 seed QA | **28/28 OK** |
| Reverse-sync trigger smoke | Still passing (Session 2 verified) |
| Hosted Supabase row counts | Unchanged from Session 2 |

## Updated PR sequence (post-Session 3)

| PR | Status | Notes |
|---|---|---|
| **PR-A** (read-only consume v2) | **DONE** | Sessions 1-2 |
| **PR-A2** (storefront facet rebind + short labels) | **DONE** | Session 2 |
| **PR-B Phase 1: read-side engine consolidation** | **DONE** | Session 3 — engine + 7 callsite migrations + AI rebuild patch |
| **PR-B Phase 2: write-side wiring** | **NEXT** | Wire prototype Save buttons through `setTalentLanguages`, `setTalentServiceAreas`, `assignTaxonomyTermToProfile(relationshipType)`. Requires server actions because the prototype is `"use client"`. Reverse-sync trigger (S2-1) covers drift in the meantime. |
| **PR-C** (derived completeness function) | Pending | `public.talent_profile_completeness(p UUID)` SQL function + UI rewire. |
| **PR-D** (talent_constraints) | Pending | Wardrobe/limits schema + chip UI + directory-filter integration. |
| **PR-E** (talent_trust_badges + agency_enabled_taxonomy_terms) | Pending | Two new tables. |
| **kind='talent_type' cleanup** | Partial | 7/19 migrated in Session 3. 12 legacy/back-compat callsites remain (functional today; pure cleanup). One-line replacements per call. |
| **Phase 2 RLS rebind** | Pending | `talent_profile_taxonomy.tenant_id NOT NULL` + RLS to `is_staff_of_tenant`. |
| **PR 2 (hub layer)** | Pending | After PR-B Phase 2 + PR-C through PR-E. |

## What's still NOT done (post-Session 3)

### Write paths — the next concrete deliverable

The prototype's Save buttons (`Add Talent / Registration / Profile Edit`) are still pure local state via `patchProfileDraft`. **No persistence to Supabase.** This is PR-B Phase 2.

To wire them, the next agent needs:
- A server action endpoint per drawer (or a single shared action with a payload type)
- `assignTaxonomyTermToProfile(profileId, termId, relationshipType)` calls per chip
- `setTalentLanguages(profileId, tenantId, rows)` full-replace
- `setTalentServiceAreas(profileId, tenantId, rows)` full-replace
- The relationship_type validator trigger (PR 1) will reject mismatches at the DB level, so the action layer just needs to pass through the user's selections.

The reverse-sync trigger (S2-1) keeps `talent_profiles.languages/destinations/location_id` direct writes from leaking, but it CANNOT cover brand-new prototype profiles that never had a Supabase row created.

### Remaining `kind='talent_type'` callsites (12, all legacy back-compat)

All FUNCTIONAL today (every v2 talent_type row has both `kind='talent_type'` AND `term_type='talent_type'`). Schedule a single mechanical cleanup PR.

- `lib/ai/{ai-search-document-debug.ts:62, refine-suggestions.ts:98, build-ai-search-document.ts:203}` — debug/legacy fallback paths.
- `lib/ai/rebuild-ai-search-document.ts:86` — REMOVED in Session 3 (no longer present).
- `lib/dashboard/admin-dashboard-data.ts:626` — admin overview count.
- `lib/client-inquiry-details.ts:220` — inquiry detail filter group.
- `app/api/directory/preview/[talentId]/route.ts:182` — preview API.
- `app/(dashboard)/talent/actions.ts:267, 374` — talent action helpers.
- `lib/talent-taxonomy-service.ts:57` — internal fallback in `defaultRelationshipForTerm` (CORRECT to use `kind` here as the legacy fallback).
- 3 in prototype's `_drawers.tsx` (will go away when prototype is replaced or refactored).

### AI rebuild — pre-existing concern, partially addressed

The legacy `featured_talent/fetch.ts:241` uses `.contains("destinations", [destinationSlug])` reading the cache column. Reverse-sync trigger keeps the cache fresh, but this should ideally migrate to `talent_service_areas` joined on `locations.city_slug`. Not blocking; defer to PR-B Phase 2 cleanup or later.

### Save-path drift

The admin M8 editorial form (`admin-talent-editorial-form.tsx`, `editorial-fields-actions.ts`) still writes `talent_profiles.languages TEXT[]` and `destinations TEXT[]` directly. The reverse-sync trigger backfills the canonical tables on every UPDATE so there's no data loss. The eventual cleanup is to migrate the form to call the new service modules — small change, can ride along with PR-B Phase 2.

## Engine usage cookbook (for future PRs)

If you're adding a new surface that needs to render or filter by talent type / parent category / language / service area, **use the engine**. Examples:

```ts
// 1. "Show the primary role on this card"
import { extractPrimaryRoleTerm, type ProfileTaxonomyRow } from "@/lib/taxonomy/engine";
const taxonomy = profile.talent_profile_taxonomy as ProfileTaxonomyRow[];
const primary = extractPrimaryRoleTerm(taxonomy);
const label = primary?.name_en ?? "Talent";

// 2. "Filter directory by parent category"
import { fetchDescendantsOf } from "@/lib/taxonomy/engine";
const ids = await fetchDescendantsOf(supabase, modelsParentCategoryId);
const profiles = await supabase
  .from("talent_profile_taxonomy")
  .select("talent_profile_id")
  .in("taxonomy_term_id", ids);

// 3. "Render the marketplace top-bar facet"
import { fetchParentCategories } from "@/lib/taxonomy/engine";
const parents = await fetchParentCategories(supabase, { visibleOnly: true });
// Each parent has shortLabel pre-resolved.

// 4. "What's the friendly name for this parent?"
import { shortParentLabel } from "@/lib/taxonomy/engine";
const label = shortParentLabel({ slug: term.slug, name: term.name_en });

// 5. "Walk lineage for an embedding doc"
import { fetchLineageByTermId } from "@/lib/taxonomy/engine";
const path = await fetchLineageByTermId(supabase, primaryTermId);
// path[0] is the parent_category root, path[length-1] is the leaf.
```

**Rule of thumb:** if you find yourself writing `kind === 'talent_type'` in new code, you should be importing from `@/lib/taxonomy/engine` instead. The engine is the only place that should know about `kind` vs `term_type` precedence.

---

# Session 4 (2026-05-02 evening) — Editing UX cleanup ("2026 reset")

The user audit of the talent-profile-shell drawer revealed multiple friction points: 19+ tabs, wordy section helpers, the word "role" used inconsistently with industry meanings, "Lock for talent" reading backwards, stats banner mixing analytics with editing, and Rates appearing before Availability. This session shipped a tight cleanup pass. Read the §"What's still NOT done" sub-section carefully — several Tier-B items are explicitly deferred and need per-PR briefs.

## What landed in Session 4

### S4-1. Copy audit — drop "role" from user-facing UI strings

**Why:** "Role" is overloaded in the talent industry — acting role, casting role, agency role, workplace role. Conflicting mental models per surface. The schema-level term `relationship_type='primary_role' | 'secondary_role'` stays (DB internal), but UI strings use "service" / "booked as" / "what you do" instead.

**Changes (all in `web/src/app/prototypes/admin-shell/_drawers.tsx`):**

| Where | Old | New |
|---|---|---|
| ServicesEditor primary heading (line ~5410) | `Main role` | `Booked as` |
| ServicesEditor primary helper | `What can clients book this person as? Pick the one role that best describes the work.` | `What clients book this person as. Pick the main one.` |
| ServicesEditor clear-pill aria-label (line ~5426) | `Change main role` | `Change main service` |
| ServicesEditor secondary heading | `Other roles · within Models · optional` | `Also bookable as · within Models · optional` |
| ServicesEditor secondary helper | `What else can clients book this person as? Pick any that apply.` | `Other things this person can be booked as. Pick any that apply.` |
| Talent first-step nav (line ~7723) | `Pick your role` | `Pick what you do` |
| Languages section helper (line ~5030) | `Speaking level + role flags help clients filter Discover.` | `What languages they speak, and what they can do in each.` |
| Services accordion helper (line ~4396) | `Talent Type + specialties + aspirations. The most important section.` | `What this person is booked as. The most important section.` |

**Kept:** `relationship_type` schema values (DB internal), team-member workspace `role` (Owner / Admin / Coordinator), credit `role` field (acting role on a credit), and code-level `Role` type unions. These are different concepts from the picker UI.

### S4-2. All 18 accordion section helpers compressed

Headers now scan in one glance instead of two lines of marketing prose.

| Section | Old (cluttered) | New (tight) |
|---|---|---|
| Identity | "Name, pronouns, gender, DOB. You control privacy per field." | "Name, pronouns, DOB. Each field has its own privacy." |
| Services | (above) | (above) |
| Location | "Where they work — drives client filtering on Discover." | "Home base + cities they work in." |
| Media | "Cover banner + main photo + portfolio. First photo = avatar." | "Cover, main photo, portfolio. First photo is the avatar." |
| Albums | "Group photos by Editorial / Lookbook / Behind-the-scenes." | "Group photos by mood — Editorial, Lookbook, Behind-the-scenes." |
| Polaroids | "Industry-standard 5-shot set: front · side · back · smile · no makeup. Casting directors expect these." | "5-shot set casting directors expect: front, side, back, smile, no-makeup." |
| About | "2–3 sentences per language. Pick a tone, drop personality cues." | "2–3 sentences per language. Tone optional." |
| Physical | "Height · sizes · features. Visible to agencies and clients you're shortlisted by." | "Height, body sizes, features." |
| Wardrobe | "Shoe · dress · suit. Helps wardrobe departments pre-pull before shoots." | "Shoe, dress, suit sizes." |
| Details | "Type-specific fields plus any custom fields your workspace added." | "Fields specific to this kind of work." |
| Rates | "Per-unit + package bundles + travel/lodging + ask-for-quote." | "Day rates, package deals, travel costs." |
| Availability | "Tap a day to mark busy / blocked. Open by default." | "Tap a day to block it. Open by default." |
| Languages | (already updated in S4-1) | "What languages they speak, and what they can do in each." |
| Refinement | "Skills the talent has, and contexts they shine in." | "Skills they have. Contexts where they shine." |
| Credits | "Past campaigns, editorials, runways, lookbooks. Pin your top 3." | "Past work. Pin your top 3." |
| Limits | "Hard no's and soft case-by-case. Clients see this on the inquiry." | "Hard no's. Soft case-by-case. Clients see this on the brief." |
| Files | "Tax forms, model releases, certifications. Admin-only by default." | "Tax forms, releases, certifications. Admin-only by default." |
| Social proof | "Logos + 1-line quotes. Verified bookings get a checkmark." | "Past clients + 1-line quotes. Verified bookings get a checkmark." |
| Trust | "Drives the trust badge. Higher tier = more visibility on Discover." | "Verification level. Higher tier = more visibility." |

### S4-3. Tier-B6 — "Lock for talent" wording rewrite

**Before:** Toggle read `🔓 Lock for talent` (unlocked state) — confusing because "Lock" suggests "I'm locking myself OUT" when it actually means "Turn ON to prevent talent from editing this field."

**After:**
- Unlocked state: `🔓 Talent can edit` (with title attribute "Talent can edit this. Tap to lock.")
- Locked state: `🔒 Talent can't edit` (with title attribute "Talent can't edit this. Tap to unlock.")

The toggle now reads as a state declaration, not an imperative ambiguity. Empty-state copy ("No locked fields") updated to match.

### S4-4. Tier-B8 — Rates and Availability swap

The mental flow for an agency / client viewing a talent is "Are you available? At what price?" not "Price first, then schedule." Sections now render in that order. Rates section moved from index 11 to index 12 (post-Availability).

### S4-5. Tier-A5 — Stats banner removed from edit drawer

Profile-edit drawer used to show `LAST 7 DAYS · ▲ 12% · 47 Profile views · 3 Inquiries · ↑ Refresh photos to boost views` for self-edit mode. Editing and analytics are different mental tasks. Banner removed; stats live on the dashboard. RequiredCoach (the "Add 2 things to publish" guidance) is preserved — that's editing-relevant.

### S4-6. Tier-A2 — Tri-state status dots in accordion headers

`ProfileAccordionSection` now accepts an optional `started?: boolean` prop alongside `complete: boolean`. Three visual states:

- **✓ Complete** (green filled circle with checkmark)
- **● Started** (amber outline + small amber dot inside) — section has SOME data but hasn't crossed the completeness threshold
- **○ Empty** (grey outline)

A new `sectionStarted` map computes the "started" state per section based on partial data presence (e.g. `services` is started when secondaryTypes or specialties are picked but no primaryType yet). All 19 accordion call-sites wired with `started={sectionStarted.X}`.

**Hover title** on each header: "Complete" / "Started — finish when ready" / "Not started" — makes the state explicit for accessibility.

## Files changed in Session 4

**Modified:**
- `web/src/app/prototypes/admin-shell/_drawers.tsx`:
  - ServicesEditor copy (heading, helper, aria-label, secondary section)
  - First-step nav copy ("Pick what you do")
  - All 18 ProfileAccordionSection `sub=` helpers compressed
  - Languages helper rewritten ("role flags" → "what they can do in each")
  - Services accordion helper rewritten (no more "aspirations")
  - `FieldLockToggle` rewritten (button text + title attribute, JSX prop layout fix)
  - Empty-locks message updated
  - Rates and Availability ProfileAccordionSection blocks reordered (Availability first)
  - Stats banner (`<ProfileGrowthMetric />`) removed from form-banners
  - `ProfileAccordionSection` extended with `started?: boolean` prop and tri-state visual
  - `sectionStarted` map computed alongside `sectionComplete`
  - 19 callsites wired with `started={sectionStarted.X}`

**No schema changes.** **No engine changes.** **No new dependencies.**

## Verification (Session 4)

| Check | Result |
|---|---|
| `pnpm --filter web typecheck` | **PASS** (one transient error during edits caught + fixed) |
| Hosted Supabase | Untouched |
| Engine tests | Still 25/25 PASS |
| Phase 1 + 2 QA | Still 20/20 + 28/28 OK |

## What's still NOT done — 8 deferred items, each ready as its own PR brief

These are the remaining Tier-A and Tier-B items I scoped but did NOT ship in Session 4. Each has a clear acceptance criterion and is small enough to be one focused agent prompt.

### A1 — Collapse 19 top tabs into 6 grouped sections (deferred — biggest UI change)

The drawer tab strip today has Identity / Services / Location / Media / Albums / Polaroids / About / Physical / Wardrobe / Details / Rates / Availability / Languages / Refinement / Credits / Limits / Files / Social proof / Trust / Admin = up to 20 tabs. Cognitive load is enormous.

**Proposed grouping:**

| Group | Contains |
|---|---|
| **Who** | Identity |
| **What** | Services |
| **Where** | Location |
| **Visual** | Cover · Headshot · Portfolio · Albums · Polaroids · Showreel (sub-tabs inside) |
| **About** | Bio · Physical · Wardrobe · Languages |
| **Business** | Availability · Rates · Refinement · Credits · Limits · Files · Trust · Admin |

**File touched:** `web/src/app/prototypes/admin-shell/_drawers.tsx` — tab nav definition + ProfileSectionId union + accordion container nesting. Estimated ~150 lines change, careful with state-routing through nested sections.

**Acceptance:** 6-tab top nav with grouped sub-sections; deep-links to specific sub-sections still work (e.g. `?section=physical` opens Group "About" + scrolls to Physical sub-section).

### A4 — Sticky save state indicator in footer (deferred)

Footer today shows "Saved just now" + "Save changes" / "Publish". Unclear what's pending vs synced. Replace with:
- Dirty: `● 3 unsaved changes · Save now`
- Clean: `✓ All saved`
- `Publish` button stays disabled until all required fields filled, with hover tooltip "2 required fields missing — Add bio · Add home base"

**File touched:** Footer JSX in `_drawers.tsx`. Requires a `dirty` boolean tracking unsaved changes (compare current state to last-saved snapshot). Not a huge change but needs care because the prototype writes optimistically to local store on every keypress.

### B1 — Reorder sections by editing priority (deferred — touches many places)

Today's order: Identity → Services → Location → Media → Albums → Polaroids → About → Physical → Wardrobe → Details → Availability → Rates → Languages → Refinement → Credits → Limits → Files → Social proof → Trust → Admin.

**Proposed:** Services → Location → Languages → About → Identity → Media → Physical → Wardrobe → Availability → Rates → Refinement → Credits → Limits → Files → Social proof → Trust → Admin.

Why: Services + Location + Languages are the v2 discovery primary signals. Identity is mostly autofilled at create time. Visual matters but takes longer. Business and trust come last.

**File touched:** `_drawers.tsx` — reorder the JSX `<ProfileAccordionSection>` blocks. ~30 lines move. Make sure `activeSection` deep-link continues to work.

### B2 — Identity section split (deferred)

Identity section today has 9 fields (Stage name, Legal name, Pronunciation, Pronouns, Gender, DOB, Nationality, Country of residence, Reply-time commitment). Most users only need 3.

**Proposed:**
- **Public identity (always visible):** Stage name · Pronouns · Reply-time commitment (3 fields)
- **Admin-only / KYC (collapsed by default):** Legal name · DOB · Nationality · Country of residence · Gender · Pronunciation (6 fields, behind a `<details>`)

**File touched:** Identity section body JSX. ~50 lines. Add a "More details" `<details>` wrapping the bottom 6 fields.

### B3 — Compact privacy markers (deferred)

Each Identity field today has a chip like `🔒 PRIVATE` or `🏢 AGENCY ONLY` or `🌐 PUBLIC + AGENCY`. The text is repeated everywhere and crowds the layout. Replace with single-icon chip + tooltip.

**Proposed:** `<PrivacyIcon level="private" />` renders one icon (🔒 / 🏢 / 🌐) with `title` attribute carrying the verbose explanation.

**File touched:** `_drawers.tsx` — the privacy-chip helper component (probably named `PrivacyChip` or inline). Replace its render to icon-only. Single component, all callsites benefit automatically.

### B4 — Required-coach deep-links (deferred — partly done already)

The required-coach already takes an `onJump` callback. Wire each missing item to:
1. Auto-collapse all sections
2. Auto-open the section that contains the missing field
3. Auto-scroll the field into view + focus it

Some of this exists; verify and finish.

### B5 — Group media sections under one Visual tab (deferred)

Today Media · Albums · Polaroids are three separate accordions. Talent has to think about three media-related concepts. Group under one tab "Visual" with internal sub-tabs: Cover · Headshot · Portfolio · Albums · Polaroids · Showreel. Same data, fewer cognitive moves.

**File touched:** `_drawers.tsx`. The three sections become one `<ProfileAccordionSection>` with internal tabs. Sub-tab state can be local to that accordion. ~80 lines.

### B7 — Inline save checkmark on field blur (deferred — polish)

When the user types in a field and tabs away, flash a tiny ✓ next to the field for 2 seconds. Reduces save anxiety. Implementation: a `<FieldRow>`-level prop that renders a transient checkmark on blur. ~30 lines for the helper, ~5-10 lines per call-site (or auto-detect via wrapper).

### Tier-C (long-term polish) — NOT PURSUING

- Live preview pane
- ⌘K quick-jump
- Undo toast for destructive actions
- Keyboard navigation
- Field-level "ask the agency" delegation

These are quality-of-life polish that don't move the editing experience materially. Park.

## Updated PR sequence (post-Session 4)

| PR | Status | Notes |
|---|---|---|
| **PR 1** (Taxonomy v2 schema) | DONE | Sessions 1-2 |
| **PR-A** (read-path) | DONE | Sessions 1-2 |
| **PR-A2** (storefront facet rebind) | DONE | Session 2 |
| **PR-B Phase 1** (Engine + read-side migrations + AI rebuild patch) | DONE | Session 3 |
| **PR-B Phase 1.5** (Editing UX cleanup — copy / Lock wording / status dots / Rates+Availability swap / stats removal) | DONE | Session 4 |
| **PR-B Phase 2** (Write-path wiring) | NEXT (most likely) | Server actions + service module calls |
| **PR-UX1** (A1 tab grouping 19→6) | NEXT (alternative) | Bigger visible product moment |
| **PR-UX2** (A4 save-state indicator) | Pending | Small, focused |
| **PR-UX3** (B1 section reorder) | Pending | Mechanical reorder |
| **PR-UX4** (B2 Identity split) | Pending | One section, internal split |
| **PR-UX5** (B3 Compact privacy markers) | Pending | One helper component |
| **PR-UX6** (B4 Required-coach deep-links polish) | Pending | Partial; finish |
| **PR-UX7** (B5 Visual group + sub-tabs) | Pending | Three sections → one |
| **PR-UX8** (B7 Inline save checkmark) | Pending | FieldRow-level helper |
| **PR-C** (Derived completeness function) | Pending | DB function |
| **PR-D** (talent_constraints) | Pending | New table |
| **PR-E** (talent_trust_badges + agency_enabled_taxonomy_terms) | Pending | Two new tables |
| **kind='talent_type' cleanup** | Partial | 7/19 done, 12 legacy callsites left |
| **Phase 2 RLS rebind** | Pending | Small migration |
| **PR 2 (hub layer)** | Pending | After PR-B Phase 2 + PR-C through PR-E |

---

# Handoff prompt for the next agent

(Copy everything below this line into a fresh chat.)

```
You are picking up a multi-PR initiative on the Tulala / Impronta Models multi-tenant SaaS platform. Four prior sessions shipped:
  - PR 1 (Taxonomy v2 schema) — live on hosted Supabase
  - PR-A (read-path consumption) — live
  - PR-A2 (storefront facet rebind + short labels) — live
  - Reverse-sync trigger (drift safety net) — live
  - PR-B Phase 1 (Taxonomy ENGINE + 7 user-visible callsite migrations + AI rebuild v2 patch) — live
  - PR-B Phase 1.5 (Editing UX cleanup — copy audit, Lock wording, status dots, Rates+Availability swap, stats banner removal) — live in prototype

The taxonomy engine at `web/src/lib/taxonomy/engine.ts` is now the single source of truth for category logic. Use it for any new surface. Don't write `kind === 'talent_type'` in new code — import from the engine.

The user has explicitly asked to drop the word "role" from user-facing UI strings. Use "service" / "booked as" / "what you do" instead. Schema-level `relationship_type='primary_role' | 'secondary_role'` stays — that's DB internal.

The next concrete PR is **either PR-B Phase 2 (write-path wiring) or PR-UX1 (collapse 19 tabs into 6 grouped sections)** — see §"Updated PR sequence (post-Session 4)" for both briefs. The user prioritizes visible UX moments — PR-UX1 may land first.

BEFORE TAKING ANY ACTION:

1. Read this handoff document in full:
   `/Users/oranpersonal/Desktop/impronta-app/docs/handoffs/taxonomy-v2-handoff-2026-04-30.md`

2. Read the user's auto-memory index:
   `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/MEMORY.md`
   and at minimum these specific memories before any code work:
   - project_saas_build_charter.md
   - project_impronta_blueprint.md
   - project_workspace_talent_hybrid.md
   - project_talent_subscriptions.md
   - project_client_trust_badges.md
   - project_agency_exclusivity_model.md
   - feedback_pre_launch_shipping.md
   - reference_preview_hydration.md

3. Read the prior plan file:
   `~/.claude/plans/you-are-working-on-calm-valiant.md`

4. Read `web/AGENTS.md` and `web/CLAUDE.md` — this is NOT the Next.js you know; consult `node_modules/next/dist/docs/` before touching frontend code.

5. Run the health checks documented in the handoff doc to confirm the live system is in the expected state:
   ```
   node scripts/taxonomy-v2-qa-phase1.mjs    # expect 20/20 OK
   node scripts/taxonomy-v2-qa-phase2.mjs    # expect 28/28 OK
   pnpm --filter web typecheck               # expect PASS
   ```
   If any fails, stop and investigate before taking any action.

6. Confirm to me the following before I assign you a PR:
   a. You read the handoff doc end-to-end and understand the four-layer rule (Talent Type / Specialty / Skill / Context).
   b. You understand which of the 10 hard rules in §"Hard rules (NON-NEGOTIABLE)" apply to the work I'm about to assign you.
   c. You understand the difference between `kind` (legacy enum) and `term_type` (v2 column) on `taxonomy_terms`, and which one is canonical going forward.
   d. The QA scripts ran clean.

NEXT ACTION:
PR-A, PR-A2, PR-B Phase 1, and PR-B Phase 1.5 are DONE. After the above is confirmed, I will assign you ONE of:
- **PR-B Phase 2** (write-path wiring) — most architecturally important
- **PR-UX1** (collapse 19 tabs into 6 grouped sections) — biggest user-visible win
- **PR-UX2** (sticky save-state indicator)
- **PR-UX3** (reorder sections by editing priority)
- **PR-UX4** (Identity split into Public + Admin-only)
- **PR-UX5** (compact privacy markers)
- **PR-UX6** (required-coach deep-links polish)
- **PR-UX7** (Visual group + sub-tabs)
- **PR-UX8** (inline save checkmark on field blur)
- PR-C (derived completeness function)
- PR-D (talent_constraints)
- PR-E (talent_trust_badges + agency_enabled_taxonomy_terms)
- 12 remaining kind='talent_type' cleanup callsites (mechanical)
- Phase 2 RLS rebind (`tenant_id NOT NULL` + `is_staff_of_tenant`)

Briefs for each PR-UX item are in §"What's still NOT done" of the Session 4 block.

Briefs in the handoff doc's §"Recommended PR sequence (canonical)" + §"Updated PR sequence (post-Session 2)" + §"Updated PR sequence (post-Session 3)". Do not bundle. Do not start PR 2 (hub layer) — that is post-PR-E.

The most likely next assignment is **PR-B Phase 2: write-path wiring**. It depends on:
- `web/src/lib/taxonomy/engine.ts` — the engine. Use it for any new categorization decision.
- `web/src/lib/talent-taxonomy-service.ts` — already extended for `relationshipType` parameter (PR 1).
- `web/src/lib/talent-languages-service.ts` — set-replace API ready (PR 1, no production callers yet).
- `web/src/lib/talent-service-areas-service.ts` — set-replace API ready (PR 1, no production callers yet).
- `web/src/app/prototypes/admin-shell/_drawers.tsx` — Save buttons need server actions that call the service modules.
- The reverse-sync trigger (S2-1) is live and covers the drift gap, but it CANNOT cover brand-new prototype profiles that have no row yet.

When you do PR-B Phase 2, **use the engine** for any read-side companion work. See "Engine usage cookbook" in the handoff doc.

OPERATIONAL RULES YOU MUST FOLLOW:
- The hosted Supabase project ref is `pluhdapdnuiulvxmyspd`. Direct DB DNS is unreachable from sandboxed runners. Use `scripts/_pg-via-mgmt-api.mjs` (Management API) for all SQL.
- All migrations must be additive. No DROP, no RENAME, no enum reshape mid-flight without explicit approval.
- Pre-launch shipping rules apply (the user will say "we are live" when that changes). Additive migrations to the hosted DB are fine for PR-A through PR-E once you confirm the brief.
- Test profiles in `supabase/seed_taxonomy_v2_test_profiles.sql` are NOT to be applied to hosted Supabase without separate explicit approval.
- The preview tool has a documented React hydration limitation; per the user's auto-memory, server logs + curl + SQL are the verified-via-logs fallback when preview_eval gets stuck on client-component subtrees.
- Each PR is its own prompt and its own delivery. Run the per-phase QA bundle on completion. Final report follows the same shape as the PR 1 report (test results, migrations applied, QA results, files changed, follow-ups).

WHEN YOU ARE READY:
Reply with the four confirmations from step 6 above, then wait for me to assign the PR.
```
