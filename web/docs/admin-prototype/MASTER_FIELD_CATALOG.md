# Master Profile Field Catalog — Database Migration Plan

Status: **Migrations drafted. Not yet applied.**

This handoff documents Phase D of the Profile Field Engine work — the
database-backed catalog that replaces the prototype's frontend
constants. Phases B (full profile shape for all talent) and C (multi-
role) and A (unified frontend catalog) are already shipped on
`phase-1`. This phase prepares the schema; agencies can keep using
the prototype catalog until production rollout.

---

## Why this exists

The prototype keeps the field catalog in code:

- `web/src/app/prototypes/admin-shell/_field-catalog.ts` (`FIELD_CATALOG`,
  `getDynamicFieldsForType`, `fieldsForType`, etc.)
- `web/src/app/prototypes/admin-shell/_state.tsx` (`TAXONOMY_FIELDS` —
  rendering metadata for type-specific fields, projected into the
  catalog at module load)

That works for a single-app prototype, but in production:

- **Agencies need to override** which fields are required, public,
  talent-editable, or hidden — without a code deploy.
- **Workspace settings UI** (Phase E) needs a place to write those
  overrides.
- **Talent values for type-specific fields** (height, bust, vehicle
  class, cuisine, etc.) need a structured home; today they live in
  `ProfileState.dynFields` and only round-trip through localStorage.
- **Cross-agency search** on the public Tulala hub needs the catalog
  + values queryable as SQL, not bundled JS.

So the catalog moves to the database. The frontend keeps reading from
the same shape (`ResolvedFieldDefinition`); the data source flips from
constants to Supabase.

---

## Migrations introduced

| File | Purpose |
|---|---|
| `20260901120000_profile_field_definitions.sql` | The catalog table. Tier (universal/global/type-specific), section, rendering metadata (kind/options/placeholder), mode flags (showInRegistration/EditDrawer/Public/Directory), permission flags (adminOnly/talentEditable/requiresReviewOnChange), default visibility, search/completeness behavior. RLS: read public, write platform-staff only. |
| `20260901120100_profile_field_recommendations.sql` | Field × talent-type relationships. Joins `profile_field_definitions` to `taxonomy_terms` (parent_category level). Three relationships: `applies`, `required`, `recommended`. RLS: read public, write platform-staff only. |
| `20260901120200_workspace_profile_field_settings.sql` | Per-tenant overrides. Sparse — only fields the workspace customized get a row. Override flags for every catalog mode flag, plus `custom_label`, `custom_helper`, `display_order_override`, `default_visibility_override`. RLS: tenant-scoped read+write. |
| `20260901120300_talent_profile_field_values.sql` | Per-talent values for type-specific fields. JSONB `value` fits any kind. `visibility_override` is the talent's per-field privacy choice. `workflow_state` (`live`/`pending`/`rejected`) gates fields whose catalog has `requires_review_on_change=TRUE`. RLS: public reads gated by `talent_profiles.visibility='public' AND workflow_status='approved'` plus catalog/override visibility check; talent reads/writes own; staff full access in tenant. |
| `20260901120400_seed_profile_field_catalog.sql` | Auto-generated seed. 182 field definitions + 174 recommendation rows. Idempotent via `ON CONFLICT (field_key) DO UPDATE`. |

---

## What stays as structured systems (not field values)

Per the Phase D charter, these systems stay as their own first-class
tables. The field catalog covers configurable per-type details only.

| System | Table | Why first-class |
|---|---|---|
| Talent types (primary/secondary roles) | `taxonomy_terms` + `talent_profile_taxonomy.relationship_type` | Cross-cutting search, hierarchy, multi-tenant config |
| Location & service areas | `talent_service_areas` | Distance queries, structured radius/fee model |
| Languages | `talent_languages` | Speaking/reading/writing levels, can-host/sell/translate flags |
| Skills + contexts | `taxonomy_terms` + `talent_profile_taxonomy` | Same taxonomy substrate as types |
| Media (photos, video) | Existing media/gallery tables | Storage, EXIF, derivatives |
| Approval / status / visibility | `talent_profiles.workflow_status` + `visibility` | Profile-level lifecycle, not per-field |

Catalog covers: measurements, wardrobe, vehicle, cuisine, equipment,
certifications, performance metadata, document requirements, rate
notes, emergency contact details — anything Tulala wants to **extend
without a deploy**.

---

## How the merge works at query time

`web/src/lib/profile-fields-service.ts` exposes the read API:

```ts
const catalog = await loadFieldCatalog(supabase, { tenantId });
const forTalent = await loadFieldsForType(supabase, ["models", "hosts"], { tenantId });
const forRegistration = await loadFieldsForMode(supabase, "registration", "models");
const values = await getTalentFieldValues(supabase, talentProfileId);
const completeness = computeProfileCompleteness(catalog, values, ["models", "hosts"]);
```

