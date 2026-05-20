# Talent Catalog Engine — Architecture Reference

> **Audience:** engineers joining the project who need to understand, extend, or debug the dynamic field layer.  
> **Last verified:** 2026-05-19 against `phase-1` HEAD.

**Companion docs** (don't duplicate — reference these instead):

| Doc | Purpose |
|---|---|
| [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) | Canonical phase plan (Phases 0 → 9B) |
| [`talent-profile-engine-master-audit-2026-05-18.md`](talent-profile-engine-master-audit-2026-05-18.md) | Full audit of every surface that reads/writes fields |
| [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) | Live incident log, landing blockers, process lessons |
| [`engine-completion-prompt-pack-2026-05-19.md`](engine-completion-prompt-pack-2026-05-19.md) | Ready-to-execute prompts for Phases 0–9B |

---

## 1. Overview

The talent catalog engine owns the **dynamic profile field layer** for Tulala. It answers two questions at runtime: _which fields apply to this talent_ (determined by their taxonomy type assignments) and _who is allowed to see each field's value_ (determined by a three-input visibility model). Every field definition is platform-curated and stored in Postgres; no field schema lives in application code. Tenants (agencies) can apply sparse per-field and per-group overrides — relabelling, hiding, marking required — but cannot add new platform fields (that is a platform-admin operation via migration). Talent values are stored in a single JSONB KV table keyed by `(talent_profile_id, field_definition_id)`. A parallel legacy layer (`field_values` + `field_definitions`) currently bridges the two worlds; it will be retired in Phase 5 once all readers are cut over to the canonical tables.

---

## 2. Data Model

### 2.1 Canonical tables

#### Taxonomy

```
taxonomy_terms
──────────────────────────────────────────────────────
id          UUID PK
slug        TEXT UNIQUE
name_en     TEXT
name_es     TEXT
level       INT    -- 1=parent_category, 2=category_group, 3=talent_type
term_type   TEXT   -- 'parent_category' | 'category_group' | 'talent_type'
parent_id   UUID → taxonomy_terms(id)
sort_order  INT
is_active   BOOL

agency_taxonomy_settings            (sparse: only override rows exist)
──────────────────────────────────────────────────────
PK: (tenant_id, taxonomy_term_id)
is_enabled            BOOL
allow_as_primary      BOOL
allow_as_secondary    BOOL
show_in_registration  BOOL
show_in_directory     BOOL
requires_approval     BOOL
display_order         INT
custom_label          TEXT

agency_taxonomy_terms               (tenant-local custom sub-types)
──────────────────────────────────────────────────────
id              UUID PK
tenant_id       UUID → agencies(id)
parent_term_id  UUID → taxonomy_terms(id)
slug / name_en / name_es / description
is_active       BOOL

talent_profile_taxonomy             (per-talent type assignments)
──────────────────────────────────────────────────────
talent_profile_id  UUID → talent_profiles(id)
taxonomy_term_id   UUID → taxonomy_terms(id)
relationship_type  TEXT  -- 'primary' | 'secondary'
```

#### Field catalog

```
profile_field_definitions           (platform-curated, one row per field)
──────────────────────────────────────────────────────
id                UUID PK
field_key         TEXT UNIQUE   -- e.g. 'physical.height_cm', 'skills'
label / label_es  TEXT
tier              TEXT          -- 'universal' | 'global' | 'type-specific'
section           TEXT          -- 'identity' | 'measurements' | 'travel' | ...
subsection        TEXT          -- 'physical' | 'wardrobe' | NULL
kind              TEXT          -- 'text'|'number'|'select'|'multiselect'|
                                --   'chips'|'date'|'toggle'|'textarea'
options           JSONB[]       -- choices for select/multiselect kinds
placeholder / helper / unit     TEXT
default_visibility  TEXT[]      -- ['public'|'agency'|'private']
is_optional         BOOL
admin_only          BOOL        -- hard floor: never public
is_sensitive        BOOL        -- hard floor: never public
show_in_public      BOOL        -- legacy public flag
field_group_id      UUID → profile_field_groups(id)
validation_rules    JSONB       -- {min, max, regex, enum, ...}
show_when           JSONB       -- conditional display rule
display_order       INT
deprecated_at       TIMESTAMPTZ -- NULL = live; non-NULL = hidden from new flows

profile_field_groups               (13 reusable field bundles)
──────────────────────────────────────────────────────
id         UUID PK
slug       TEXT UNIQUE   -- e.g. 'physical-casting', 'media-portfolio'
name_en / name_es  TEXT
sort_order INT
is_active  BOOL

parent_category_field_groups       (which groups auto-load per category)
──────────────────────────────────────────────────────
PK: (parent_category_id, field_group_id)
parent_category_id → taxonomy_terms(id)
field_group_id     → profile_field_groups(id)
weight             TEXT   -- 'default'|'heavy'|'light'|'optional'
display_order      INT
in_registration_wizard  BOOL
in_profile_editor       BOOL
completeness_weight     DECIMAL(3,2)

profile_field_recommendations      (field × type relationships)
──────────────────────────────────────────────────────
UNIQUE: (field_definition_id, taxonomy_term_id, relationship)
field_definition_id → profile_field_definitions(id)
taxonomy_term_id    → taxonomy_terms(id)
relationship        TEXT  -- 'applies' | 'required' | 'recommended'
display_order       INT
required_at_registration    BOOL
required_before_publish     BOOL
required_before_verification BOOL
is_admin_only               BOOL
requires_verification       BOOL
```

#### Per-tenant overrides (sparse)

```
workspace_profile_field_settings    (per-field per-tenant overrides)
──────────────────────────────────────────────────────
UNIQUE: (tenant_id, field_definition_id)
enabled_override             BOOL  -- NULL = catalog default
required_override            BOOL
show_in_public_override      BOOL
admin_only_override          BOOL
default_visibility_override  TEXT[]
custom_label / custom_helper TEXT
display_order_override       INT

workspace_field_group_settings      (per-group per-tenant overrides)
──────────────────────────────────────────────────────
UNIQUE: (tenant_id, field_group_id)
is_enabled             BOOL
show_in_registration   BOOL
show_in_profile_edit   BOOL
show_in_public_profile BOOL
display_order          INT
custom_label           TEXT
```

#### Per-talent values

```
talent_profile_field_values
──────────────────────────────────────────────────────
UNIQUE: (talent_profile_id, field_definition_id)
talent_profile_id    UUID → talent_profiles(id)
field_definition_id  UUID → profile_field_definitions(id)
tenant_id            UUID   (denormalised for RLS performance)
value                JSONB  -- any kind fits one column
visibility_override  TEXT[] -- talent's per-field privacy choice; NULL = inherit
workflow_state       TEXT   -- 'live' | 'pending' | 'rejected'
last_edited_by_user_id / last_edited_role
```

### 2.2 Legacy tables (retirement pending — Phase 5)

| Table | Role |
|---|---|
| `field_definitions` | Old flat field catalog (predates taxonomy). Read by the legacy bridge. |
| `field_values` | Typed-column KV store (`value_text`, `value_number`, `value_boolean`, `value_date`). Still read by Discover directory facets. |

### 2.3 ER overview

```
taxonomy_terms ──(3-level hierarchy, self-ref parent_id)──► ...
      │
      ├─► agency_taxonomy_settings  (per-tenant flags)
      ├─► agency_taxonomy_terms     (tenant-local sub-types)
      └─► talent_profile_taxonomy ◄──── talent_profiles
                │
                ▼ (via profile_field_recommendations)
      profile_field_definitions ◄── field_group_id ── profile_field_groups
                │                                            │
                │                           parent_category_field_groups
                │                           (category → group mapping)
                ▼
      workspace_profile_field_settings   (per-tenant field overrides)
      workspace_field_group_settings     (per-tenant group overrides)
                │
                ▼
      talent_profile_field_values        (per-talent JSONB values)
```

---

## 3. Resolver Flow — `getFieldsForTalent`

**File:** `web/src/lib/server-actions/admin-taxonomy.ts`  
**Exported type:** `GetFieldsForTalentEnrichedResult`

```typescript
export async function getFieldsForTalent(input: {
  talent_profile_id: string;
}): Promise<GetFieldsForTalentEnrichedResult>
// Success: { ok: true; fields: ResolvedField[]; groups: ResolvedFieldGroup[] }
// Failure: { ok: false; error: string }
```

### Step-by-step

**Step 1 — Auth + roster guard**  
`requireStaffTenantAction()` extracts the calling user's tenant. Then checks `agency_talent_roster` for `(tenant_id, talent_profile_id)`. Returns an error if the talent isn't on this tenant's roster — prevents cross-tenant field leakage.

**Step 2 — Value presence (Phase 4, additive)**  
`SELECT field_definition_id FROM talent_profile_field_values WHERE talent_profile_id = $1` populates a `Set<string>`. Only field IDs are fetched — never the values. Sets `has_value` on each `ResolvedField`. Non-fatal: if this query fails `has_value` is `undefined` and the UI degrades gracefully.

**Step 3 — Taxonomy assignments**  
`SELECT relationship_type, taxonomy_term_id FROM talent_profile_taxonomy WHERE talent_profile_id = $1` yields the talent's assigned type IDs (primary + secondary).

**Step 4 — Parent chain walk**  
The taxonomy is 3 levels: `talent_type` (L3) → `category_group` (L2) → `parent_category` (L1). The resolver walks upward with two queries to collect:
- `allTermIds` — all IDs at all levels; used to filter `profile_field_recommendations`
- `parentCategoryIds` — L1 IDs only; used to filter `parent_category_field_groups`

**Step 5 — Tenant-static catalog (cached)**  
`getCachedTenantFieldCatalog(tenantId)` (see §9) fetches or serves from cache six tables as a bundle:

| Bundle key | Table | Filter |
|---|---|---|
| `defs` | `profile_field_definitions` | `deprecated_at IS NULL` |
| `groupRows` | `profile_field_groups` | `is_active = true` |
| `allParentCategoryGroups` | `parent_category_field_groups` | none (all) |
| `allRecs` | `profile_field_recommendations` | none (all) |
| `groupOverrides` | `workspace_field_group_settings` | `tenant_id = $tenantId` |
| `fieldOverrides` | `workspace_profile_field_settings` | `tenant_id = $tenantId` |

On a **cache hit**, the global slices are filtered in-memory (equivalent to the SQL `.in()` filters). On a **cache miss or no service client**, the fallback path issues each query individually. Behavior is identical either way.

**Step 6 — Group resolution**  
`parentGroupRows` (filtered `allParentCategoryGroups`) is crossed with `groupOverrides`:
- A group is skipped if `workspace_field_group_settings.is_enabled = false`.
- When multiple parent categories recommend the same group, highest `weight` wins (`heavy` > `default` > `light` > `optional`).
- Tenant `custom_label` and `display_order` overrides are applied here.

**Step 7 — Recommendation aggregation**  
For each `profile_field_recommendations` row whose `taxonomy_term_id` is in `allTermIds`, the strongest relationship is kept per field:

```
required  >  recommended  >  applies
```

The five requirement-level booleans (`required_at_registration`, `required_before_publish`, `required_before_verification`, `is_admin_only`, `requires_verification`) are **OR-ed** across all matching recs — if any matching row is `true`, the field carries that flag.

**Step 8 — Field resolution loop**  
For each definition in `defs`:

1. Skip if `workspace_profile_field_settings.enabled_override = false`.
2. **Tier gate:**
   - `universal` or `global` → always included (no recommendation required).
   - `type-specific` → included **only** if `recsByField` has an entry. Group membership alone is NOT sufficient (see comment at line 1154: `chef.cuisines` must not leak onto Influencer profiles just because they share a group).
3. Apply `effectiveFieldVisibility` (§4) when the tenant has any visibility override column set.
4. Merge tenant `custom_label`, `custom_helper`, `display_order_override`, `required_override`.
5. Set `tenant_override = true` if any non-null override column exists on the settings row.
6. Set `has_value` from the Set built in Step 2.

**Step 9 — Sort and return**  
Fields are sorted: group `display_order` → field `display_order` → label alpha. `ResolvedFieldGroup[]` is built in parallel for the UI to know which group panel sections to render and in what order.

### Worked example — "Tina" (fashion model)

Tina has:
- Primary: "Editorial Model" (L3 talent_type, under "Fashion Models" L2, under "Models" L1)
- Secondary: "Commercial Model" (L3, same L1 parent)

Resolver walk:

```
Step 3: termIds = [editorial_model_id, commercial_model_id]

Step 4: tParents query returns both L3 rows with parent_id = fashion_models_id
        grandparentIdsToFetch = [fashion_models_id]
        gp query returns fashion_models (L2) with parent_id = models_id
        →  allTermIds = {editorial_model_id, commercial_model_id,
                         fashion_models_id, models_id}
        →  parentCategoryIds = {models_id}

Step 5: catalog cached; parentGroupRows filtered to groups where
        parent_category_id = models_id
        → e.g. physical-casting (heavy), wardrobe (default), media-portfolio (light)

Step 6: All three groups pass (no tenant disable).

Step 7: recs filtered to allTermIds:
        physical.height_cm  → required    for editorial_model_id
        physical.eye_color  → applies     for editorial_model_id
        chef.cuisine        → (not in allTermIds) → excluded

Step 8: Field loop:
        identity.stage_name  (universal) → include
        physical.height_cm   (type-spec, rec=required) → include, is_required=true
        physical.eye_color   (type-spec, rec=applies)  → include, is_required=false
        chef.cuisine         (type-spec, no rec)       → SKIP
        skills               (global)                  → include
```

---

## 4. Visibility Engine

**File:** `web/src/lib/field-engine/effective-visibility.ts`

The **single canonical visibility decision** for the entire engine. Pure, stateless, side-effect-free. Import and call it; never reimplement visibility logic elsewhere.

### Canonical states

| State | Rank | Meaning |
|---|---|---|
| `"public"` | 0 | Visible to everyone including anonymous |
| `"admin"` | 1 | Visible to agency staff and to the talent themselves |
| `"hidden"` | 2 | Data retained; visible to agency staff only |

Higher rank = more restrictive. `moreRestrictive(a, b)` picks the higher rank.

### Three-input model

```typescript
export function effectiveFieldVisibility(
  def:          FieldDefVisibilityInput,            // platform catalog defaults
  tenant?:      TenantFieldVisibilityOverride | null, // workspace override (sparse)
  valueOverride?: string[] | null,                  // talent's per-value choice
): FieldVisibility
```

**Precedence: most-restrictive wins; platform floor is absolute.**

```
1. platformBaseVisibility(def)
   ├─ admin_only === true          → "admin"
   ├─ is_sensitive === true        → "admin"
   ├─ show_in_public === true OR
   │  "public" in default_visibility → "public"
   └─ else channelsToVisibility(default_visibility)
              ("agency"|"admin" → "admin"; empty/"private" → "hidden")

2. Tenant override (restrict only — can NEVER loosen toward public)
   Sources: admin_only_override, show_in_public_override,
            default_visibility_override
   Applied as: eff = moreRestrictive(base, tenantDesired)
   Exception:  show_in_public_override === true with no other signal
               → tenantDesired = "public" (but moreRestrictive still prevents
                 loosening past the base)

3. Per-value (talent) override (narrow only)
   visibility_override on talent_profile_field_values
   Applied as: eff = moreRestrictive(eff, channelsToVisibility(valueOverride))
   A non-empty valueOverride array triggers this; empty array → no change.

4. Platform floor re-applied
   if (admin_only || is_sensitive) && eff === "public" → force "admin"
   (catches any override that tried to loosen a floor-protected field)
```

### Truth table (key cases)

| `admin_only` | `is_sensitive` | Platform base | Tenant desires | Effective result |
|:---:|:---:|---|---|---|
| false | false | public | — | **public** |
| false | false | public | admin | **admin** (most-restrictive) |
| false | false | admin | public | **admin** (can't loosen) |
| true | false | admin | public | **admin** (platform floor) |
| false | true | admin | public | **admin** (platform floor) |
| false | false | hidden | public | **hidden** (can't loosen) |
| false | false | admin | hidden | **hidden** (restricted further) |

### `canViewerSee(v, role)`

```typescript
export function canViewerSee(v: FieldVisibility, role: ViewerRole): boolean
```

| Visibility | public | client | talent | coordinator | agency_admin | platform_admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `"public"` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `"admin"` | ✗ | ✗ | ✓ (own) | ✓ | ✓ | ✓ |
| `"hidden"` | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |

### `visibilityToOverrideColumns`

Converts the admin UI tri-state back to the three override columns on `workspace_profile_field_settings`:

```typescript
"public"  → { show_in_public_override: true,  admin_only_override: false, default_visibility_override: null }
"admin"   → { show_in_public_override: false, admin_only_override: true,  default_visibility_override: null }
"hidden"  → { show_in_public_override: false, admin_only_override: false, default_visibility_override: [] }
```

---

## 5. Plan-Tier Capability Matrix

**File:** `web/src/components/admin/shell/internal/state.tsx` (line 7030)

```typescript
export const FIELD_PRIVACY_PLAN_RULES: Record<"free"|"studio"|"agency"|"network", {
  canFlipPublicInternal: boolean;
  canHide:              boolean;
  canCreateCustom:      boolean;
  canSetRequired:       boolean;
}> = {
  free:    { canFlipPublicInternal: false, canHide: false, canCreateCustom: false, canSetRequired: false },
  studio:  { canFlipPublicInternal: true,  canHide: false, canCreateCustom: false, canSetRequired: false },
  agency:  { canFlipPublicInternal: true,  canHide: true,  canCreateCustom: true,  canSetRequired: true  },
  network: { canFlipPublicInternal: true,  canHide: true,  canCreateCustom: true,  canSetRequired: true  },
};
```

| Capability | Free | Studio | Agency | Network |
|---|:---:|:---:|:---:|:---:|
| Toggle field public ↔ internal | ✗ | ✓ | ✓ | ✓ |
| Hide a field entirely from talent view | ✗ | ✗ | ✓ | ✓ |
| Set custom label / helper text | ✗ | ✗ | ✓ | ✓ |
| Mark an optional catalog field required | ✗ | ✗ | ✓ | ✓ |

**Hard-coded exceptions that override plan tier:**

`ALWAYS_INTERNAL_FIELDS` — never allowed public regardless of plan:
`legalName`, `dob`, `address`, `email`, `phone`, `rates`, `payoutMethod`, `taxId`, `passport`, `visa`, `insurance`, `contracts`

`ALWAYS_VISIBLE_FIELDS` — cannot be hidden regardless of plan:
`stageName`, `primaryType`

The helper `allowedVisibilities(fieldId, rules)` applies both constraints and returns a `{ public, internal, hidden }` bitmask that drives which UI options are rendered for a given field.

---

## 6. Field Naming Conventions

Field keys are stored in `profile_field_definitions.field_key`. Two styles currently coexist:

**Dotted namespace** (most type-specific fields; the intended convention):
```
physical.body_type      physical.dress_size     physical.eye_color
physical.hair_color     physical.hair_length    physical.height_cm
physical.shoe_size_eu   experience.years_total  experience.level
experience.notable_work experience.professional_highlights
availability.status     availability.available_for
travel.willing          travel.scope            media.website_url
identity.dob
```
Pattern: `<section>.<concept>`. The prefix matches `profile_field_definitions.section`.

**Flat** (universal/global fields; legacy-origin):
```
skills    languages    fit_labels    industries    event_types    tags
```

**This inconsistency is known debt, not intentional design.** The schema migration comment documents the dotted style as canonical (`"identity.legalName"`, `"measurements.bust"`, `"models.height"`), but flat keys survived from prototype code that predated the convention.

**Practical impact for engineers:**
- Code that does `key.split('.').pop()` to derive a short name silently breaks for flat keys.
- The legacy bridge `NEW_TO_OLD_KEY` only maps dotted keys. Flat keys have no legacy mirror (correct — they postdate the legacy table).
- Normalising all keys to dotted form is a Phase 8 scope item, blocked on the 6-sidebar-keys product decision (see [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) §"Pending Decision").

---

## 7. Adding a New Platform Field

Platform fields are Tulala-curated. Tenants cannot add rows to `profile_field_definitions`. The steps below are for Tulala engineers.

### Step 1 — Generate a unique migration timestamp

```bash
date -u +%Y%m%d%H%M%S   # e.g. 20261015143022
```

Create `supabase/migrations/<timestamp>_add_field_<name>.sql`.

### Step 2 — INSERT into `profile_field_definitions`

```sql
BEGIN;

INSERT INTO public.profile_field_definitions (
  field_key,           -- dotted namespace preferred: '<section>.<concept>'
  label,
  tier,                -- 'universal' | 'global' | 'type-specific'
  section,             -- must match the section CHECK constraint
  kind,                -- 'text'|'number'|'select'|'multiselect'|'chips'|
                       --   'date'|'toggle'|'textarea'
  default_visibility,  -- ARRAY['agency'] to start internal
  is_optional,
  display_order,
  admin_only,          -- true → hard floor, never public
  is_sensitive,        -- true → hard floor, never public
  show_in_public       -- false for most new fields
)
VALUES (
  'physical.waist_cm',
  'Waist (cm)',
  'type-specific',
  'measurements',
  'number',
  ARRAY['agency']::TEXT[],
  TRUE,
  130,
  FALSE, FALSE, FALSE
);

COMMIT;
```

### Step 3 — Add recommendations (type-specific only)

A `type-specific` field with **no `profile_field_recommendations` rows is dead** — the resolver skips it at Step 8. `universal` and `global` fields need no recommendations.

```sql
INSERT INTO public.profile_field_recommendations
  (field_definition_id, taxonomy_term_id, relationship, display_order,
   required_before_publish)
SELECT
  (SELECT id FROM public.profile_field_definitions
    WHERE field_key = 'physical.waist_cm'),
  t.id,
  'recommended',
  130,
  FALSE
FROM public.taxonomy_terms t
WHERE t.slug IN ('fashion-model', 'editorial-model')
  AND t.is_active = TRUE;
```

### Step 4 — Apply the migration

```bash
npm run db:push      # applies to linked remote Supabase
```

### Step 5 — Where it appears automatically

| Surface | Behaviour after migration |
|---|---|
| **Admin talent editor** (Details tab) | `getFieldsForTalent` includes the field for matching talent types. No code change. |
| **Workspace field settings** | Field appears in the Field Privacy drawer once any roster talent qualifies. No code change. |
| **Public talent profile** | Excluded by default when `default_visibility = ['agency']`. Tenants can flip it public if their plan allows. |
| **Discover directory facets** | Only if the field is added to the directory query manually (legacy filter path; not auto-wired). |

### Step 6 — Legacy bridge (only if needed)

Add an entry to `NEW_TO_OLD_KEY` in `web/src/lib/fields/legacy-mirror.ts` **only** if the new field has a direct semantic equivalent in the old `field_definitions` table that Discover currently reads. Most new fields do not need this — skip if the old key doesn't exist.

### Step 7 — Cache self-expires

The tenant catalog cache has a 120s TTL and is also busted on any admin field-settings write. For an out-of-band migration with no UI activity the cache self-expires within 2 minutes. No manual invalidation is needed.

---

## 8. The Split-Brain (Phase 5 in Progress)

### Why it exists

Before the canonical engine, talent measurements and a few other facts were stored in `field_values` (typed columns: `value_text`, `value_number`, `value_boolean`, `value_date`) keyed by `field_definitions.key`. Discover's directory facet filters and some legacy surfaces still query `field_values` directly. Until those readers are cut over, every canonical write must also write to the legacy table for the bridged keys to keep surfaces in sync.

The split-brain created a concrete bug: when talent self-edits were wired through the canonical path but `mirrorWriteToLegacy` was only called from the admin write path, talent self-edits never reached Discover. The bridge was extracted into a shared module to close that gap.

### The bridge

**File:** `web/src/lib/fields/legacy-mirror.ts`

```typescript
export async function mirrorWriteToLegacy(
  supabase: MirrorSupabase,
  newKind: string,
  talentProfileId: string,
  newFieldKey: string | undefined,
  value: unknown,
): Promise<void>
```

Logic:
1. Look up `newFieldKey` in `NEW_TO_OLD_KEY`. If not found → no-op (field has no legacy equivalent).
2. Fetch the old `field_definitions` row by `key`. If not found → no-op.
3. If `value` is null/undefined → `DELETE` the legacy row.
4. Otherwise coerce the JSONB value to typed columns based on `field_definitions.value_type` (`text`→`value_text`, `number`→`value_number`, `boolean`→`value_boolean`, `date`→`value_date`). Taxonomy/location types are out of scope for the bridge.
5. `UPSERT` to `field_values` on `(talent_profile_id, field_definition_id)`.

**17 bridged keys:**

| Canonical key | Legacy key | Legacy `value_type` |
|---|---|---|
| `physical.body_type` | `body_type` | text |
| `physical.dress_size` | `clothing_size` | text |
| `identity.dob` | `date_of_birth` | date |
| `physical.eye_color` | `eye_color` | text |
| `physical.hair_color` | `hair_color` | text |
| `physical.hair_length` | `hair_length` | text |
| `physical.height_cm` | `height_cm` | number |
| `physical.shoe_size_eu` | `shoe_size` | text |
| `experience.years_total` | `years_experience` | number |
| `experience.level` | `experience_level` | text |
| `experience.notable_work` | `notable_work` | textarea |
| `experience.professional_highlights` | `professional_highlights` | textarea |
| `availability.status` | `availability_status` | text |
| `availability.available_for` | `available_for` | text |
| `travel.willing` | `willing_to_travel` | boolean |
| `travel.scope` | `travel_scope` | text |
| `media.website_url` | `website_url` | text |

**Call sites:** `admin-talent-field-values.ts` (admin write path) and `talent-field-values-catalog.ts` (talent self-edit path). Both import and call `mirrorWriteToLegacy` after every canonical upsert.

### What Phase 5 retires

1. Cut over all `field_values` readers (Discover facets, directory loaders) to `talent_profile_field_values`.
2. Run a backfill migration (canonical ← legacy) for any values written only to legacy before the bridge existed.
3. Drop `field_values` and `field_definitions`.
4. Delete `legacy-mirror.ts` and all call sites.

Until Phase 5 ships: any new canonical field that Discover reads **must** have a bridge entry in `NEW_TO_OLD_KEY` if the old key exists.

---

## 9. Caching

### `getCachedTenantFieldCatalog`

Module-internal function in `web/src/lib/server-actions/admin-taxonomy.ts` (not exported — `"use server"` modules can only export async functions; the function is called internally by `getFieldsForTalent`).

```typescript
function getCachedTenantFieldCatalog(
  tenantId: string
): Promise<TenantFieldCatalog | null>
```

Uses Next.js `unstable_cache`:

```typescript
unstable_cache(
  () => loadTenantFieldCatalogUncached(tenantId),
  ["tenant-field-catalog", "v1", tenantId],
  {
    tags: ["field-catalog", `field-catalog:${tenantId}`],
    revalidate: 120,   // seconds
  }
)()
```

**What is cached:** the six tenant-static slices (definitions, groups, group→category mappings, recommendations, group overrides, field overrides). Identical for every talent on the same tenant; changes only when an admin edits catalog or settings.

**What is NOT cached:** per-talent data — roster check, taxonomy assignments, parent chain walk, value presence IDs. These are always queried fresh.

**Fallback:** if `createServiceRoleClient()` returns null, or if any hard catalog query fails, `loadTenantFieldCatalogUncached` returns null and `getFieldsForTalent` falls back to six inline per-call queries. Behavior is identical; only the source of static rows differs.

**Diagnostic log pattern (temporary instrumentation):**
```
[field-catalog] request tenant=<id>       ← every call
[field-catalog] MISS (querying db) tenant=<id>  ← only on cache miss
[field-catalog] MISS resolved tenant=<id> duration=Nms defs=N recs=N
```
A `request` line with no following `MISS` = cache hit. Remove these once behavior is verified.

### `bustFieldCatalog`

**File:** `web/src/lib/server-actions/admin-workspace-field-settings.ts`

```typescript
function bustFieldCatalog(tenantId: string): void {
  revalidateTag("field-catalog", "default");
  revalidateTag(`field-catalog:${tenantId}`, "default");
}
```

Called automatically after every write to `workspace_profile_field_settings`. The broad tag `"field-catalog"` invalidates all tenants; the scoped tag `"field-catalog:<tenantId>"` invalidates only the affected tenant.

**When to call manually:** if you write directly to `profile_field_definitions`, `profile_field_groups`, `parent_category_field_groups`, or `profile_field_recommendations` outside the normal API surface (e.g., post-migration backfill run from the DB console), either call `bustFieldCatalog` for each affected tenant, or wait for the 120s TTL to expire naturally.

**Known limitation:** `CACHE_TAG_FIELD_CATALOG` is defined as a module-private constant in `admin-taxonomy.ts` and duplicated as a string literal `"field-catalog"` in `admin-workspace-field-settings.ts`. If one is changed without the other, bust stops working silently. Fix: extract the constant to a non-`"use server"` shared module.

---

## 10. Platform Admin Inspection (Phase 9A)

Platform staff (`super_admin` role) have a read-only surface to inspect the catalog without touching migrations.

**Data loader:** `web/src/app/(workspace)/platform/catalog-map-data.ts`  
**Entry point:** `loadPlatformCatalogMap(): Promise<PlatformCatalogMap>`

Uses a service-role client (bypasses tenant RLS — the route is platform-admin-gated at the layout level). Four parallel queries:

1. All `profile_field_definitions` (including deprecated) — for the full catalog view.
2. All `profile_field_groups` — for group-bucketed display.
3. All `workspace_profile_field_settings` (field IDs only) — for override counts per field.
4. All `talent_profile_field_values` (field IDs only) — for value counts per field.

**`PlatformCatalogMap` shape:**

```typescript
{
  ok: boolean;
  summary: {
    totalFields: number;
    byTier: Record<string, number>;   // { universal: N, global: M, "type-specific": P }
    deprecated: number;               // count of deprecated fields
    adminOnly: number;
    sensitive: number;
    totalGroups: number;
    fieldsWithOverrides: number;      // fields overridden by ≥1 tenant
    fieldsWithValues: number;         // fields with ≥1 stored value across all tenants
  };
  groups: CatalogGroup[];             // CatalogField[] bucketed by field_group
  ungrouped: CatalogField[];          // fields with no field_group_id
  risks: CatalogRisk[];               // automated diagnostic findings
}
```

**Risk findings** (read-only diagnostics; never auto-remediated):

| `kind` | What it flags |
|---|---|
| `sensitive-but-public` | `is_sensitive=true` AND `show_in_public=true` — contradiction |
| `admin-but-public` | `admin_only=true` AND `show_in_public=true` — contradiction |
| `deprecated-with-values` | Field deprecated but ≥1 talent value still stored |
| `deprecated-active-overrides` | Field deprecated but ≥1 workspace override row still active |
| `unused` | Non-deprecated, zero overrides, zero values — cleanup candidate |

`CatalogField.visibility` is computed via the shared `platformBaseVisibility` from `effective-visibility.ts`. The platform inspector uses the same engine as the resolver — no second visibility implementation.

**Per-field detail and per-tenant catalog posture** views are additional slices shipped in Phase 9A (slice 7 landed on `phase-1` HEAD). See the execution plan for their data shapes and future slices.

---

## 11. Known Debt

For full details and status of each item see [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) and the execution plan.

**Active blocker:**

- **`phase-1` fails `tsc` (4 errors in `drawers.tsx`)** — `Property 'has_value'/'tenant_override' does not exist on type 'ResolvedField'`. Root cause: Phase 4 panel code was swept into `phase-1` by a broad `git add drawers.tsx`; the matching resolver change (adding optional `has_value?`/`tenant_override?` to `ResolvedField` + `getFieldsForTalent`) is in branch `engine-phase4-finish` commit `36ea80397` but not yet landed. Fix is the `admin-taxonomy.ts` resolver delta from that commit. Blocked on other-agent uncommitted work in `admin-taxonomy.ts`.

**Structural / design debt:**

- **Field key naming inconsistency** (§6): dotted `section.concept` vs flat keys coexist. Normalising to all-dotted is Phase 8, blocked on the 6-sidebar-keys product decision.
- **Split-brain bridge** (§8): `legacy-mirror.ts` must stay maintained until Phase 5 Convergence ships. Any new canonical field read by Discover may need a bridge entry.
- **6 sidebar keys not yet canonical**: `fit_labels`, `industries`, `event_types`, `tags` have no `profile_field_definitions` equivalents. The legacy `public-profile-field-visibility.ts` gate is still active for these four. Awaiting product decision (Options A–D documented in the status doc).
- **`resolvePublicFields` not extracted**: public-profile field resolver is inline in the page server component; extraction deferred (behaviour-neutral refactor on a live public path).
- **`profile_field_recommendations` RLS write policy too broad**: current policy allows write to any `is_agency_staff()`, not just platform staff. Catalog is supposed to be Tulala-curated only; a workspace admin with direct DB access could insert recommendation rows.
- **Final sort in `getFieldsForTalent` is O(n²)**: the sort comparator at line 1288 re-scans `groupMetaById.entries()` for every field comparison to look up display order by slug. Should be a pre-built `slug → display_order` lookup Map.
- **Cache tag constant is duplicated**: `"field-catalog"` appears independently in `admin-taxonomy.ts` and `admin-workspace-field-settings.ts`. Should be extracted to a shared non-`"use server"` constants module.
- **Custom fields (Phase 8)**: tenants cannot yet add their own fields beyond taxonomy overrides and label customisation. Schema design for tenant-owned fields not started.
- **Phase 9B editable Studio**: platform admin cannot edit catalog definitions without a migration. Full change-set / preview / rollback workflow is gated on Phases 0–7 completion.
