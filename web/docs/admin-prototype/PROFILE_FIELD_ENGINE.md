# Profile Field Engine — Session Handoff (2026-05-02)

> **Read this entire file before taking any action.** It is the complete record of what shipped in this session across the prototype profile field engine work (Phases B → C → A → D → E → F → G), what is verified, and what's deliberately deferred. Pairs with `web/docs/admin-prototype/MASTER_FIELD_CATALOG.md` (Phase D specifics).

## TL;DR

The Tulala profile system now has **one field engine** used by every consumer (Agency Add Talent, Agency Edit, Talent Registration, Talent Self-Edit, Roster cards, Talent dashboard, Public profile preview) — agencies can override the platform field defaults from a settings UI, those overrides flow through every surface, the **Phase D database schema is live on hosted Supabase**, and the three creation/editing surfaces (wizard, admin add-new, edit drawer) are aligned on the same catalog-driven field engine.

Seven phases shipped in this session:

- **Phase B** — Full profile shape for ALL talent (not just Marta).
- **Phase C** — Primary + secondary roles round-trip everywhere.
- **Phase A** — Unified frontend field catalog (FIELD_CATALOG + TAXONOMY_FIELDS now project into one source).
- **Phase D** — Database-backed Master Catalog. **APPLIED LIVE on hosted Supabase**: 4 tables + 179 field definitions + 171 recommendations.
- **Phase E** — Workspace Field Settings UI live in the prototype. Agency admins override every catalog mode flag per-tenant.
- **Phase F** — Per-surface override consumption + functional roster filters + visibility-aware public preview + dynFields backfill script.
- **Phase G** — Three-surface alignment: visibility chip redesign + wizard/add-new read `resolvedFieldsForMode` + unified `validateField` helper + add-new gets multi-role secondary picker + add-new shows catalog-driven peek of what comes next.
- **Phase H — Website page** — Premium 2026 top-nav workspace surface for site management: pages, posts, 301 redirects, navigation, custom CSS/JS injection, tracking codes (GA4/Plausible/Pixel/GTM/Hotjar), SEO defaults, domain + SSL, maintenance mode, site-wide announcement banner.

Type-check on the prototype: `exit 0` (excluding 3 pre-existing `_messages.tsx` errors that predate this session and are unrelated).

## Context

- Branch: `phase-1`
- Repo root: `/Users/oranpersonal/Desktop/impronta-app`
- Pre-launch shipping rule: ship straight to prod; the user will say "we are live" when that changes.
- This is **NOT** the Next.js you know — read `web/AGENTS.md` first.
- The prior session's handoff (taxonomy v2) is `docs/handoffs/taxonomy-v2-handoff-2026-04-30.md`. Phase D depends on that taxonomy being present.

## Architectural commitment

> "Tulala is opinionated: the engine ships with a comprehensive schema so agencies never need to roll their own custom-field system."

Three tiers govern every profile field:

1. **Universal** — every talent has these. Required to publish. Identity, contact, location, languages, headshot, consent.
2. **Global** — cross-type, optional. Most talent eventually fill them. Measurements (when applicable), social links, rate card, travel/visa, skills, limits, credits, reviews, emergency contact, documents.
3. **Type-specific** — only relevant for one or a few talent types. Driven by `appliesTo`/`requiredFor`/`recommendedFor` per parent. Models get bust/waist/hips; chefs get cuisine + kitchen size; drivers get license class.

Workspace settings (Phase E) override applicability/required-ness/visibility per tenant. Phase F threads those overrides through every surface (label, helper, hidden, REQUIRED pill, visibility-aware preview, functional roster filters). Agencies cannot extend the catalog with new fields — that's the platform's contract.

## Vocabulary

A glossary in one place so the rest of the doc + the codebase reads cleanly.