Each call:

1. SELECTs all non-deprecated `profile_field_definitions`.
2. SELECTs `profile_field_recommendations` joined with `taxonomy_terms`
   to resolve parent slugs.
3. If `tenantId` is provided, SELECTs matching
   `workspace_profile_field_settings`.
4. Merges in this order: catalog default → workspace override.
   `custom_label`/`custom_helper` win over the catalog label/helper;
   `*_override` fields win over the catalog booleans.
5. Returns `ResolvedFieldDefinition[]` — the same shape the frontend
   already consumes.

Universal-tier fields **always** stay enabled regardless of
`enabled_override` (workspace can't turn off legalName, pronouns, etc).
The merge enforces this rule.

---

## Re-running the seed

The seed migration is **auto-generated** from the prototype's
`FIELD_CATALOG` + `TAXONOMY_FIELDS`. After editing either source:

```bash
node scripts/generate-profile-field-catalog-seed.mjs \
  > supabase/migrations/20260901120400_seed_profile_field_catalog.sql
```

The `ON CONFLICT (field_key) DO UPDATE` clause keeps the existing rows
in sync — no need to bump the migration timestamp. CI hook should run
the generator and fail if the diff is non-empty (catches drift between
the prototype catalog and the SQL seed).

The recommendation step uses
`DELETE FROM profile_field_recommendations WHERE field_definition_id IN (...)`
to wipe and rebuild. Workspace overrides live in
`workspace_profile_field_settings` and aren't touched. Per-talent
values in `talent_profile_field_values` are also untouched.

---

## Apply order (when ready to roll out)

1. **Pre-flight**: ensure `taxonomy_terms` v2 seed has run
   (`20260801120400..120500`). The recommendations table FKs into
   parent_category rows via slug.
2. Apply `20260901120000` → `20260901120400` in order.
3. Smoke test:
   ```sql
   SELECT count(*) FROM profile_field_definitions;       -- expect 182
   SELECT count(*) FROM profile_field_recommendations;   -- expect 174
   SELECT field_key, tier FROM profile_field_definitions WHERE tier = 'universal';
   ```
4. Wire one production surface (suggested: talent self-edit drawer)
   to call `loadFieldsForMode(supabase, "editDrawer", primaryType)`
   instead of `getDynamicFieldsForType()`. Verify field rendering
   matches the prototype.
5. **Frontend stays on constants for now.** Cutover happens per-
   surface so we can A/B against the prototype.

---

## What's NOT in this migration

- **Phase E (workspace field settings UI)** — the schema is ready,
  the UI is not built. Today only platform staff can write to the
  catalog (RLS).
- **Public profile renderer** — there's no `/t/<slug>` route in this
  prototype that reads `talent_profile_field_values` yet. The RLS
  policy is in place to gate public reads correctly when one is built.
- **Backfill from `ProfileState.dynFields`** — the prototype keeps
  edits in localStorage; production rollout will need a one-time
  backfill that walks each talent's stored dynFields blob and writes
  rows into `talent_profile_field_values`.
- **Search index** — `is_searchable` is recorded in the catalog but
  the directory search query that uses it isn't written yet. Hub-side
  search wiring lives in a different milestone.
- **Custom fields per workspace beyond the platform catalog** — the
  schema does NOT support agency-defined new fields. That was an
  explicit charter rule: "we want to have our engine strong and
  ready with not letting many agencies to create their own profile
  fields." If/when this rule changes, add a `field_definitions` row
  per tenant with a `tenant_id` column and the merge layer extends
  cleanly.

---

## Acceptance checklist (when applying to production)

- [ ] Migrations apply cleanly on a fresh DB
- [ ] Seed produces 182 `profile_field_definitions` rows
- [ ] Seed produces 174 `profile_field_recommendations` rows
- [ ] `loadFieldCatalog(supabase)` returns the same field set as the
  prototype's `FIELD_CATALOG`
- [ ] `loadFieldsForType(supabase, "models")` returns the same fields
  as the prototype's `fieldsForType("models")`
- [ ] `loadFieldsForMode(supabase, "registration", "models")` returns
  the same set as the wizard renders today
- [ ] RLS denies a non-staff non-tenant user from writing to
  `profile_field_definitions`
- [ ] RLS denies a non-tenant staff from reading another tenant's
  `workspace_profile_field_settings`
- [ ] Public reads of `talent_profile_field_values` only return rows
  for `visibility = 'public'` profiles AND fields whose visibility
  includes `'public'`
- [ ] Re-running `generate-profile-field-catalog-seed.mjs` produces
  zero diff against the seed migration