| Term | Means |
|---|---|
| **Catalog** | The platform's curated list of every profile field. Lives at `_field-catalog.ts::FIELD_CATALOG` in the prototype, `profile_field_definitions` in the DB. Single source of truth. |
| **Field key** | The catalog entry's stable id. Convention: dotted path. Universal/global → flat (`identity.legalName`, `bios`); type-specific → namespaced (`models.height`, `chefs.cuisines`). Match this id between prototype and DB. |
| **Tier** | One of `universal` (every talent has it; gates publish), `global` (cross-type optional), `type-specific` (only relevant per parent type). Drives the engine's gating + display rules. |
| **Section** | The drawer accordion / settings UI grouping. 16 values: `identity / location / languages / media / measurements / wardrobe / rates / travel / skills / limits / credits / reviews / social / documents / emergency / type-specific`. Maps drawer accordion ids via `DRAWER_SECTION_TO_CATALOG`. |
| **Subsection** | Type-specific fields can opt into `physical` or `wardrobe` to render in the dedicated grid accordions instead of the catch-all "Profile details" list. |
| **Kind** | The input renderer: `text / number / select / multiselect / chips / date / toggle / textarea`. Wizard + drawer + add-new all map this to actual inputs. |
| **`appliesTo: TaxonomyParentId[]`** | Which talent type parents this field is applicable to. Empty = applies to every type. |
| **`requiredFor: TaxonomyParentId[]`** | Which talent types must fill this field to publish. Logical OR when a profile is multi-role (a field required for models stays required for a model+host). |
| **`recommendedFor: TaxonomyParentId[]`** | Soft-rank; surfaces the field above other optionals in registration + add-new peek. Drives the "fill these next" experience. |
| **`countMin`** | Minimum array length for count-based fields (`portfolio` ≥ 3, `languages` ≥ 1). `null` means "any non-empty value counts". |
| **Mode flags** | `showInRegistration / showInEditDrawer / showInPublic / showInDirectory / adminOnly / talentEditable / requiresReviewOnChange`. Each catalog field carries defaults; workspace overrides any of them. `fieldsForMode(mode, parentId)` returns the slice for that surface. |
| **Visibility channels** | Three: `public` (Tulala hub + public profile), `agency` (agencies you're shortlisted by), `private` (only the talent + admins for compliance). `defaultVisibility: ("public" \| "agency" \| "private")[]` is the catalog default; talent overrides per field via the chip popover. |
| **Workspace override** | Per-tenant override on top of the catalog default. Sparse: only fields the workspace customized get a row in `__workspaceOverrides` / `workspace_profile_field_settings`. |
| **Tenant** | One agency workspace. The prototype hardcodes `PROTO_TENANT_ID = "tenant.acme-models"`; production reads from auth context (the only place this id needs to flip when auth is wired). |
| **Override store** | `_state.tsx::__profileOverrides` — per-talent in-session edits keyed by talent id. localStorage-persisted. The bridge between drawer ProfileState and the canonical `MyTalentProfile`. |
| **`MyTalentProfile`** | The full prototype profile shape (~50 fields). Per-talent records live in `TALENT_PROFILES_BY_ID[id]`. Production target: `talent_profiles` row + joined `talent_profile_field_values`. |
| **`ProfileState`** | The drawer's working state. Hydrated from canonical profile on open; round-trips back to override store via `finalSubmit`. Local to one drawer session. |
| **`ProfileDraft`** | The shared draft store at `_profile-store.ts`. The wizard + add-new write to this; the edit drawer reads it via `payload.seed` on `mode: "create"`. Canonical field names. |

## Wiring map — how data flows between layers

Six layers from user input to durable storage. Read top-down for "where does this value go after I type it?"

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SURFACE local state                                           │
│    Wizard:        stageName / parents / children / fields / …    │
│    Add-new:       firstName / lastName / primaryType / homeBase  │
│    Edit drawer:   ProfileState (full shape, reducer-managed)     │
└─────────────────────────────────────────────────────────────────┘
            │ patchProfileDraft on every input (debounced 350ms)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ProfileDraft (sessionStorage `tulala.profile-draft.<key>`)    │
│    Canonical names. Survives drawer close + tab reload + SW.     │
│    Bridge between wizard ↔ add-new ↔ edit drawer "create" mode.  │
└─────────────────────────────────────────────────────────────────┘
            │ Edit drawer's `payload.seed` on mode: "create"
            │ OR direct edit on existing talent (skip draft)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. ProfileState (in-drawer reducer)                              │
│    Hydrated from getProfileById(payload.talentId) on open.       │
│    All edits apply here until finalSubmit.                       │
└─────────────────────────────────────────────────────────────────┘
            │ finalSubmit() writes via setProfileOverride(tid, patch)
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Override store (`_state.tsx::__profileOverrides`)             │
│    localStorage `tulala.proto.profileOverrides`.                 │
│    Keyed by talent id. Self-edits also push pendingReviews.      │
└─────────────────────────────────────────────────────────────────┘
            │ applyProfileOverride(id, baseProfile) merges
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. MERGED MyTalentProfile (read by every consumer)               │
│    Talent dashboard, ProfileHero, AllSectionsGrid, RosterCard,   │
│    ViewAsClientModal — all read this merged value.               │
└─────────────────────────────────────────────────────────────────┘
            │ Production cutover: write through to DB
            ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. DB (LIVE — Phase D applied)                                   │
│    talent_profiles                  ← universal + global cols    │
│    talent_profile_field_values      ← type-specific JSONB rows   │
│    talent_languages                 ← structured (separate)      │
│    talent_service_areas             ← structured (separate)      │
│    talent_profile_taxonomy          ← structured (separate)      │
└─────────────────────────────────────────────────────────────────┘
```

**Workspace settings + catalog flow alongside, not below:**

```
┌────────────────────────────────────────────────────────────────┐
│ FIELD_CATALOG (frontend)  ──seed──▶  profile_field_definitions │
│         │                            (DB, LIVE)                │
│         ▼                                  ▲                   │
│  resolvedFieldsForMode(mode, tenantId, parentId)               │
│    = catalog default × workspace override                      │
│         │                                                      │
│         ▼                                                      │
│  used by: wizard step 5, edit drawer accordions,               │
│           add-new "what's collected next", validation,         │
│           public preview, roster filter chips                  │
│                                                                │
│ __workspaceOverrides ─────────▶  workspace_profile_field_settings
│ (localStorage)                    (DB, LIVE; tenant-scoped RLS)│
└────────────────────────────────────────────────────────────────┘
```

## Production migration map

When the prototype's `MyTalentProfile` lands in the DB, fields split into three buckets. **Don't put structured systems into `talent_profile_field_values`.**

| Prototype field | Goes to | Why |
|---|---|---|
| `name`, `legalName`, `pronouns`, `age`, `dob`, `nationality`, `homeCountry`, `responseTime`, `tagline`, `currentLocation` | `talent_profiles` columns | Universal/global, every row, high-traffic |
| `coverPhoto`, `profilePhoto`, `showreelUrl`, `bookingStats`, `availableForWork`, `availableToTravel`, `publishedAt`, `publicUrl`, `subscription` | `talent_profiles` columns | Same |
| `primaryType`, `secondaryTypes`, `specialties` | `talent_profile_taxonomy` (one row per assignment, `relationship_type` distinguishes) | Cross-cutting search; multi-tenant config; hierarchy |
| `languages` | `talent_languages` | Speaking/reading/writing levels + role flags (can-host/sell/translate/teach) |
| `city`, `serviceArea` | `talent_service_areas` | Distance queries, structured radius/fee model |
| `skills` | `taxonomy_terms` + `talent_profile_taxonomy` (`relationship_type='skill'`) | Same taxonomy substrate as types |
| `measurements` (height, bust, waist, hips, etc.) | `talent_profile_field_values` (JSONB rows, one per filled field) | Type-specific; many talent types don't apply; sparse storage |
| `dynFields` (per-type values: cuisine, vehicle, kit, etc.) | `talent_profile_field_values` | Same |
| `portfolioVideos`, `albumsPro`, `polaroids` | Existing media/gallery tables | Storage, EXIF, derivatives |
| `documents` | Existing document table (extend `TalentDocument` shape with `verifiedBy`/`verifiedAt`) | Verification + expiry are first-class workflow |
| `rateCard` | `talent_profiles.rate_card_visibility` column + structured rate rows table | Per-line rates need their own shape |
| `verifications`, `badges` | Existing trust system | Already structured |
| `credits`, `reviews`, `pastClients`, `limits` | Existing typed tables | Each has its own workflow + visibility |
| `internalNotes`, `featureInDirectory`, `fieldLocks`, `fieldLockReasons`, `emergencyContact` | `talent_profiles` columns or small typed tables | Workspace-curated + privacy-tiered |

**The split rule**: structured (typed columns or first-class tables) wins for anything that has its own workflow, search semantics, or visibility tier. JSONB `talent_profile_field_values` is for genuinely per-type extensible details.

## Taxonomy bridge — slug translation

The prototype uses short parent slugs (`hosts`, `music`, `chefs`). Production `taxonomy_terms` uses canonical longer slugs (`hosts-promo`, `music-djs`, `chefs-culinary`). The bridge lives in **two places** and must stay in sync:

```ts
// scripts/generate-profile-field-catalog-seed.mjs
const PARENT_SLUG_MAP = {
  models:         "models",
  hosts:          "hosts-promo",
  performers:     "performers",
  music:          "music-djs",
  creators:       "influencers-creators",
  chefs:          "chefs-culinary",
  wellness:       "wellness-beauty",
  hospitality:    "hospitality-property",
  transportation: "transportation",
  photo_video:    "photo-video-creative",
  event_staff:    "event-staff",
  security:       "security-protection",
};
```

The seed generator translates at SQL emit time so `profile_field_recommendations.taxonomy_term_id` joins correctly. The production read service (`web/src/lib/profile-fields-service.ts`) reads slugs back out of `taxonomy_terms.slug` — it doesn't re-translate; the prototype-short slugs only exist client-side for legacy reasons. **Single direction of translation:** prototype → DB at seed time.

When a new parent talent type lands:
1. Add it to `TAXONOMY` in `_state.tsx` (prototype short id)
2. Add the same id to `PARENT_SLUG_MAP` mapping to its `taxonomy_terms.slug`
3. Re-run `node scripts/generate-profile-field-catalog-seed.mjs`
4. Re-apply the seed migration

If the slug is missing from the map, recommendations silently drop the field × type pair (because the JOIN finds no match). Phase F discovered this — guard against silent regressions by counting recommendations after every seed apply and comparing to the prior count.

## Operational reference

**Hosted Supabase project:** `pluhdapdnuiulvxmyspd` (URL `https://pluhdapdnuiulvxmyspd.supabase.co`).

**Direct DB DNS is unreachable from sandboxed runners.** Use the Management API helper:

```bash
# Reads SUPABASE_ACCESS_TOKEN from web/.env.local
node -e '
import("./scripts/_pg-via-mgmt-api.mjs").then(async ({ runSql }) => {
  console.log(await runSql("<your SQL>"));
});
'
```

**Common verification one-liners:**

```bash
# Catalog row counts (should be 179 / 171)
node -e 'import("./scripts/_pg-via-mgmt-api.mjs").then(async ({runSql})=>{
  console.log(await runSql("SELECT count(*) FROM profile_field_definitions"));
  console.log(await runSql("SELECT count(*) FROM profile_field_recommendations"));
});'

# By tier (universal: 11, global: 22, type-specific: 146)
node -e 'import("./scripts/_pg-via-mgmt-api.mjs").then(async ({runSql})=>{
  console.log(await runSql("SELECT tier, count(*) FROM profile_field_definitions GROUP BY tier"));
});'

# Re-apply the seed after editing the prototype catalog
node scripts/generate-profile-field-catalog-seed.mjs > supabase/migrations/20260901120400_seed_profile_field_catalog.sql
node -e 'import("./scripts/_pg-via-mgmt-api.mjs").then(async ({runSql})=>{
  const fs = await import("node:fs");
  const sql = fs.readFileSync("./supabase/migrations/20260901120400_seed_profile_field_catalog.sql","utf8");
  await runSql(sql);
});'

# Frontend type-check (excludes 3 pre-existing _messages.tsx errors)
cd web && npx tsc --noEmit 2>&1 | grep -v "_messages\|.next/dev"
# Expected: empty + exit 0
```

**Auth plumbing — single integration point.** When real auth wires in, the only field-engine change needed is replacing the constant:

```ts
// web/src/app/prototypes/admin-shell/_field-catalog.ts
export const PROTO_TENANT_ID = "tenant.acme-models";  // ← swap for current workspace id from auth
```

Every override read (`applyWorkspaceFieldOverride`, `resolvedFieldsForMode`, `validateField`) passes the tenant id explicitly — they don't reach for the constant. So lifting it to a context-derived value is a one-line change at each callsite (~25 callsites, all already pass `PROTO_TENANT_ID`).

## Gotchas (things that bit during this work)

1. **Seed generator parser is depth-aware.** Earlier version used a flat regex that matched `defaultVisibility: [` inside entry objects as if it were a parent name. Result: a junk `defaultVisibility.undefined` row. Fix: walk-with-depth-counter when scanning TAXONOMY_FIELDS body. Don't revert.
2. **`PARENT_SLUG_MAP` must stay in sync.** Without it, `profile_field_recommendations` count drops silently (78 vs 171). Guard rail: count recommendations after every seed apply.
3. **`_messages.tsx` has 3 pre-existing tsc errors** about `Property 'seen' does not exist on type 'RichInquiry'`. NOT from this work. Confirmed via `git stash` isolation. Don't try to fix — `RichInquiry.seen` is consumed in messaging code that predates this engine work.
4. **Override store key alignment.** `MY_TALENT_PROFILE` was originally keyed by `t-marta` (firstname-derived); roster rows use `t1`. `getPendingReviewForRoster()` does fallback resolution by name. Don't introduce new code that hard-codes one key form.
5. **Visibility check at 3 layers.** Catalog `defaultVisibility` → talent's `visibility_override` (per field) → workspace `default_visibility_override`. Public profile renderer must check ALL THREE. `applyWorkspaceFieldOverride` handles catalog × workspace; per-talent override join is the missing piece (deferred — H3).
6. **Universal-tier fields are inviolable.** Workspace cannot set `enabled=false` on universal fields. Enforced in `applyWorkspaceFieldOverride`. Don't add a code path that bypasses it.
7. **`talent_profile_field_values.workflow_state`.** `live` is the default; `pending` and `rejected` are the workflow states for review-required fields. Public read RLS gates on `workflow_state = 'live'` AND visibility. Don't surface pending values on the public profile.

## Phase B — Full profile shape for all talent (DONE)

### What

Replaced the singleton `MY_TALENT_PROFILE` with `TALENT_PROFILES_BY_ID: Record<string, MyTalentProfile>` so every roster talent has a full profile shape, not just Marta.

### Where

- `web/src/app/prototypes/admin-shell/_state.tsx`
  - Added `TALENT_PROFILES_BY_ID` map
  - Added `getProfileById(talentId): MyTalentProfile`
  - Added `getEnrichedProfile(rosterRow)` convenience helper
  - Added `makeTalentProfile(base, overrides)` factory
  - Seeded full profiles for `t1`–`t7`: Marta, Kai, Tomás, Lina, Amelia, Sven, Zara
  - Each seed includes measurements, languages, specialties, skills, agency, etc.

- `web/src/app/prototypes/admin-shell/_drawers.tsx::TalentProfileShellDrawer`
  - `ProfileShellPayload.talentId` added (canonical id)
  - `makeInitialProfileState` resolves canonical profile via `getProfileById(payload.talentId)`
  - All identity / measurements / wardrobe / specialties / languages / emergency contact / rate visibility / passport / work-eligibility now hydrate from canonical profile (no more name-matching)
  - `finalSubmit` keys override store by `tid = payload.talentId` (no more `talentIdOf(MY_TALENT_PROFILE)`)
  - Round-trips back to the canonical profile via the override store

- `web/src/app/prototypes/admin-shell/_pages.tsx::TalentPage`
  - `openProfile(p)` now passes `talentId: p.id`
  - `RosterCard` enriches from `TALENT_PROFILES_BY_ID`
  - Live completeness derived via `computeProfileCompleteness(applyProfileOverride(id, profile), [primary, ...secondary])`

- `web/src/app/prototypes/admin-shell/_talent.tsx`
  - `MyProfilePage`, `AllSectionsGrid`, `ProfileHero` now load via `applyProfileOverride("t1", getProfileById("t1"))`
  - All `talentIdOf(MY_TALENT_PROFILE)` callsites replaced with talent-id-based resolution

### Acceptance

- Open Marta, Kai, Amelia, Tomás, Lina, Sven, Zara — all use the same edit shell
- Drawer no longer becomes empty for non-Marta talent
- Roster card, dashboard, and drawer read from the same profile object
- Override store keys align (no more `t-firstname` ↔ `t1` mismatch)

## Phase C — Primary + secondary roles (DONE)

### What

Multi-role profiles work end-to-end. A "Model + Host" talent shows model fields AND host fields; required-fields union'd across all roles.

### Where

- `web/src/app/prototypes/admin-shell/_state.tsx`
  - `MyTalentProfile.secondaryTypes: TaxonomyParentId[]` added
  - Marta seeded with `secondaryTypes: ["hosts"]` (also takes red-carpet correspondent gigs)
  - Tomás seeded with `secondaryTypes: ["transportation"]` (also drives premium-transport)

- `web/src/app/prototypes/admin-shell/_field-catalog.ts`
  - `fieldsForType(parentId | parentId[])` — accepts arrays; returns union
  - `isRequiredForType(fieldId, parentId | parentId[])` — required for ANY role wins
  - `sectionAppliesToType(sectionId, parentId | parentId[])` — multi-role
  - `computeProfileCompleteness(profile, parentId | parentId[])` — denominator unions

- `web/src/app/prototypes/admin-shell/_drawers.tsx`
  - All 25 `ProfileAccordionSection` callsites pass `[state.primaryType, ...state.secondaryTypes]`
  - `RegFieldInput` + `RequiredPill` accept `string | ReadonlyArray<string>`
  - `finalSubmit` round-trips `secondaryTypes` to the override store

- `web/src/app/prototypes/admin-shell/_pages.tsx::RosterCard`
  - Renders secondary-role chips ("+ Hosts" below the primary type label)

- `web/src/app/prototypes/admin-shell/_talent.tsx`
  - `PageHeader` subtitle reads "Model · also Host · 5'9″ · Madrid"
  - `TierBreakdown` accepts secondaryTypes

### Acceptance

- Primary: Model + Secondary: Host shows Model fields + Host fields in the drawer's Profile Details accordion
- Primary: Driver + Secondary: Tour Guide same pattern (when configured)
- Secondary roles survive drawer close/reopen and reload (override store persists)
- Roster card + talent dashboard surface the multi-role identity

## Phase A — Unified frontend field catalog (DONE)

### What

Two parallel systems (`FIELD_CATALOG` + `TAXONOMY_FIELDS`) became one source of truth from the consumer's POV. Both physically exist (storage convenience), but every consumer reads through one set of lookups.

### Where

- `web/src/app/prototypes/admin-shell/_field-catalog.ts`
  - `FieldCatalogEntry` extended with rendering metadata (`kind`, `placeholder`, `helper`, `options`, `subsection`, `optional`, `order`) plus mode flags (`showInRegistration`, `showInEditDrawer`, `showInPublic`, `showInDirectory`, `adminOnly`, `talentEditable`, `requiresReviewOnChange`, `recommendedFor`)
  - `deriveTypeFields()` reads `TAXONOMY_FIELDS` and projects every entry into the catalog with `appliesTo: [parentId]`
  - `FIELD_CATALOG = [...HARDCODED_FIELDS, ...DERIVED_TYPE_FIELDS]` — one public read surface
  - New helpers: `getDynamicFieldsForType(parentId | parentIds)`, `fieldsForMode(mode, parentId)`, `searchableFields()`

- `web/src/app/prototypes/admin-shell/_drawers.tsx`
  - Drawer's `dynamicGroups` reads from `getDynamicFieldsForType()` (was `TAXONOMY_FIELDS[pid]`)
  - Wizard's `dynamicFields` same source
  - `canStep5` validation reads `isRequiredForType` from the catalog (catalog wins, schema flag is fallback)

### Acceptance

- No field can disagree between the wizard and edit drawer (one source decides required/optional)
- Adding a `searchable: true` to a catalog entry surfaces a chip in `CatalogFilterStrip` automatically
- Physical / wardrobe / music / chef / driver / travel / wellness / performer fields all flow through the same engine

## Phase D — Database-backed Master Catalog (LIVE on hosted Supabase)

### What

The frontend catalog landed in the database. Phase D commits the migrations + seed generator + read service AND applies them to the hosted project (`pluhdapdnuiulvxmyspd`). Verified live counts:

- `profile_field_definitions`: **179 rows** (universal: 11, global: 22, type-specific: 146)
- `profile_field_recommendations`: **171 rows** (165 applies, 6 required)
- 12 fields tagged `is_searchable`

Detailed runbook: `web/docs/admin-prototype/MASTER_FIELD_CATALOG.md`. Summary:

### Migrations added

| File | Purpose |
|---|---|
| `supabase/migrations/20260901120000_profile_field_definitions.sql` | The catalog table — every field with tier/section/kind/options/visibility/mode-flags/permissions. RLS: read public, write platform-staff only. |
| `supabase/migrations/20260901120100_profile_field_recommendations.sql` | Field × talent-type relationships (`applies` / `required` / `recommended`). Joins to `taxonomy_terms`. |
| `supabase/migrations/20260901120200_workspace_profile_field_settings.sql` | Per-tenant overrides — sparse, every catalog mode flag has an `*_override` column plus `custom_label`/`custom_helper`/`display_order_override`/`default_visibility_override`. |
| `supabase/migrations/20260901120300_talent_profile_field_values.sql` | Per-talent values for type-specific fields. JSONB `value`, per-field `visibility_override`, `workflow_state` for review-required fields. RLS gates public reads through workflow + visibility. |
| `supabase/migrations/20260901120400_seed_profile_field_catalog.sql` | **Auto-generated.** 182 field definitions + 174 recommendation rows. Idempotent via `ON CONFLICT (field_key) DO UPDATE`. 9,033 lines. |

### Tooling added

- `scripts/generate-profile-field-catalog-seed.mjs` — reads the prototype's `_field-catalog.ts` + `_state.tsx::TAXONOMY_FIELDS` as text, parses the array literals, emits the seed SQL. Re-run after editing the prototype catalog. Should be wired to a CI hook to fail PRs that don't regenerate the seed.
- `web/src/lib/profile-fields-service.ts` — DB read API: `loadFieldCatalog()`, `loadFieldsForType()`, `loadFieldsForMode()`, `getTalentFieldValues()`, `isRequiredForType()`, `computeProfileCompleteness()`. Workspace overrides merge transparently when a `tenantId` is supplied.

### What stays as structured systems (not field values)

Per the Phase D charter, these systems stay as their own first-class tables. The field catalog covers configurable per-type details only.

| System | Table | Why first-class |
|---|---|---|
| Talent types (primary/secondary roles) | `taxonomy_terms` + `talent_profile_taxonomy.relationship_type` | Cross-cutting search, hierarchy, multi-tenant config |
| Location & service areas | `talent_service_areas` | Distance queries, structured radius/fee model |
| Languages | `talent_languages` | Speaking/reading/writing levels, can-host/sell/translate flags |
| Skills + contexts | `taxonomy_terms` + `talent_profile_taxonomy` | Same taxonomy substrate as types |
| Media (photos, video) | Existing media/gallery tables | Storage, EXIF, derivatives |
| Approval / status / visibility | `talent_profiles.workflow_status` + `visibility` | Profile-level lifecycle, not per-field |

## Phase E — Workspace Field Settings UI (DONE in prototype, mock-backed)

### What

Agency admins now control which platform fields are required, public, talent-editable, hidden, custom-labelled, etc. — from a settings drawer accessible at **Settings → Workspace field settings**. The talent edit drawer + registration wizard respond to changes immediately.

The prototype backs the writes with a localStorage-persisted module store (`__workspaceOverrides` keyed by tenant id). The DB shape it mirrors is `workspace_profile_field_settings` (Phase D migration `20260901120200_*.sql`). Production cutover swaps the store for `web/src/lib/profile-fields-service.ts::loadFieldCatalog({ tenantId })` — the merge logic is identical.

### Where

- `web/src/app/prototypes/admin-shell/_field-catalog.ts`
  - `WorkspaceFieldOverride` type — every catalog mode flag gets an optional `*?` field; matches `workspace_profile_field_settings` columns 1:1
  - Module store: `__workspaceOverrides: Record<tenantId, Record<fieldKey, WorkspaceFieldOverride>>`
  - localStorage persistence: `tulala.proto.workspaceFieldOverrides`
  - `setWorkspaceFieldOverride(tenantId, fieldKey, patch)` — sparse merge, drops empty rows
  - `clearWorkspaceFieldOverride(tenantId, fieldKey)` — reset one field
  - `getWorkspaceFieldOverrides(tenantId)` — all overrides for a tenant
  - `subscribeWorkspaceFieldOverride(fn)` + `useWorkspaceFieldOverrideSubscription()` hook
  - `applyWorkspaceFieldOverride(entry, tenantId)` — merge a catalog entry; universal-tier always returns `enabled: true`
  - `resolvedCatalogFor(tenantId)` + `resolvedFieldsForMode(mode, tenantId, parentId)` — mode-aware merged reads
  - `countWorkspaceOverrides(tenantId)`
  - `PROTO_TENANT_ID = "tenant.acme-models"` — single demo tenant for the prototype

- `web/src/app/prototypes/admin-shell/_drawers.tsx`
  - `WorkspaceFieldSettingsDrawer` — write surface
    - Search + tier filter chips (All / Universal / Global / Type-specific)
    - Tier-explainer band (universal can't be disabled, global + type-specific are configurable)
    - Field rows grouped by `section` mirroring the edit drawer's accordion structure
    - Each row collapsible → reveals 8 toggles + custom label/helper inputs + "Reset to platform default"
    - Footer: "X overrides active" + "Reset all" + "Done"
  - `WorkspaceFieldSettingRow` — collapsible row with override badges
  - `SettingToggleRow` — pill toggle with "OVERRIDDEN" indicator when an override is active
  - `RequiredPill` updated to consult workspace overrides + subscribe to changes
  - Drawer dispatcher routes `"workspace-field-settings"` → the new drawer

- `web/src/app/prototypes/admin-shell/_state.tsx`
  - Added `"workspace-field-settings"` to the `DrawerKind` union

- `web/src/app/prototypes/admin-shell/_pages.tsx`
  - Added a `<SettingsRow onClick={() => openDrawer("workspace-field-settings")}>` next to the existing "Field catalog" row in the workspace settings page

### How an override flows through

1. Admin opens **Settings → Workspace field settings**.
2. Toggles "Required to publish" on a field → `setWorkspaceFieldOverride(PROTO_TENANT_ID, fieldKey, { required: true })`.
3. Subscriber re-renders; the row's REQUIRED pill switches.
4. localStorage updated; survives drawer close + reload.
5. Anyone opening the talent edit drawer immediately sees that field rendered with REQUIRED — `RequiredPill` consults the override before reading the catalog default.
6. Same for `customLabel`, `customHelper`, `enabled` (hides field), `showInRegistration`, `showInPublic`, etc. Every catalog flag is overridable.

### What overrides are wired through end-to-end (today)

**Wired:**
- `required` — REQUIRED/OPTIONAL pill in the edit drawer + wizard pulls from override

**Schema in place but not yet read by every surface:**
- `enabled` — universal fields ignore (enforced in merge); other surfaces will hide field when `enabled=false` once they switch from `getDynamicFieldsForType()` to `resolvedFieldsForMode()`
- `customLabel` / `customHelper` — schema in place; the drawer's hand-coded `<FieldRow label="...">` blocks need a small refactor to read merged label
- `showInRegistration` / `showInEditDrawer` / `showInPublic` / `showInDirectory` — `resolvedFieldsForMode()` honors them; surfaces that still call the legacy helpers don't
- `talentEditable` / `adminOnly` — schema in place; not yet enforced in the renderer (falls under the existing field-locks mechanism)
- `requiresReviewOnChange` — flag carried through; the existing pending-review queue already handles per-profile gating, not yet per-field

This is intentional for Phase E. The store + UI + RequiredPill prove the loop works; per-surface migration to `resolvedFieldsForMode()` is mechanical follow-up.

### Acceptance

- Open **Settings → Workspace field settings** → toggle required on `models.height`.
- Open Marta's profile → Profile Details accordion → height field renders with REQUIRED pill.
- Toggle required off → re-renders as OPTIONAL.
- Custom label "Stature" → renders in the row's title + persists across reload.
- Reset all → clears overrides, fields return to platform defaults.

### Path to access in the prototype

`/prototypes/admin-shell` → log in as workspace admin (Acme Models) → top nav **Settings** → scroll to "Workspace field settings" row → click "Configure". Drawer slides in from the right.

## Phase F — Per-surface override consumption + filters + public preview + backfill (DONE)

### What

Phase E shipped the override store + UI + the REQUIRED pill in the edit drawer. Phase F closes the remaining loops:

1. **F1 — `customLabel` / `customHelper` flow through every FieldRow.** Hand-coded identity fields (legalName, dob, nationality, homeCountry, responseTime) now accept a `catalogId` prop; FieldRow merges the catalog entry with the workspace override at render. Setting a custom label in **Settings → Workspace field settings** instantly relabels the field in the edit drawer.
2. **F2 — Functional roster filters.** `CatalogFilterStrip` now opens a multi-select popover per searchable field. Values come from the canonical profile records (`TALENT_PROFILES_BY_ID`); the roster's filter pipeline reads `catalogFilters` state and excludes talents whose value isn't in the selected set. Adds a per-chip count badge + a "Clear all" affordance.
3. **F3 — Visibility-aware public preview.** `ViewAsClientModal` (the "view as client" admin preview) now consults catalog visibility before rendering each field. Hide tagline / bio / languages / location with workspace overrides → those rows disappear from the preview immediately. Subscribes to override changes via `useWorkspaceFieldOverrideSubscription` so the modal re-renders without remount.
4. **F4 — dynFields backfill script.** `scripts/backfill-talent-field-values.mjs` reads a snapshot JSON of `dynFields + dynFieldVisibility` per talent and emits idempotent `INSERT … ON CONFLICT DO UPDATE` SQL into `talent_profile_field_values`. Resolves each short id (`height`, `bust`) to the catalog field key (`models.height`, `models.bust`) by trying `<primary>.<id>` then `<secondary>.<id>` then a top-level catalog match. `--dry-run` for SQL output, `--apply` for direct execution via the Management API helper.
5. **F5 — D-cutover.** All four schema migrations + the seed applied to hosted Supabase via `scripts/_pg-via-mgmt-api.mjs`. Discovered + fixed two generator bugs along the way:
   - The TAXONOMY_FIELDS parser walked the body greedily and matched `defaultVisibility: [` as if it were a parent name, emitting a junk `defaultVisibility.undefined` row. Replaced the regex pass with a depth-aware walk that only picks up `<word>: [` at depth 0.
   - The recommendations join used the prototype's short slugs (`hosts`, `music`) but production `taxonomy_terms` uses longer canonical slugs (`hosts-promo`, `music-djs`). Added `PARENT_SLUG_MAP` to the generator. Recommendations went from 78 (broken) to 171 (correct) after the fix.

### Where

- `web/src/app/prototypes/admin-shell/_primitives.tsx::FieldRow` — accepts `catalogId?: string`, calls `applyWorkspaceFieldOverride` to honor `customLabel` / `customHelper` / `enabled`. Subscribes via `useWorkspaceFieldOverrideSubscription`.
- `web/src/app/prototypes/admin-shell/_drawers.tsx::IdentityEditor` — 5 FieldRow callsites threaded with `catalogId` (`identity.legalName`, `identity.dob`, `identity.nationality`, `identity.homeCountry`, `identity.responseTime`).
- `web/src/app/prototypes/admin-shell/_drawers.tsx::ViewAsClientModal` — visibility helper `isPublic(catalogId, fallback)` consults catalog default + workspace override; render blocks for tagline / location / secondary roles / bio / languages now guard on it.
- `web/src/app/prototypes/admin-shell/_pages.tsx::CatalogFilterStrip` — rewrites the popover to a multi-select on distinct values pulled from `TALENT_PROFILES_BY_ID` via the new `readTalentValuesForFilter()` helper. New `catalogFilters` state lives on `TalentPage`; filter pipeline gets a new step that excludes rows whose values don't intersect the selected set.
- `web/src/app/prototypes/admin-shell/_pages.tsx::RosterFilterBar` — accepts new props `roster`, `catalogFilters`, `onCatalogFilters` and threads to the strip.
- `scripts/backfill-talent-field-values.mjs` — new file. Reads snapshot JSON; emits SQL.
- `scripts/generate-profile-field-catalog-seed.mjs` — depth-aware parser + `PARENT_SLUG_MAP`.
- `supabase/migrations/20260901120400_seed_profile_field_catalog.sql` — regenerated; junk row gone; 179 def + 171 rec rows.

### Live DB verification (run anytime)

```bash
node -e '
import("./scripts/_pg-via-mgmt-api.mjs").then(async ({ runSql }) => {
  console.log(await runSql("SELECT count(*) FROM public.profile_field_definitions"));
  console.log(await runSql("SELECT count(*) FROM public.profile_field_recommendations"));
  console.log(await runSql("SELECT relationship, count(*) FROM public.profile_field_recommendations GROUP BY relationship"));
});
'
# Expected:
# Definitions: 179
# Recommendations: 171  (165 applies + 6 required)
```

### Acceptance

- **F1**: change "Legal name" → "Full legal name" in **Settings → Workspace field settings → identity.legalName → Custom label** → open Marta's drawer → Identity section now reads "Full legal name". Reload — persists.
- **F1 disabled**: toggle off "Enable for your workspace" on `identity.dob` → DOB field disappears from the drawer entirely. Re-enable → returns.
- **F2**: roster page → "Hub filters" row → click **Hair color** → popover lists `Black`, `Brown`, `Blonde` (distinct values across the canonical profiles) → tick `Black` → roster narrows to talents whose canonical hair color is Black. Counter chip shows "1".
- **F3**: open Marta's profile → "Preview as client" → verify she shows tagline + bio + location. In settings, toggle off "Show on public profile" for `bios` → re-open the preview → bio block disappears.
- **F4**: `node scripts/backfill-talent-field-values.mjs --source /tmp/dynFields-snapshot.json` produces SQL that resolves short ids to compound catalog keys + ON-CONFLICT updates the value column.
- **F5**: hosted Supabase has 179 / 171 rows; RLS denies non-staff writes to `profile_field_definitions`.

## Phase G — Three-surface alignment (DONE)

### What

Audit found the three creation/editing surfaces (registration wizard, admin "Add talent" drawer, profile shell edit drawer) had drifted apart: different field names, different required-field rules, different validation messages, workspace overrides flowing only through the edit drawer, and a wide visibility chip strip eating vertical space on every sensitive field. Phase G aligns them.

### Six fixes

**B1a — Visibility chip redesign.** The wide `[VISIBLE TO 🌐 Public 🏢 Agency 🔒 Private]` row replaced with a single compact pill at the top-right of the field label. Pill shows summary state (`🌐 PUBLIC`, `🏢 AGENCY ONLY`, `🌐 PUBLIC + AGENCY`, `🔒 PRIVATE`); click opens a popover with the 3 toggles. Saves ~85% of the per-field vertical footprint. Pattern matches Notion/Linear/Figma privacy controls. The popover closes on outside-click.

**A2 — Wizard reads `resolvedFieldsForMode`.** Step 5 ("Profile details") now sources fields from `resolvedFieldsForMode("registration", PROTO_TENANT_ID, parentId)` instead of `getDynamicFieldsForType()`. Workspace overrides apply: a field marked "required for our roster" in **Settings → Workspace field settings** instantly gates the wizard. A field with `enabled=false` drops from the wizard entirely. Plus per-parent ranking by `recommendedFor` so the most useful fields surface first.

**A3 — Unified `validateField` helper.** New `validateField(field, value, parentTypes, tenantId)` in `_field-catalog.ts`. Returns `{ ok: true } | { ok: false, code, message }`. Considers workspace overrides + tier + `requiredFor` + `countMin`. Same helper now powers the wizard's `canStep5` gate; the edit drawer's `missing[]` and the add-new drawer can adopt it incrementally without changing copy. Plus a `validateProfile(values, parentTypes, tenantId)` convenience that returns a failure map for "show me everything wrong with this profile."

**A4 + A5 — Add-new drawer reads catalog.** NewTalentDrawer now shows a "What's collected next" peek section after primary type is picked. Pulls fields from `resolvedFieldsForMode("registration", PROTO_TENANT_ID, [primary, ...secondaries])`, filters to type-specific entries, splits into Required + Recommended, and renders chips for the top 12 + 8 respectively (with "+N more"). Admin sees the cost of the choice they just made before committing. Workspace overrides apply.

**A6 — Multi-role secondary picker on Add-new.** New "Secondary talent types" section appears once a primary is selected. Multi-select chips for OTHER parent categories (excludes the primary's own parent). Selected secondaries flow through `seedForShell()` → `payload.seed.secondaryTypes` → `ProfileShellPayload` → edit drawer's `state.secondaryTypes`. So a talent created as Model + Host arrives at the edit drawer already multi-role; roster card + dashboard reflect it on first save.

**A1 — Canonical field names verified (no work needed).** Audit overstated the gap: `ProfileDraft` (the shared store at `_profile-store.ts`) is already canonical (`firstName/lastName/displayName`, `homeBase`, `primaryType/secondaryTypes`, `serviceArea`, `languages`, `fields`, etc.). Local React state in each component uses whatever names suit it (`stageName` in the wizard, `firstName + lastName` in QuickAdd) but writes through to the canonical store keys. Edit drawer reads canonical via `payload.seed`. Verified end-to-end — round-trip works.

### Where

- `web/src/app/prototypes/admin-shell/_primitives.tsx::ChannelVisibilityStrip` — rewritten to a compact pill + popover. Same `value` + `onChange` API. Outside-click closes via `useEffect` listener. The pill renders inline at the field's label row; FieldRow updated to host it top-right.
- `web/src/app/prototypes/admin-shell/_drawers.tsx::TalentRegistrationDrawer`
  - Step 5 dynamic-fields source switched to `resolvedFieldsForMode`
  - `canStep5` rewritten to use `validateField` per field
  - Per-parent ranking: required → recommendedFor → display order
- `web/src/app/prototypes/admin-shell/_drawers.tsx::NewTalentDrawer`
  - New `secondaryTypes` state (multi-select chip strip)
  - `seedForShell()` returns `secondaryTypes`
  - New "Secondary talent types" Section after Primary
  - New "What's collected next" Section reading `resolvedFieldsForMode`
- `web/src/app/prototypes/admin-shell/_field-catalog.ts`
  - New `validateField(field, value, parentTypes, tenantId): FieldValidationResult`
  - New `validateProfile(values, parentTypes, tenantId): Record<fieldId, failure>`

### Acceptance

- **B1a**: open Marta's edit drawer → Identity section → pronouns row → no more wide "VISIBLE TO Public Agency Private" row. Top-right of the label shows a small `🌐 PUBLIC + AGENCY` pill. Click → popover with 3 toggles. Outside-click closes.
- **A2**: open **Settings → Workspace field settings** → toggle `models.bust` from optional to required → open registration wizard for a model talent → step 5 now refuses to advance until bust is filled.
- **A3**: same wizard step → error message says "Bust is required." (catalog-driven copy). Same field in edit drawer now shows REQUIRED pill. Same source.
- **A4 + A5**: open Add-new drawer → pick primary type "Fashion model" → "What's collected next" section appears with `Required (5)` + `Recommended (8)` chips. Pick secondary type "Hosts" → required list grows.
- **A6**: same flow → "Secondary talent types" Section visible after primary pick. Tick "Hosts" → "Create + open full profile" → drawer opens with `state.secondaryTypes = ["hosts"]` already set; PageHeader subtitle reads "Model · also Host …".
- **A1**: create a talent through the wizard → admin opens the same talent in the edit drawer → all the wizard's fields (stageName → identity.stageName, city → serviceArea.homeBase, languages, dynFields) populated. No translation gaps.

## Phase H — Website page (DONE)

### What

Audit found the prototype workspace had no top-level surface for an agency to manage their public website. Site-related controls were scattered across Settings tier-cards, half of them stub drawers with no edit affordance (Pages drawer listed 5 hardcoded pages, click did nothing). The real page builder existed at `web/src/app/(dashboard)/admin/site-settings/pages/page-editor.tsx` but the prototype workspace didn't link to it.

Phase H adds **Website** as a first-class top-nav workspace page, premium 2026 design, consolidating everything an agency website admin needs in one surface.

### Twelve sections

1. **Premium hero band** (gradient + accent shimmer) — primary domain URL with copy button, status indicator (Live / Maintenance / Setting up), 4-stat row (pages live, posts, redirects, scheduled), banner-active marker. Visits stat moved into Performance.
2. **Performance** (added in audit pass) — consolidated traffic + funnel + commercial dashboard with **7-day / 30-day toggle**. Four KPI tiles (Visits / Inquiries / Bookings / Booking revenue) each showing the period total and a `↑ N% vs prior` delta; revenue tile uses the forest accent. Funnel strip in indigo (Visits → Inquiries → Bookings) with visit→inquiry % and inquiry→booking % between steps, plus an "Overall conversion" footer (`bookings / visits`). Top performing pages mini-table — top 4 by traffic with per-page visits / inquiries / bookings / conversion-rate, conversion ≥ 0.5% colored green
3. **Pages** — full table with title/slug, last-edited timestamp + author, hits 7d, status chip (Live / Draft / Scheduled), per-row Edit + Publish/Unpublish actions, "+ New page" button
4. **Posts / blog** — same shape as Pages, scheduled per-post; tier-gated to Agency plan with upgrade chip if not on tier
5. **301 Redirects** — full table with from/to (monospace + arrow), status code chip (301/302/307/308 in distinct colors), match mode (exact/prefix/regex), hits 7d, pause/resume + delete actions, hits-by-rule visible at a glance
6. **Navigation & footer** — header menu summary + footer column summary, edit affordance per
7. **Custom code** — CSS textarea (injected `<head>`) + JS block list with per-block label, placement picker (`<head>` / `<body>` start / `<body>` end), enabled toggle, "Add script" button. Tier-gated to Agency. Warning chip "Care required — broken code breaks the live site"
8. **Tracking & analytics** — input cards for GA4, Plausible, Meta Pixel, GTM, Hotjar, LinkedIn Insight; each becomes "ACTIVE" when filled. Plus cookie consent radio (off / essential / geo-aware EU+UK)
9. **SEO defaults** — site title, title template (`%s — Atelier Roma`), meta description, OG image, Twitter handle, canonical domain, robots mode (indexable / noindex-nofollow / private), sitemap toggle
10. **Domain & SSL** — primary domain + SSL status + renewal countdown, DNS records table (A / CNAME / TXT) with matched/mismatch indicators, alternate domains chip strip, www-redirect toggle, "Manage domain" affordance
11. **Maintenance mode** — toggle + custom message + bypass token (admin shares the URL to preview while public is in maintenance), copy-token button. Border + textarea tint amber when enabled
12. **Site-wide announcement banner** — toggle + live preview + text + CTA label/href + audience filter (all / clients / talent) + tone palette (neutral / info / success / warning) — visual swatch picker for tone

### Performance — production wiring map

The `WebsiteAnalytics` shape is what ships to the Performance section. Production rolls each field up from existing event/inquiry/booking tables:

- `analytics.last7d.visits` / `last30d.visits` — `count(*) from agency_event_log where event = 'page.view' and tenant_id = ? and ts > now() - interval '7d'` (similarly 30d). The `prior` window of the same length feeds the delta.
- `analytics.last7d.inquiries` / `last30d.inquiries` — `count(*) from inquiries where workspace_id = ? and created_at > now() - interval '7d'`. `prior` is the same query shifted back one window.
- `analytics.last7d.bookings` / `last30d.bookings` — `count(*) from bookings where workspace_id = ? and created_at > now() - interval '7d'`. Drives the inquiry→booking funnel step.
- `analytics.last7d.revenue` / `last30d.revenue` — `sum(booking.total_amount) from bookings where workspace_id = ? and confirmed_at > now() - interval '7d'`. Currency follows the workspace's billing currency (EUR for Atelier Roma).
- `analytics.byPage7d[]` / `byPage30d[]` — `agency_event_log` joined to `inquiries.source_page_id` (visit→inquiry attribution) joined to `bookings.inquiry_id` (inquiry→booking attribution), grouped by `pageId`. Last-touch attribution: the page that owned the visit when the inquiry was created gets the credit.
- `analytics.refreshedAt` — last time the rollup ran. Drive a cron at ~hourly cadence; the UI shows `relativeTime(refreshedAt)` in the Performance header.

### Where

- `web/src/app/prototypes/admin-shell/_state.tsx`
  - Added 12 new types: `WebsitePageRow`, `WebsitePost`, `WebsiteRedirect`, `WebsiteCustomCode`, `WebsiteTrackingCodes`, `WebsiteSeoDefaults`, `WebsiteDomainStatus`, `WebsiteMaintenance`, `WebsiteAnnouncement`, `WebsitePeriodMetrics`, `WebsitePageMetrics`, `WebsiteAnalytics`, `WebsiteState`
  - Added `WEBSITE_STATE` fixture seeded for Atelier Roma (6 pages, 5 posts, 5 redirects, 2 JS blocks, 6 tracking IDs, 3 DNS records, active announcement, 7d + 30d analytics with prior periods + per-page conversion)
  - Added `"website"` to `WorkspacePage` union + `WORKSPACE_PAGES` array (between Production and Settings)
  - `resolveWorkspacePage()` legacy alias `site → website` (was `site → settings`)
  - Added `PAGE_META.website = { label: "Website", icon: "globe", description: "Pages, posts, redirects, custom code, tracking, SEO, domain" }`

- `web/src/app/prototypes/admin-shell/_pages.tsx`
  - New `WebsitePage()` component (~400 lines) + 15 sub-components:
    - `WebsiteHero` — premium gradient banner with stats
    - `WebsitePerformance` — consolidated traffic+funnel+commercial dashboard with 7d/30d toggle (added in audit pass)
    - `PeriodToggle` — pill toggle (7 days / 30 days)
    - `KpiTile` — four-tile KPI block; auto-computes delta from `current` vs `prior`; tone shifts to green/red/dim by sign and magnitude (flat threshold = 0.5%)
    - `FunnelStep`, `FunnelArrow` — indigo funnel strip primitives
    - `WebsiteSection` — wrapper with title/sub/count/action/upgradeBadge/warningBadge
    - `WebsitePagesList`, `WebsitePostsList` — table-like rows
    - `PageStatusChip` — Live/Draft/Scheduled pill
    - `WebsiteRedirectsTable` — from/to table with code chip + actions
    - `WebsiteNavSummary` — header + footer summary cards
    - `WebsiteCustomCodePanel` — CSS textarea + JS block editor
    - `WebsiteTrackingPanel` — 6 tracking inputs + cookie consent
    - `WebsiteSeoPanel`, `SeoInput` — SEO defaults form
    - `WebsiteDomainPanel` — DNS records + alternates
    - `WebsiteMaintenancePanel` — toggle + message + bypass token
    - `WebsiteAnnouncementPanel` — banner editor with live preview
  - Workspace page switch dispatches `case "website"` → `<WebsitePage />`; legacy `case "site"` also routes there

### Acceptance

- Open `/prototypes/admin-shell` → top nav now shows **Website** between Production and Settings.
- Click Website → premium gradient hero loads with `https://atelier-roma.com` URL (copy button), 4 stats (4 pages live · 4 posts · 4 redirects · 1 scheduled), green "Live" indicator.
- **Performance section** (right below hero): 7-day toggle is active by default. Tiles show 4,730 visits (↑ 14.0% vs 4,148) · 23 inquiries (↑ 27.8% vs 18) · 6 bookings (↑ 50.0% vs 4) · €14,500 revenue (↑ 32.1% vs €10,980). Funnel: 4,730 → 0.49% → 23 → 26.09% → 6. Overall conversion: 0.13%. Top pages: Roster 0.33% (green, beats site avg), About us 0.24% (green), Home 0.05% (indigo), Contact 0% (dim). Switch to 30 days → all numbers + deltas re-compute against the 30d window. Conversion-rate cell is colored **relative to the site's overall conversion** — pages above average go green, pages with traffic but below average go indigo, pages with zero bookings go dim.
- **Pages section**: table of 6 pages with hits + status chips. Click any row title → "Opening … in page builder" toast (production: routes to `/admin/site-settings/pages/[id]`).
- **Posts section**: 5 blog posts. On Free plan, tier-gated chip appears.
- **301 Redirects**: 5 rules visible. Click pause/resume → row dims/un-dims. Click delete → row removes.
- **Custom code**: CSS textarea editable; JS block list with placement select + enabled toggle. On Free plan, lock card overlay with "See plans" button.
- **Tracking & analytics**: 6 input cards. Filling GA4 ID makes the card border green + ACTIVE chip.
- **SEO defaults**: 8 inputs + robots mode dropdown + sitemap toggle.
- **Domain & SSL**: DNS records table with matched indicators. Alternate domains as chips.
- **Maintenance mode**: toggle off by default. Toggle on → border tints amber, message textarea highlights. Copy-token button works.
- **Announcement banner**: live preview in selected tone. Audience + tone editable.

### What's deferred for Phase H

- Drawer for **adding a new redirect** (the "+ Add redirect" button just toasts today — production: opens an inline modal with from/to/match-mode inputs)
- Drawer for **domain management** (DNS instructions, SSL renewal, alternate-domain provisioning)
- **Linking the "Open page builder" + page-row clicks to the real `/admin/site-settings/pages/[id]` route** — today they toast. Should be `<Link>` or `router.push()`. One-line fix per callsite.
- **Bulk redirect import** from CSV (a common need when migrating from another CMS)
- **Site-wide search** for pages/posts (the lists aren't filterable yet)
- **Page builder integration** — the workspace surface lists pages, but actual content editing happens in the real CMS at `/admin/site-settings/pages/page-editor.tsx`. Phase H is the operations console; the page builder is the editor.

## Files changed this session

### Frontend (prototype)

```
web/src/app/prototypes/admin-shell/_state.tsx              (+~950 lines — incl. Phase H types + WEBSITE_STATE fixture)
web/src/app/prototypes/admin-shell/_field-catalog.ts       (~930 lines — Phase A unification + E workspace overrides + G validateField)
web/src/app/prototypes/admin-shell/_drawers.tsx            (~2300 lines added/changed — incl. Phase G wizard catalog read + add-new secondaries + add-new catalog peek)
web/src/app/prototypes/admin-shell/_talent.tsx             (~850 lines added/changed)
web/src/app/prototypes/admin-shell/_pages.tsx              (~1100 lines added/changed — Phase F2 functional roster filters + Phase H WebsitePage + 11 sub-components)
web/src/app/prototypes/admin-shell/_primitives.tsx         (FieldRow accepts catalogId + Phase G visibility chip redesign)
```

### Database (LIVE on hosted Supabase + seeded)

```
supabase/migrations/20260901120000_profile_field_definitions.sql        # APPLIED
supabase/migrations/20260901120100_profile_field_recommendations.sql    # APPLIED
supabase/migrations/20260901120200_workspace_profile_field_settings.sql # APPLIED
supabase/migrations/20260901120300_talent_profile_field_values.sql      # APPLIED
supabase/migrations/20260901120400_seed_profile_field_catalog.sql       # APPLIED (179 def + 171 rec)
```

### Tooling + service + docs

```
scripts/generate-profile-field-catalog-seed.mjs           # Phase D seed generator (depth-aware parser + slug map)
scripts/backfill-talent-field-values.mjs                  # Phase F4 — dynFields → talent_profile_field_values
web/src/lib/profile-fields-service.ts                     # Phase D read service
web/docs/admin-prototype/MASTER_FIELD_CATALOG.md          # Phase D-specific runbook
web/docs/admin-prototype/PROFILE_FIELD_ENGINE.md          # this file
```

## Source of truth (today)

| Concern | Authority |
|---|---|
| Field catalog (universal/global/type-specific definitions, kinds, options, visibility, mode flags) | `web/src/app/prototypes/admin-shell/_field-catalog.ts` (`FIELD_CATALOG` + helpers) |
| Per-talent profile records | `web/src/app/prototypes/admin-shell/_state.tsx` (`TALENT_PROFILES_BY_ID`) |
| Type-specific authoring storage | `web/src/app/prototypes/admin-shell/_state.tsx` (`TAXONOMY_FIELDS`) — projected into catalog at module load |
| Edit drawer | `_drawers.tsx::TalentProfileShellDrawer` |
| Registration wizard | `_drawers.tsx::TalentRegistrationDrawer` |
| Talent dashboard | `_talent.tsx::MyProfilePage` / `ProfileHero` / `AllSectionsGrid` |
| Roster + filter chips | `_pages.tsx::RosterCard` / `RosterRow` / `CatalogFilterStrip` |
| DB schema (LIVE on hosted Supabase) | `supabase/migrations/20260901120000..120400_*.sql` — applied during this session |
| DB read API (ready, not wired) | `web/src/lib/profile-fields-service.ts` |
| Override store (per-talent in-session edits) | `_state.tsx::__profileOverrides` (localStorage `tulala.proto.profileOverrides`) |
| Pending review queue (self-edit submissions) | `_state.tsx::__pendingReviews` (localStorage `tulala.proto.pendingReviews`) |
| Workspace field settings (Phase E) | `_field-catalog.ts::__workspaceOverrides` (localStorage `tulala.proto.workspaceFieldOverrides`) |
| Workspace field settings UI | `_drawers.tsx::WorkspaceFieldSettingsDrawer` |
| **DB catalog (LIVE)** | `profile_field_definitions` + `profile_field_recommendations` on hosted Supabase (`pluhdapdnuiulvxmyspd`) |
| **DB read service** | `web/src/lib/profile-fields-service.ts` — `loadFieldCatalog()`, `loadFieldsForType()`, etc. |
| Roster catalog filters | `_pages.tsx::CatalogFilterStrip` — multi-select popovers + `readTalentValuesForFilter()` projector |
| Public profile preview | `_drawers.tsx::ViewAsClientModal` — visibility-gated render |
| **Website management** (Phase H) | `_pages.tsx::WebsitePage` — top-nav surface with 11 sections (pages / posts / redirects / nav / custom code / tracking / SEO / domain / maintenance / announcement) |
| **Website state fixture** | `_state.tsx::WEBSITE_STATE` — seeded for Atelier Roma (6 pages, 5 posts, 5 redirects, custom CSS+JS, 6 tracking IDs, full SEO/domain/maintenance/announcement) |
| **Field validation** (Phase G) | `_field-catalog.ts::validateField` + `validateProfile` — catalog-driven, workspace overrides applied |
| **Visibility chip primitive** (Phase G) | `_primitives.tsx::ChannelVisibilityStrip` — compact pill + popover (was wide row) |
| **Add-new secondary picker** (Phase G) | `_drawers.tsx::NewTalentDrawer` — multi-role secondaries chip strip |
| **Add-new "what's collected next" peek** (Phase G) | `_drawers.tsx::NewTalentDrawer` — `resolvedFieldsForMode` driven |

## How each flow reads fields

| Flow | Field source |
|---|---|
| Agency Add Talent (create mode) | Hand-coded universal sections + (Phase G) `resolvedFieldsForMode("registration", parentIds)` peek showing required + recommended fields. Multi-role secondaries supported. |
| Agency Edit Talent | Loads canonical profile via `getProfileById(talentId)`. Round-trips through `setProfileOverride` keyed by talent id. Sections + REQUIRED pill consult workspace overrides. |
| Talent Registration (wizard) | (Phase G) `resolvedFieldsForMode("registration", PROTO_TENANT_ID, parentId)` per selected parent. Sort: required → recommendedFor → display order. `canStep5` uses `validateField` (single source). |
| Talent Self-Edit | Same drawer as Agency Edit. `mode: "edit-self"`, `talentId: "t1"`. `finalSubmit` writes through override store + adds to `pendingReviews` queue. |
| Roster card (workspace) | `TALENT_PROFILES_BY_ID[id]` → `computeProfileCompleteness` for live percent; `secondaryTypes` chip strip |
| Talent Dashboard | `applyProfileOverride("t1", getProfileById("t1"))` + tier breakdown + role summary in PageHeader |
| Catalog filter chips (roster) | `searchableFields()` from FIELD_CATALOG |
| Profile-completeness math | `computeProfileCompleteness(profile, [primary, ...secondary])` |

## Admin add/edit vs. talent self-edit — the same engine

Same field catalog, same drawer shell, same hydration. Differences:

- **Mode flag** (`payload.mode`): `"create"`, `"edit-admin"`, `"edit-self"` controls header copy. Field catalog entries can carry `adminOnly: true` to hide from `edit-self` (flag exists in shape; not yet enforced in render).
- **Round-trip behavior**: self-edit submits push to `pendingReviews` queue (admin sees "review me"); admin re-publish clears the queue.
- **Field locks**: `state.fieldLocks[]` + `state.fieldLockReasons` — admin can lock fields to block self-edits; locks are per-field path (e.g. `identity.legalName`, `rates`).
- **Visibility chips**: editable in both modes — talent controls per-field privacy.

## Type-check

`exit 0` excluding 3 pre-existing errors in `_messages.tsx` (Property 'seen' does not exist on type 'RichInquiry') — confirmed via `git stash` isolation test, unrelated to this work.

```
cd web && npx tsc --noEmit 2>&1 | grep -v "_messages\|.next/dev"
# expected: empty + exit 0
```

## What's deferred (post-Phase G)

- **Frontend reads from DB** — the schema + 179 catalog rows are LIVE on hosted Supabase, but the prototype frontend still reads from the constants in `_field-catalog.ts`. Cutover is per-surface using `web/src/lib/profile-fields-service.ts::loadFieldCatalog({ tenantId })`. Suggested first surface: roster card's catalog filter chips (read-only, low risk).
- **Public profile route** — there's still no `/t/<slug>` Next.js page. The visibility-aware preview lives inside the admin's `ViewAsClientModal` only. When the public route is built, port the `isPublic(catalogId)` helper directly.
- **Per-line rate visibility** — `rateCardVisibility` is whole-card; per-line not in shape.
- **Real upload** — photos + videos still use `URL.createObjectURL` browser blobs. Production work.
- **dynFields backfill is a script, not a run** — `scripts/backfill-talent-field-values.mjs` is ready; running it requires a real source snapshot of dynFields data (the prototype's localStorage doesn't auto-export). When production cutover happens, dump the source talents' dynFields, point the script at it, run with `--apply`.
- **More FieldRow callsites need `catalogId`** — Phase F1 wired 5 identity fields. Other hand-coded FieldRows (rates, travel, services, limits) still use the un-merged label. Mechanical follow-up — copy the same 1-line `catalogId="<key>"` prop on each.
- **Workspace settings only persist for one tenant** — `PROTO_TENANT_ID = "tenant.acme-models"` is the single demo tenant. When auth is wired, swap for the active workspace's id.
- **Per-talent visibility joins** — Phase F3 `ViewAsClientModal` reads catalog visibility but does NOT yet read per-talent `visibility_override` from `talent_profile_field_values`. Production cutover will join those rows.
- **Edit drawer + add-new still don't fully use `validateField`** — Phase G ships the helper and wires it into the wizard. The edit drawer's existing `missing[]` calculation and the add-new drawer's button-disabled state still use ad-hoc checks. Mechanical follow-up: swap `missing` for `Object.keys(validateProfile(...))`. Same end-user behavior, single code path.

## Mobile / desktop verification notes

**Not browser-tested in this session.** Container queries trigger drawer mobile bottom-sheet at < 720px (was 880px); physical-grid collapses to single column at < 540px. No regressions expected:

- Roster card secondary-role chips wrap naturally via `flexWrap: "wrap"`
- PageHeader subtitle is plain text, fits on one line on desktop and wraps acceptably on mobile (`max-width: 640px` on the `<p>` tag)

Recommend visual QA at 390px, 768px, 1440px before the next major iteration.

## Apply history (Phase D — DONE)

Migrations applied to hosted Supabase project `pluhdapdnuiulvxmyspd` via `scripts/_pg-via-mgmt-api.mjs` during this session:

```
20260901120000_profile_field_definitions.sql        # APPLIED
20260901120100_profile_field_recommendations.sql    # APPLIED
20260901120200_workspace_profile_field_settings.sql # APPLIED
20260901120300_talent_profile_field_values.sql      # APPLIED
20260901120400_seed_profile_field_catalog.sql       # APPLIED (179 def + 171 rec)
```

Live verification:

```sql
SELECT count(*) FROM profile_field_definitions;       -- 179
SELECT count(*) FROM profile_field_recommendations;   -- 171
SELECT relationship, count(*) FROM profile_field_recommendations GROUP BY relationship;
-- applies: 165
-- required: 6
```

Re-running the seed is safe: `ON CONFLICT (field_key) DO UPDATE` keeps existing rows in sync. After editing the prototype catalog, regenerate + re-apply:

```bash
node scripts/generate-profile-field-catalog-seed.mjs > supabase/migrations/20260901120400_seed_profile_field_catalog.sql
node -e 'import("./scripts/_pg-via-mgmt-api.mjs").then(async ({ runSql }) => {
  const fs = await import("node:fs");
  const sql = fs.readFileSync("./supabase/migrations/20260901120400_seed_profile_field_catalog.sql", "utf8");
  await runSql(sql);
});'
```

## Hard rules — going forward

1. **Do NOT regress to Marta-only behavior.** Phase B closed this loop — every talent uses the full profile shape.
2. **Do NOT add a third parallel field catalog.** The unification is FIELD_CATALOG (frontend) ↔ profile_field_definitions (DB). Two storage forms are fine; two source-of-truth surfaces are not.
3. **Do NOT make every type-specific field a hardcoded column** on `talent_profiles`. Use `talent_profile_field_values`. Promote to typed columns later when access patterns justify.
4. **Do NOT put Talent Type, Location, Languages, Skills, or Contexts inside `talent_profile_field_values`.** Those are first-class structured systems with their own tables.
5. **Agencies cannot extend the catalog with new fields.** They can override existing fields via `workspace_profile_field_settings` (or the prototype's `__workspaceOverrides` store). The platform's value depends on cross-agency searchability on a shared schema.
6. **Talent self-registration, talent self-edit, and agency admin edit must use the same field engine.** Different permissions and modes, same field definitions.
7. **Visibility controls must eventually be real.** If a field has Public / Agency / Private, public/preview rendering must honor it. Schema is ready; renderer is not built. Mark visibility flags as prototype-decorative until wired.
8. **New consumers must read through `resolvedFieldsForMode()` (or the DB equivalent), not legacy helpers.** Phase E ships the merge layer; future surfaces should pick it up rather than calling `getDynamicFieldsForType()` directly.
9. **Workspace overrides cannot disable universal-tier fields.** The merge layer enforces this — don't add a code path that bypasses it.
10. **All three surfaces (wizard / add-new / edit drawer) must stay aligned on field definitions.** Phase G closed the gap; if you add a field anywhere, add it to FIELD_CATALOG first and let all three surfaces read it via `resolvedFieldsForMode()`. Don't add new local-state fields that bypass the catalog.
11. **Use `validateField` / `validateProfile` for new validation.** Don't add ad-hoc `if (!field.optional && empty) return false` checks. Phase G ships the helper; same violation = same message everywhere.

## Handoff for the next agent

If you're picking this up:

1. Read this file end-to-end.
2. Read `web/docs/admin-prototype/MASTER_FIELD_CATALOG.md` (Phase D specifics).
3. Read `docs/handoffs/taxonomy-v2-handoff-2026-04-30.md` (taxonomy substrate Phase D depends on).
4. Read `web/AGENTS.md` and `web/CLAUDE.md`.
5. Run `cd web && npx tsc --noEmit 2>&1 | grep -v "_messages\|.next/dev"` — should be empty (exit 0).
6. Open the prototype at `/prototypes/admin-shell` — click roster cards for Marta (t1), Kai (t2), Tomás (t3) — confirm the same edit drawer opens for each, with their data hydrated.
7. Verify Phase G: open Marta's edit drawer → identity row → top-right shows compact visibility pill (not the wide row). Open Settings → Workspace field settings → toggle a field required → registration wizard now gates on it.
8. Tell me which next pass you're picking up:
   - **I1 — Wire Website page → real CMS routes** ✅ DONE — `useRouter()` wired in `WebsitePage()`. Page-row click → `router.push("/admin/site-settings/pages/${id}")`. "+ New page" → `/admin/site-settings/pages/new`. "Open page builder" → `/admin/site-settings/pages` (list). Posts still toast (no real route yet).
   - **I2 — Add-redirect modal** ✅ DONE — `AddRedirectModal` component renders inline below the Redirects table. Inputs: from / to / status code (301/302/307/308 pill toggle) / match mode (exact/prefix/regex pill toggle). Validation: `from` must start with `/`, `to` must be a path or absolute URL, no collision with an existing rule of the same `(from, match)`. Save appends to `w.redirects` with id `r-${Date.now()}`, current timestamp, `createdBy: "You"`, `active: true`. Cancel closes without mutation.
   - **I3 — Domain management drawer** ✅ DONE — `DomainDrawer` rebuilt to read `WEBSITE_STATE.domain` instead of stale `TENANT.customDomain`. Renders verification dot + SSL dot (green/amber by status), SSL renewal countdown ("renews in N days"), DNS records table with per-row COPY button + matched ✓/! indicator, "Re-check DNS" CTA, alternate domains list with verified/pending pills, "+ Add alternate domain" affordance, "Redirect bare → www" toggle. Free-tier path keeps the upgrade pitch. Wired from `WebsiteDomainPanel` "Manage domain" button via `openDrawer("domain")`.
   - **I4 — Frontend reads from DB** — wire one prototype surface (suggest: roster catalog filter chips) to `loadFieldCatalog({ tenantId })` from `web/src/lib/profile-fields-service.ts`. A/B against the constants. Once verified, swap more surfaces.
   - **I5 — Public profile route `/t/<slug>`** — build the Next.js page that reads merged profile + per-field visibility from the DB. Port the `isPublic(catalogId)` helper from `ViewAsClientModal`.
   - **I6 — Per-talent visibility joins** — `talent_profile_field_values.visibility_override` is in the schema but not yet rendered. Wire it through the public preview + future public route.
   - **I7 — More FieldRow `catalogId` callsites** ⚠️ PARTIAL — Threaded `catalogId` on the four highest-confidence callsites in the talent edit drawer: `identity.tagline` (Tagline row), `serviceArea.homeBase` (Home base row), `serviceArea.ownsVehicle` (Owns a vehicle toggle), `links` (Video / social links). Workspace `customLabel` / `customHelper` overrides on those four fields now flow through edit drawer. **Remaining 134+ FieldRow callsites in `_drawers.tsx` not yet threaded** — most are UI-only (Heading font, Pricing mode, Travel fee, etc.) or have no clear catalog match yet. Incremental work.
   - **I8 — Edit drawer `missing[]` adopts `validateProfile`** ✅ DONE — Augmented the publish-gate `required[]` array in the talent edit drawer with catalog-driven type-specific required fields. When `primaryType === "models"` (or secondaryTypes contains it) the gate also requires height / bust / waist / hips / hair color, mapped from `state.dynFields` short-keys to the catalog's dotted ids. Storage-key drift documented inline; production wires unify both sides on catalog ids and call `validateProfile()` directly.
   - **I9 — Workspace settings UI for tenant switching** — currently `PROTO_TENANT_ID` is hardcoded. When auth is wired, lift to the active workspace's id.
   - **I10 — Run dynFields backfill** — pull a real snapshot of talent dynFields from production, run `scripts/backfill-talent-field-values.mjs --apply`.

Do not bundle passes. Do not start without confirming the four reads above.
