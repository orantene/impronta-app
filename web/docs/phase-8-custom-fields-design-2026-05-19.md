# Phase 8 — Custom Fields Design (2026-05-19)

> **Status:** design / decision doc, no code yet.
> **Branch:** `engine-phase8-design-doc` (off `phase-1` tip `3e939fcf3`).
> **Companion docs:** [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) §Phase 8 (the mandate), [`engine-architecture.md`](engine-architecture.md) §2/§3/§4 (the engine we plug into), [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) §"Known Debt" (where Phase 8 sits in the dependency graph).
> **Pre-reqs:** Phases 0, 1, 2, 3, 5, 6, 7a/7b green. This doc assumes them and does not re-design any of them.

---

## 1. Goal and non-goals

**Goal.** Let an **Agency**- or **Network**-tier workspace define **its own** profile fields — beyond the platform-curated catalog — so a workspace can capture data the platform doesn't yet model (e.g. "Internal Booking Code", "Preferred Studio", "Wardrobe Allowance"). Custom fields appear only on that workspace's talents, are written/read through the same engine as platform fields, and are visible/searchable only when explicitly opted in.

This is the long-tail flexibility selling point of Agency/Network tier — but only **after** the core is one truth (P1→P7), otherwise it multiplies the existing mess and breaks search.

**Non-goals.** Custom fields explicitly **do not**:

- Add rows to `profile_field_definitions` (platform catalog stays Tulala-curated; RLS now restricts writes there to platform admins — commit `3e939fcf3`).
- Become globally visible to other tenants (no cross-tenant leakage, ever).
- Override or shadow reserved/canonical fields (`stage_name`, identity, etc.).
- Set platform floors (`is_sensitive` / `admin_only`) — only Tulala can mark a field sensitive.
- Affect Discover, AI search, or recommendations engines by default.
- Replace the workspace's ability to enable/disable, relabel, or set required on **platform** fields — that is Phase 2 and is independent.
- Add net-new field **kinds** (`text` / `number` / `select` / `multiselect` / `chips` / `date` / `toggle` / `textarea`) — custom fields use the kinds the engine already renders.
- Persist values anywhere other than the canonical `talent_profile_field_values` table.

**What "custom field" means concretely.** A row in a new tenant-scoped table whose shape mirrors `profile_field_definitions` but whose ownership is the tenant. It joins the resolver's output for that tenant's talents only, with the same `ResolvedField` envelope as platform fields, distinguished by `is_custom: true`.

---

## 2. Ownership model — schema options

### Option A — Separate table `agency_field_definitions` (recommended)

```
agency_field_definitions
──────────────────────────────────────────────────────
id                  UUID PK
tenant_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE
field_key           TEXT NOT NULL             -- enforced to start 'custom.'
label               TEXT NOT NULL
label_es            TEXT
helper              TEXT
placeholder         TEXT
unit                TEXT
kind                TEXT NOT NULL CHECK (kind IN ('text','number','select',
                        'multiselect','chips','date','toggle','textarea'))
options             JSONB                     -- choices for select/multiselect
validation_rules    JSONB                     -- {min,max,regex,enum,...}
default_visibility  TEXT[] DEFAULT ARRAY['agency']::TEXT[]
show_in_public      BOOLEAN DEFAULT FALSE
field_group_id      UUID REFERENCES profile_field_groups(id)  -- optional, only platform groups
display_order       INT DEFAULT 100
status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','approved',
                                          'rejected','published','suspended'))
status_reason       TEXT                      -- platform admin's note on reject/suspend
discover_searchable BOOLEAN NOT NULL DEFAULT FALSE
created_by          UUID REFERENCES auth.users(id)
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
submitted_at        TIMESTAMPTZ
reviewed_by         UUID REFERENCES auth.users(id)   -- platform admin
reviewed_at         TIMESTAMPTZ
published_at        TIMESTAMPTZ
suspended_at        TIMESTAMPTZ
deprecated_at       TIMESTAMPTZ
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (tenant_id, field_key)
```

Plus an **optional, additive** table for talent-type targeting (only if we need scope finer than "every talent on this tenant"):

```
agency_field_recommendations
──────────────────────────────────────────────────────
agency_field_id     UUID NOT NULL REFERENCES agency_field_definitions(id) ON DELETE CASCADE
taxonomy_term_id    UUID NOT NULL REFERENCES taxonomy_terms(id)
relationship        TEXT NOT NULL DEFAULT 'applies'
                        CHECK (relationship IN ('applies','recommended','required'))
display_order       INT DEFAULT 100
required_before_publish BOOLEAN DEFAULT FALSE
UNIQUE (agency_field_id, taxonomy_term_id, relationship)
```

**Pros**
- **RLS isolation is trivial:** every read/write predicate is `tenant_id = my_tenant`. No discriminator-column-confused policies.
- **No risk to the platform catalog.** Phase 7a's `profile_field_definitions` write-tightening (commit `3e939fcf3`, restricting writes to platform admins) stays in place. Custom fields go to a *different* table with its own RLS.
- **No accidental cross-tenant leakage.** A bug in a `tenant_id` filter elsewhere can't suddenly expose Tulala's catalog because they live in different tables.
- **Cleanest rollback.** `DROP TABLE` reverts the whole feature; no risk of stranded rows on a global table.
- **Easiest reasoning per query:** `loadTenantFieldCatalogUncached` adds one slice (`customDefs`), filtered server-side by `tenant_id`. The resolver merges custom into `defs` at construction time with `is_custom: true`.
- **Status machine fits naturally.** The `status` column is unambiguously about custom-field governance — no need to interpret null vs. enum on a shared row.

**Cons**
- Two near-identical structures means we maintain two read paths in the resolver (one for `defs`, one for `customDefs`) and one type-merge at the bottom. Mild — fewer than 30 LOC.
- A query that wants "every field for this talent, custom + platform" runs two SELECTs rather than one. Trivial — cache makes this `O(1)` per tenant.

### Option B — Extend `profile_field_definitions` with nullable `owner_tenant_id`

Add `owner_tenant_id UUID REFERENCES agencies(id) ON DELETE CASCADE NULL`, plus a `status` column with the same state machine, plus an `is_custom GENERATED AS (owner_tenant_id IS NOT NULL) STORED` convenience flag.

**Pros**
- One table, one resolver join — slightly less code.
- Custom fields automatically participate in any existing `profile_field_definitions` consumer that doesn't tenant-filter (which is also the con).

**Cons (decisive)**
- **RLS must be re-written.** Phase 7a deliberately tightened `profile_field_definitions` writes to platform admins (commit `3e939fcf3`). To let agency staff INSERT custom fields, we'd add a second policy or a CASE-on-`owner_tenant_id` policy. That's exactly the regression Phase 7a was designed to prevent.
- **Read-path cross-tenant risk.** Every reader of `profile_field_definitions` is now reading a mixed table. The Phase 9A catalog map (`platform/catalog-map-data.ts`) reads the whole table with a service-role client; it would need a `WHERE owner_tenant_id IS NULL` filter, plus *every other reader* needs an audit pass. The failure mode for a missed filter is **silent cross-tenant leakage** — exactly what we said we'd never have.
- **A single missed filter on `getCachedTenantFieldCatalog` step** (line 141 of `admin-taxonomy.ts`) would surface every tenant's custom fields to every other tenant. The Phase 9A loader is service-role; one wrong join and the platform inspector shows custom fields.
- The state machine on a column that is normally "always published" creates query-readability ambiguity (is `WHERE deprecated_at IS NULL` enough, or do I also need `status = 'published'`?).
- Migration is far less reversible — a column add is easy to revert but the policy changes ripple.

### Option C — Single table with discriminator column

Add `definition_kind TEXT NOT NULL DEFAULT 'platform'` and a partitioning approach. Same RLS-rewrite, same cross-tenant risk as Option B, plus the disadvantage that the discriminator must be respected by every consumer. No additional upside over Option B except verbosity-explicit.

### Recommendation: **Option A**

The deciding factors:

1. **Phase 7a's RLS tightening** (`profile_field_definitions` writes restricted to platform admins) is a clear signal that Tulala's catalog must remain platform-curated. Option B requires undoing or working around that.
2. **Cross-tenant leakage is the worst failure mode the engine can have.** Option A makes leakage an `O(1)` audit (one table, one tenant filter) rather than `O(consumers)`.
3. **Custom fields belong in their own state machine.** A `status` column on a table where 99% of rows have no governance state is awkward and bug-prone.
4. **Rollback is one DROP TABLE.** Option B's rollback involves un-doing column adds, repairing RLS policies, and finding stranded rows.

The mild duplication cost in the resolver (one extra slice in the catalog loader, one type-merge) is paid once, in one file, and is mechanical.

---

## 3. Governance — state machine

Every custom field row has a `status` column moving through this state machine:

```
                 (tenant draft)
                        │
                        ▼
                  ┌──────────┐
                  │  draft   │ ◄────────────────────┐
                  └────┬─────┘                      │
                       │ tenant submits             │
                       ▼                            │
                 ┌─────────────┐                    │
                 │  submitted  │                    │
                 └──┬───────┬──┘                    │
       platform     │       │  platform             │
       approves     │       │  rejects              │
                    ▼       ▼                       │
            ┌────────────┐ ┌──────────┐             │
            │  approved  │ │ rejected │─── tenant ──┘
            └──────┬─────┘ └──────────┘   re-edits
                   │ (auto, on approve)
                   ▼
            ┌────────────┐
            │ published  │ ◄────┐
            └──────┬─────┘      │
                   │            │
        platform   │   platform │
        suspends   │   unsuspends
                   ▼            │
            ┌────────────┐      │
            │ suspended  │──────┘
            └────────────┘
```

**Allowed transitions, per role:**

| From → To | Tenant (agency_admin) | Platform admin | System |
|---|:---:|:---:|:---:|
| `draft → submitted` | ✓ | — | — |
| `submitted → approved` | — | ✓ | — |
| `submitted → rejected` | — | ✓ (with reason) | — |
| `rejected → draft` | ✓ (on edit) | — | — |
| `approved → published` | — | — | ✓ (auto on approve) |
| `published → suspended` | — | ✓ (with reason) | — |
| `suspended → published` | — | ✓ | — |
| `draft → (deleted)` | ✓ (only if no values exist) | — | — |
| `rejected → (deleted)` | ✓ | — | — |
| `published/suspended → deprecated_at=now()` | — | ✓ | — |

**What the tenant can edit at each state:**

| Field | draft | submitted | approved/published | suspended |
|---|:---:|:---:|:---:|:---:|
| `label`, `label_es`, `helper`, `placeholder` | ✓ | ✗ | ✓ (no re-submit) | ✗ |
| `kind`, `options`, `validation_rules`, `unit` | ✓ | ✗ | ✗ ¹ | ✗ |
| `default_visibility`, `show_in_public` | ✓ | ✗ | ✓ (no re-submit) | ✗ |
| `field_group_id`, `display_order` | ✓ | ✓ | ✓ | ✗ |
| `discover_searchable` | ✓ | ✗ | ✓ (no re-submit) | ✗ |
| `field_key` | ✓ | ✗ | ✗ (forever) | ✗ |

¹ Schema-impacting changes after publish require deprecating + creating a replacement. Same rule as platform fields (Phase 9B). Surfacing this as a UI flow is **deferred to Phase 8.1**; v1 ships with "to change the kind, delete and re-create" copy.

**Why this shape:**
- The tenant is in control of the lifecycle until they submit; at submission they hand the keys to platform.
- Reject → draft is the fast iteration loop; tenant doesn't have to start from scratch.
- Approved auto-publishes — there's no separate "deploy" step. The audit row distinguishes (`operation: 'approve'` then `operation: 'publish'`).
- Suspend is platform's emergency brake (sensitive-looking values discovered, abuse, etc.); it doesn't delete data.
- Deprecate is the soft-retire; identical semantics to `profile_field_definitions.deprecated_at`.

---

## 4. Hard rules — the absolute floors

Phase 8 introduces a new actor (the agency) writing to a new table; the engine's safety invariants need explicit re-statement.

1. **Reserved/canonical keys are forbidden.** A custom field's `field_key` must:
   - Start with the literal prefix `custom.` (enforced via CHECK constraint).
   - Not appear in `web/src/lib/field-canonical.ts`'s `isReservedTalentProfileFieldKey`.
   - Not collide with any existing `profile_field_definitions.field_key` (server-side check; cheap because the catalog is cached).
2. **Custom fields can never set platform floors.** Columns `admin_only` and `is_sensitive` **do not exist** on `agency_field_definitions`. Only the platform marks a field sensitive. Tenants can still restrict their own custom field to channel-`admin` or channel-`hidden` via `default_visibility` — that's a *channel* decision, not a platform floor.
3. **Custom fields never appear in another tenant's resolver output.** The new catalog slice is loaded `WHERE tenant_id = $tenantId` server-side; the platform inspector (Phase 9A) reads the table with explicit `tenant_id`-grouping; no SELECT path on this table is allowed without a tenant filter.
4. **Custom fields are excluded from Discover and AI search by default.** `discover_searchable = false` is the default; flipping it on requires an explicit tenant toggle (see §10) and is plan-tier-gated.
5. **Custom fields cannot redefine an existing platform field's behaviour for any tenant.** Platform fields and custom fields coexist in the resolver output as separate `ResolvedField` rows; they never merge.
6. **Custom field IDs are not user-routable URL segments.** No `/t/[profileCode]?field=<custom_id>`-style deep links; URLs only know `field_key`, and the resolver runs the access check.
7. **Values for a custom field follow the canonical write path.** Writes go to `talent_profile_field_values` only, keyed by `field_definition_id`. There is **no** custom-field-specific values table.
   - This requires `talent_profile_field_values.field_definition_id` to FK either nothing (today's reality — see `engine-architecture.md` §2.1) or both tables. We accept the current "no FK" reality (the resolver enforces existence via the catalog union); a future cleanup phase can add an after-trigger check across the two parent tables if we ever want hard referential integrity.
8. **Custom fields never bypass `effectiveFieldVisibility`.** Every resolver path (admin, public, talent self, Agency Fields) routes through the same primitive — see §6.

These rules are stated in code as:
- DB-level CHECK constraints on `agency_field_definitions` (prefix, kind, status).
- Server-side `submitCustomFieldDefinition` Zod schema (reserved-key list, platform-key collision).
- Resolver-side: a custom def with `is_sensitive` / `admin_only` is *literally impossible* because those columns aren't on the table — defence in depth.

---

## 5. Resolver integration

`getFieldsForTalent` (`web/src/lib/server-actions/admin-taxonomy.ts:833`) becomes the single owner of merging platform + custom fields. Concretely:

### Step 5 (catalog loader) — add a 7th slice

Extend `loadTenantFieldCatalogUncached` (line 123):

```typescript
const [defsR, groupRowsR, allParentCategoryGroupsR,
       allRecsR, groupOverridesR, fieldOverridesR,
       customDefsR] = await Promise.all([
  // ... existing 6 slices ...
  svc.from("agency_field_definitions").select(
    "id, field_key, label, label_es, helper, placeholder, unit, kind, " +
    "options, validation_rules, default_visibility, show_in_public, " +
    "field_group_id, display_order, status, discover_searchable"
  ).eq("tenant_id", tenantId).eq("status", "published"),
]);
```

The query is tenant-scoped at source (`.eq("tenant_id", tenantId)`); the result is bundled into the cache slice under key `customDefs` and tagged with the same `field-catalog:${tenantId}` tag. Cache busts on any write to `agency_field_definitions` for that tenant.

### Step 7 (recommendations) — no change for v1

Custom fields without `agency_field_recommendations` are treated as **universal-by-tenant**: every talent on the tenant gets them. This is the simplest path and matches the most common use case ("Internal Booking Code" applies to every talent in the workspace).

If `agency_field_recommendations` is added (Phase 8.1 or later), the resolver runs an analogous aggregation over its rows and applies the strongest relationship just like platform recommendations.

### Step 8 (field loop) — append custom defs

Custom defs are processed in a second pass *after* platform defs, never merged into the same list before the visibility check:

```typescript
for (const cd of customDefs ?? []) {
  // Universal-by-tenant in v1 (or: if (recsByCustomField.has(cd.id)) ...)
  const tenantOv = customFieldOverrides.get(cd.id); // tenant overrides of own custom field
  const eff = effectiveFieldVisibility(
    {
      default_visibility: cd.default_visibility,
      show_in_public: cd.show_in_public,
      admin_only: false,        // platform floors do not apply to custom fields
      is_sensitive: false,
    },
    tenantOv ?? null,
    null  // valueOverride applied later, per talent value
  );
  resolved.push({
    ...standardShape(cd),
    is_custom: true,
    effective_visibility: eff,
    has_value: valuePresence.has(cd.id),
    tenant_override: !!tenantOv,
  });
}
```

### Where the tenant filter must hold

There are exactly **two** SELECT call sites on `agency_field_definitions`:

1. `loadTenantFieldCatalogUncached` — tenant-scoped via `.eq("tenant_id", tenantId)`.
2. Platform admin queue (governance UI) — uses a service-role client; *every* loader function must `.select("...").group_by("tenant_id")` and present per-tenant grouping. Code review checklist item: any new query against this table must include `tenant_id` in the WHERE *and* the query function must be either tenant-action-guarded or platform-admin-guarded.

A new lint rule (proposed; defer to Phase 8.1) flags any `from("agency_field_definitions")` SELECT that doesn't include `.eq("tenant_id", ...)`.

### Resolver output

`ResolvedField` adds two optional fields:

```typescript
type ResolvedField = {
  // ... existing fields ...
  is_custom?: boolean;            // true for agency_field_definitions rows
  custom_status?: 'published' | 'suspended';  // surfaces dormant state to UI
};
```

All existing consumers tolerate the new optional fields without code change (Phase 4 transparency panel and Phase 1 privacy drawer already follow this pattern).

---

## 6. Visibility — no new logic

Custom fields use **the same** `effectiveFieldVisibility` primitive. This is the single most important design decision in the doc.

What changes:
- Input `def` is constructed from `agency_field_definitions` columns instead of `profile_field_definitions`.
- Inputs `admin_only` and `is_sensitive` are **always false** for custom defs (they don't exist on the table) — the platform floor degenerates to "no floor". Tenant + value overrides operate normally.
- Output is identical (`"public" | "admin" | "hidden"`).

What does NOT change:
- The visibility primitive. No branches. No `is_custom` parameter.
- `canViewerSee`. No branches.
- The override columns on `workspace_profile_field_settings`. Tenant overrides on their own custom fields use the same table, the same row, the same precedence — see "Per-field tenant overrides" below.

### Per-field tenant overrides on custom fields

A tenant *can* override their own custom field's visibility (e.g. ship it as `default_visibility=['agency']` and later flip a single field to channel-`hidden` from the drawer). The override goes into `workspace_profile_field_settings`, the same place platform-field overrides live, keyed by `(tenant_id, field_definition_id)`. The `field_definition_id` column is intentionally *not* FK'd (see `engine-architecture.md` §2.1 — already noted in the values table); we accept the same lack of FK on the settings table.

A small concern: `workspace_profile_field_settings.field_definition_id` is currently FK to `profile_field_definitions`. We must either drop the FK or split the column. The recommendation is **drop the FK** (additive migration, no data movement) and rely on the resolver's catalog merge to determine which table the ID belongs to.

If we ever want hard referential integrity we can add a check constraint:
```sql
CHECK (
  EXISTS (SELECT 1 FROM profile_field_definitions WHERE id = field_definition_id)
  OR
  EXISTS (SELECT 1 FROM agency_field_definitions WHERE id = field_definition_id AND tenant_id = workspace_profile_field_settings.tenant_id)
)
```
…but row-level subquery constraints are expensive. **Defer.**

---

## 7. Plan-tier gate

```
Free      — read-only: a custom field defined before downgrade still resolves
            (for `published` ones), but the drawer's "Add custom field"
            and edit/submit/withdraw actions are disabled with the same
            honest-lock copy as today's Phase-2 lock card.
Studio    — read-only: same as Free.
Agency    — full: create, edit, submit, withdraw; submit triggers governance.
Network   — full: same as Agency.
```

Enforcement lives in **two places** for defence in depth:

1. **Server actions** (`agency_field_definitions` writers): `requireStaffTenantAction` → load tenant's `plan_tier` → reject if not `agency`/`network` with `error: "Custom fields require an Agency plan."`.
2. **UI** (`drawers.tsx` Catalog drawer): the existing `FIELD_PRIVACY_PLAN_RULES.canCreateCustom` flag (see `state.tsx:7030`) already encodes Agency/Network. We re-use it.

There is no data-model gating — the table stores published rows regardless of current plan. This means a tenant who downgrades and re-upgrades sees their old custom fields come back automatically (see §12).

---

## 8. Migration

Additive only. Two migrations, one timestamp each.

### Migration A — schema

```sql
-- supabase/migrations/<UTC>_p8_agency_field_definitions.sql

CREATE TABLE IF NOT EXISTS public.agency_field_definitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  field_key           text NOT NULL
                        CHECK (field_key LIKE 'custom.%' AND length(field_key) BETWEEN 8 AND 80),
  label               text NOT NULL,
  label_es            text,
  helper              text,
  placeholder         text,
  unit                text,
  kind                text NOT NULL CHECK (kind IN ('text','number','select',
                          'multiselect','chips','date','toggle','textarea')),
  options             jsonb,
  validation_rules    jsonb,
  default_visibility  text[] NOT NULL DEFAULT ARRAY['agency']::text[],
  show_in_public      boolean NOT NULL DEFAULT false,
  field_group_id      uuid REFERENCES public.profile_field_groups(id) ON DELETE SET NULL,
  display_order       int NOT NULL DEFAULT 100,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','submitted','approved',
                                          'rejected','published','suspended')),
  status_reason       text,
  discover_searchable boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  submitted_at        timestamptz,
  reviewed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  published_at        timestamptz,
  suspended_at        timestamptz,
  deprecated_at       timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, field_key)
);

CREATE INDEX IF NOT EXISTS agency_field_definitions_tenant_status_idx
  ON public.agency_field_definitions (tenant_id, status);
CREATE INDEX IF NOT EXISTS agency_field_definitions_status_idx
  ON public.agency_field_definitions (status)
  WHERE status IN ('submitted','published');

ALTER TABLE public.agency_field_definitions ENABLE ROW LEVEL SECURITY;

-- Read: tenant staff + platform admins.
CREATE POLICY afd_select_tenant_or_platform ON public.agency_field_definitions
  FOR SELECT USING (
    public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id)
  );

-- Write (INSERT/UPDATE): tenant staff for `draft`/`rejected` rows,
-- platform admins always. State transitions are policed by the server
-- action layer (the policy only enforces *who can write* — not which
-- columns or status transitions; those would be wrong to push into RLS).
CREATE POLICY afd_insert_tenant_or_platform ON public.agency_field_definitions
  FOR INSERT WITH CHECK (
    public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id)
  );
CREATE POLICY afd_update_tenant_or_platform ON public.agency_field_definitions
  FOR UPDATE USING (
    public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id)
  );

-- Delete: tenant staff only on `draft`/`rejected` rows; platform always.
CREATE POLICY afd_delete_tenant_or_platform ON public.agency_field_definitions
  FOR DELETE USING (
    public.is_platform_admin() OR (
      public.is_staff_of_tenant(tenant_id)
      AND status IN ('draft','rejected')
    )
  );

-- updated_at trigger (reuse the same trigger function as other tables).
CREATE TRIGGER set_updated_at_agency_field_definitions
  BEFORE UPDATE ON public.agency_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### Migration B — drop the FK on workspace_profile_field_settings.field_definition_id

```sql
-- supabase/migrations/<UTC>_p8_wpfs_drop_field_def_fk.sql

ALTER TABLE public.workspace_profile_field_settings
  DROP CONSTRAINT IF EXISTS workspace_profile_field_settings_field_definition_id_fkey;
```

(Verify the actual constraint name with `\d workspace_profile_field_settings` before authoring.)

This frees the column to reference *either* `profile_field_definitions.id` or `agency_field_definitions.id`. Both tables use UUID PKs from the same generator; collisions are cryptographically improbable.

### What this migration does NOT do

- No data movement.
- No changes to `profile_field_definitions`, `profile_field_recommendations`, `talent_profile_field_values`, or `workspace_field_group_settings`.
- No changes to any existing RLS policy. Phase 7a's tightening of `profile_field_definitions` writes stays untouched.
- No backfill, no triggers on existing tables.

### Per CLAUDE.md

- `npm run db:push` is part of the slice 1 commit.
- Unique UTC timestamps per agent.
- Migration is fully additive — `phase-1` continues to work if it's later reverted (the resolver code is gated by feature-detect: if `customDefs` slice is empty, behaviour is byte-identical to today).

---

## 9. UI

### Where the "Add custom field" button goes

Inside `WorkspaceFieldSettingsDrawer` (the Field Catalog drawer at `drawers.tsx:19913`), the existing honest-lock block at lines **20545–20566** ("Workspace-specific custom fields — coming soon") is replaced with a real, plan-tier-gated section.

Layout sketch (in the same drawer, after the platform-fields list, before the close):

```
┌─ Workspace-specific custom fields ─────────────────────┐
│  Defined by your workspace. Tulala-approved.           │
│                                                        │
│  [✦ Internal Booking Code]      published  •  text     │
│      "Used by ops only" • Hidden from public           │
│      ▸ Edit · Delete · View history                    │
│                                                        │
│  [✦ Studio of preference]       submitted  •  select   │
│      Awaiting Tulala review — typically <2 business    │
│      days.                                             │
│      ▸ Withdraw                                        │
│                                                        │
│  [✦ Wardrobe budget]            rejected   •  number   │
│      Reviewer note: "Use platform `rates.daily` —      │
│      mirroring an existing field."                     │
│      ▸ Edit · Delete                                   │
│                                                        │
│  ──────────────────────────────────────────────────    │
│            [ + Add custom field ]                      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

On `Free`/`Studio`, the section header is shown but the body is the honest-lock copy: *"Custom fields are an Agency-tier capability. Existing custom fields keep working — to add new ones or edit, upgrade to Agency."* No fake buttons.

### Create flow

A modal (or inline expanding form — TBD with UX) collects:

| Field | Required | Notes |
|---|:---:|---|
| Label | ✓ | 1–80 chars |
| Label (Spanish) | — | mirrors platform's `label_es` |
| Internal key | ✓ | auto-prefixed `custom.`, lowercase + underscore validation; collision-checked client-side and server-side |
| Field kind | ✓ | `text` / `number` / `select` / `multiselect` / `chips` / `date` / `toggle` / `textarea` |
| Options (for select/multiselect/chips) | conditional | repeated input rows |
| Validation (kind-specific) | — | `min/max` for number, `regex` for text, etc. |
| Helper text | — | shown under the input in the editor |
| Field group | — | choose from platform `profile_field_groups` (slug list) or "Ungrouped" |
| Default visibility | ✓ | three-state radio (Public / Workspace / Hidden) |
| Discover-searchable | ✓ | toggle, default OFF, with explanatory copy |

On submit:
1. Client-side check: `field_key` collision (against the catalog the drawer already has loaded).
2. Server action `submitCustomFieldDefinition(...)`:
   - Loads tenant + plan; rejects if not Agency/Network.
   - Validates key prefix, length, no reserved word.
   - Checks no platform `profile_field_definitions.field_key` collision (cheap; cached).
   - Inserts row with `status='submitted'`, `submitted_at=now()`.
   - Logs audit event (`subject_kind: 'custom_field'`, `operation: 'submit'`).
   - Returns `ok: true` with the new row ID.
3. Drawer optimistically updates the list with a `submitted` chip.

Tenant can move between `draft` and `submitted` freely:

- `draft → submitted`: explicit "Submit for review" button.
- `submitted → draft`: explicit "Withdraw" button. Allowed as long as platform hasn't acted (`reviewed_at IS NULL`).
- `rejected → draft`: editing a field with `status='rejected'` transitions it back to draft automatically.

### Edit/delete

- Drafts: full edit; delete allowed.
- Rejected: full edit (transitions to draft on first edit); delete allowed.
- Submitted: read-only except withdraw; delete blocked.
- Approved/Published: cosmetic edits only (label, helper, visibility, group, display_order, discover_searchable); kind/options/validation locked; delete blocked.
- Suspended: read-only; delete blocked.

Delete is only permitted when no `talent_profile_field_values` rows reference the custom field's ID. The server action checks this (`SELECT 1 FROM talent_profile_field_values WHERE field_definition_id = $1 LIMIT 1`) and returns a friendly error if values exist.

### View-history rail

If Phase 7b's History rail is shipped, custom-field events appear there interleaved with platform-field events, distinguished by `subject_kind: 'custom_field'` and a ✦ glyph.

---

## 10. Search and AI

**Default: excluded.** A new custom field is **not** included in:
- Discover directory facet filters
- Discover full-text search
- AI search ranking / embedding generation
- Any cross-tenant index

…unless the tenant explicitly flips `discover_searchable = true`.

**Why this is the default.**

1. **Search quality is a platform asset.** If every tenant's "Internal Studio Notes" field were indexed automatically, the relevance model would learn noise that doesn't generalise and that hurts every tenant's search.
2. **Custom fields trend toward operational, not discoverable data.** "Booking ID" is not a search facet — making it one wouldn't help discovery and would crowd the UI.
3. **PII risk.** A tenant may legitimately store data in a custom field that should not be globally searchable even though it's not technically PII (e.g. "Preferred Internal Coordinator"). Opt-in forces a deliberate decision.
4. **Schema fluidity.** Custom fields can change kind/options on cosmetic-edit; an auto-indexed field that the tenant later changes would silently degrade search.

**Opt-in mechanism.**

`agency_field_definitions.discover_searchable` is a boolean column. When `true`:
- Discover loaders (post-Phase-6) include this tenant's custom fields, tenant-scoped, in the facet query.
- The Discover UI shows the custom field as a facet under "Workspace fields" (label uses the tenant's `label` directly; group: "More from <workspace name>").
- AI embedding includes the value when generating talent embeddings (Phase 6/8 dependency — defer activation until search infra catches up).

**Opt-in UI.** Toggle in the create/edit form, with copy:

> "Show this field in Discover search and filters?
> Off — your field is invisible to clients searching the directory. On — clients can filter by this field's value. Off is the right answer for internal codes; on is the right answer for a public-facing detail like 'Favourite cuisine'."

**Hard rule re-stated.** `discover_searchable = true` does NOT loosen visibility. The resolver still checks `effectiveFieldVisibility`. A field marked `discover_searchable` but with `default_visibility=['agency']` is *facetable by name but not by value*; the Discover loader filters its values through the visibility primitive, exactly as it does for platform fields.

---

## 11. Audit

Every custom-field operation routes through the existing `logEngineAudit` helper (`web/src/lib/server-actions/engine-audit.ts`, Phase 7a). One new `subjectKind` value:

```typescript
export type EngineAuditSubjectKind = "field" | "group" | "category" | "custom_field";
```

The `engine_audit_log` table's `subject_kind` column is free-text (no CHECK constraint in the migration), so this is a pure-TypeScript change — no schema migration.

**Surfaces and operations:**

| Operation | Surface | Actor role | Before/After |
|---|---|---|---|
| Create draft | `field-catalog` | `agency_admin` | null / row |
| Edit draft | `field-catalog` | `agency_admin` | old row / new row |
| Submit for review | `field-catalog` | `agency_admin` | `{status:'draft'}` / `{status:'submitted'}` |
| Withdraw | `field-catalog` | `agency_admin` | `{status:'submitted'}` / `{status:'draft'}` |
| Approve | `field-catalog` | `platform_admin` | `{status:'submitted'}` / `{status:'approved'+published}` |
| Reject | `field-catalog` | `platform_admin` | `{status:'submitted'}` / `{status:'rejected',reason}` |
| Suspend | `field-catalog` | `platform_admin` | `{status:'published'}` / `{status:'suspended',reason}` |
| Unsuspend | `field-catalog` | `platform_admin` | `{status:'suspended'}` / `{status:'published'}` |
| Deprecate | `field-catalog` | `platform_admin` | `{deprecated_at:null}` / `{deprecated_at:now()}` |
| Set visibility (tenant override on own custom field) | `field-privacy` | `agency_admin` | (same shape as platform-field override) |
| Toggle discover_searchable | `field-catalog` | `agency_admin` | `{discover_searchable:old}` / `{discover_searchable:new}` |
| Delete | `field-catalog` | `agency_admin` | row / null |

`subject_key` is set to the `field_key` (e.g. `custom.internal_booking_code`) for human-readable history rendering. `subject_id` is the `agency_field_definitions.id` UUID.

The audit log's RLS (`engine_audit_log_tenant_select`) already filters by `tenant_id`, so tenant staff see their own custom-field history; platform admins see everyone's via `is_platform_admin()`.

---

## 12. Downgrade behaviour

When a workspace's `plan_tier` moves from `agency`/`network` to `studio` or `free`:

| Aspect | Behaviour |
|---|---|
| Existing published custom fields | **Continue to resolve** for all talents on that tenant — read path unchanged. |
| Existing values in `talent_profile_field_values` | **Preserved**. No data movement. |
| Talent editor (admin shell) | Custom fields appear as **read-only** rows with a chip "Read-only on this plan — upgrade to edit values". |
| Drawer "Add custom field" / edit / submit / withdraw | **Disabled** with the honest-lock copy. |
| Pending submissions (`status='submitted'`) | Auto-withdrawn to `status='draft'` on downgrade. (Server-side hook on tenant plan change; or surfaced as a banner in the platform review queue with a "tenant downgraded — withdraw" affordance — TBD; see Open Question 4.) |
| Public profile rendering | **Continues** for `published` custom fields with `effectiveVisibility === 'public'`. Downgrade doesn't hide public-facing custom data; that would be data-loss-shaped. |
| Discover-searchability for `discover_searchable=true` custom fields | **Continues** — the tenant chose this; downgrade doesn't unilaterally reverse it. |
| Upgrade back to Agency | All custom fields automatically re-editable; nothing to restore. |

**Why preserve, not delete.** Downgrading is reversible. Customers churn between plans. Forcing them to re-enter a year of "Internal Booking Code" values on re-upgrade would be hostile. The plan tier gates *capability* (creating, editing), not *data*.

**Implementation.** A pure UI/server-action gate. No data-model change. The `plan_tier` is read at write-action time (we already do this for `roster-seat-limit`); same pattern, different capability.

---

## 13. Rollback

Phase 8 is fully reversible. The order of operations on revert:

1. Disable the UI section in `drawers.tsx` (replace with the prior honest-lock block). This stops new submissions.
2. Revert the resolver change in `admin-taxonomy.ts` (remove the `customDefs` slice and the second-pass loop in `getFieldsForTalent`). The resolver now ignores `agency_field_definitions` entirely.
3. The migration can be reverted in either order:
   - Drop FK migration (B): re-add the FK on `workspace_profile_field_settings.field_definition_id` — only safe if no tenant overrides on custom fields exist. Defensive: `DELETE FROM workspace_profile_field_settings WHERE field_definition_id NOT IN (SELECT id FROM profile_field_definitions);`
   - Schema migration (A): `DROP TABLE public.agency_field_definitions CASCADE;` (CASCADE removes the table cleanly; no other table references it once Migration B is reverted).
4. `talent_profile_field_values` rows that referenced the custom fields are orphaned (no FK). They sit harmlessly because the resolver never sees them — no def, no resolution. Cleanup pass optional: `DELETE FROM talent_profile_field_values WHERE field_definition_id NOT IN (SELECT id FROM profile_field_definitions);`

**Graceful degradation if the table is missing.** The catalog loader uses `Promise.all`; if the 7th slice errors (table doesn't exist), `loadTenantFieldCatalogUncached` returns null and `getFieldsForTalent` falls back to its per-call query path. We extend the fallback to also handle the absent table (try/catch around the 7th query → empty array). Result: removing the table does not break the engine.

**Audit log retained.** `engine_audit_log` rows with `subject_kind='custom_field'` are not cleaned up on rollback. Their `subject_id` becomes a dangling UUID, but the human-readable `subject_key` remains useful for any forensic review. Same pattern as deprecated platform fields today.

---

## 14. Open questions / decisions

**1. Approval gate granularity — per-field or per-tenant trust grade?**

- Option A: Every custom field requires platform-admin approval on every submission. (Default lean.)
- Option B: Tenants accumulate trust. After N approved fields with no rejections / no abuse, the tenant gets "fast-track" status — submissions auto-publish, but every submission is still audited and platform admins can rescind.
- **Recommendation:** A for v1; revisit at month 3 of usage based on review-queue throughput.
- **Decision needed before** building the governance UI (slice 5).

**2. Scope mechanism — universal-by-tenant, or recommendations table?**

- Option A: Every custom field applies to every talent on the tenant. (Simpler; matches most use cases.)
- Option B: Add `agency_field_recommendations` and let tenants target specific talent types.
- **Recommendation:** A for v1 (ship faster, observe real demand); add B as Phase 8.1 if requested. Many tenants are mono-type (e.g. a fashion-only agency) and don't need targeting.
- **Decision needed before** writing the resolver step (slice 2).

**3. Edit-after-publish: what's tenant-editable without re-review?**

- Recommendation in §3 table: label / helper / placeholder / visibility / group / display_order / discover_searchable are cosmetic edits that don't require re-review. Kind / options / validation are schema-impacting and require deprecate-and-replace.
- **Alternative:** allow cosmetic edits with a quiet platform-admin notification ("Tenant X changed the label of their custom field Y from A to B") that platform can revert if abusive.
- **Decision needed for** the edit-state behaviour in the drawer (slice 4).

**4. What happens to a pending submission when the tenant downgrades from Agency?**

- Option A: Auto-withdraw to `draft`. Tenant must re-submit on re-upgrade.
- Option B: Hold the submission; show a banner to platform reviewers "tenant downgraded — review anyway?"
- Option C: Auto-reject with reason "tenant plan changed".
- **Recommendation:** A. Cleanest. Re-submission is one click on re-upgrade.

**5. `discover_searchable=true` enforcement on platform side.**

- Should there be a platform veto? E.g. tenant flips it on but it's an obviously-internal field — does platform get to override?
- **Recommendation:** Platform admin can flip it back to false during review or via suspension. No new mechanism needed.
- **Decision needed before** the search opt-in slice (slice 7).

**6. Talent-side visibility on custom fields.**

- Custom fields default to `default_visibility=['agency']` — invisible to the talent themselves until tenant flips them to a talent-visible channel. **Confirm** that's the right default (vs. default-visible-to-talent and explicit-hide).
- **Recommendation:** default agency-only. Most custom fields will be operational/internal; defaulting them visible to the talent (who didn't request them) creates noise on the talent profile page.

**7. Field group ownership: can a tenant create a custom group too, or are they limited to platform groups?**

- v1: limited to platform groups (or "Ungrouped"). Custom groups would multiply the surface area (group RLS, group governance, group label conflicts).
- **Recommendation:** stick with v1; tenant-defined groups are a Phase 8.2 if asked for.

**8. Per-row Spanish translation.**

- We ship `label_es` on `agency_field_definitions` for symmetry. Should we also gate this behind `tenant.locale` settings, or just always store it if the tenant provides it?
- **Recommendation:** always store; render conditionally by `Accept-Language` like the platform `label_es` is rendered.

**Top three the user must decide first (gating slices 2 + 4 + 5):**

1. **#1 — approval gate granularity (per-field for v1, or trust-tier?).** Gates slice 5 (governance UI).
2. **#2 — scope mechanism (universal-by-tenant, or recommendations?).** Gates slice 2 (resolver wiring).
3. **#4 — pending-submission behaviour on downgrade.** Gates slice 5 (governance UI) and the §12 downgrade behaviour.

---

## 15. Implementation plan — slices

Each slice is path-scoped, gate-validated (tsc 0 + lint baseline + targeted unit test where applicable), and committed without push per branch governance. `npm run db:push` is part of slice 1's commit per CLAUDE.md.

### Slice 1 — Migration + schema (~3h)

**Files:**
- `supabase/migrations/<UTC>_p8_agency_field_definitions.sql` (Migration A from §8).
- `supabase/migrations/<UTC>_p8_wpfs_drop_field_def_fk.sql` (Migration B).
- `npm run db:push` per CLAUDE.md.

**Acceptance:** tables/constraints/RLS exist on remote; `\d agency_field_definitions` matches spec; `INSERT … VALUES (status='approved') → CHECK violation` (only `draft|submitted|approved|rejected|published|suspended`); `INSERT … VALUES (field_key='not_prefixed')` → CHECK violation; same-tenant staff can SELECT/INSERT (tested via scoped client), other-tenant staff cannot SELECT.

**Risk:** low. Pure additive DDL. Rollback is one DROP TABLE.

### Slice 2 — Resolver integration (~4h)

**Files:**
- `web/src/lib/server-actions/admin-taxonomy.ts` — `loadTenantFieldCatalogUncached` gains a 7th slice; `getFieldsForTalent` Step 8 gains a second pass for custom defs.
- `web/src/lib/field-engine/effective-visibility.ts` — **no change** (custom-field inputs construct `def` with `admin_only:false, is_sensitive:false`).
- `web/src/lib/server-actions/admin-taxonomy.ts` — `ResolvedField` gains optional `is_custom?` and `custom_status?` fields.
- Unit test: `effective-visibility.test.ts` — add 6 rows to the matrix for custom-field inputs.

**Acceptance:** with one `published` custom field on Tenant A, `getFieldsForTalent` for an A-roster talent includes it as `is_custom: true`; same call on a B-roster talent does not include it; Phase 4 transparency panel renders the custom-field row with the ✦ glyph; cache busts on insert of a new published row.

**Risk:** medium (touches the hot resolver). Mitigation: feature-detect on missing table (try/catch around 7th slice) so the resolver is byte-identical to today if `agency_field_definitions` is empty or absent.

**Blocker:** Slice 1 must be applied to the dev DB first. Resolver code is no-op until rows exist.

### Slice 3 — Tenant authoring server actions (~3h)

**Files (new):**
- `web/src/lib/server-actions/admin-custom-fields.ts` — `getCustomFieldDefinitions`, `createDraftCustomFieldDefinition`, `updateDraftCustomFieldDefinition`, `submitCustomFieldDefinition`, `withdrawCustomFieldDefinition`, `deleteCustomFieldDefinition`, `toggleCustomFieldDiscoverable`.

Every action:
- `requireStaffTenantAction()` + plan-tier check (rejecting non-Agency).
- Zod validation (reserved-key list, prefix, kind enum, options shape).
- Platform-key collision check against the cached catalog.
- `logEngineAudit({ subjectKind: 'custom_field', ... })`.
- `revalidateTag('field-catalog:<tenantId>')` on any state change.

**Acceptance:** unit tests for each action covering happy path + 3 failure modes (auth, plan-tier, reserved-key); manual QA on dev tenant.

**Risk:** low. Mirrors the existing `admin-workspace-field-settings.ts` pattern.

### Slice 4 — Drawer UI (~4h, drawers.tsx-coupled)

**Files:**
- `web/src/components/admin/shell/internal/drawers.tsx` — replace honest-lock block at lines 20545–20566 with the Custom Fields section; add Create modal/inline form; wire to slice-3 actions.
- `web/src/components/admin/shell/internal/state.tsx` — no change (`canCreateCustom` already exists).

**Acceptance:** browser QA on dev tenant: create draft → submit → see in list with `submitted` chip → withdraw → re-submit → admin approves (via slice 5 surface) → list shows `published`; downgrade tenant in dev DB → drawer becomes read-only with honest-lock copy.

**Risk:** medium (drawers.tsx is contested; per `talent-engine-status-2026-05-18.md` it gets exclusive write windows). Mitigation: do not commit unless `drawers.tsx` is uncontested at slice start; rebase + re-gate before merging.

### Slice 5 — Platform governance flow (~5h)

**Files (new):**
- `web/src/app/(workspace)/platform/custom-fields/page.tsx` — platform-admin-gated route; lists submissions across all tenants; shows the create-context (tenant name, plan tier, similar platform fields, key-collision check), and Approve / Reject (with reason) buttons.
- `web/src/lib/server-actions/platform-custom-fields.ts` — `listSubmissions`, `approveCustomFieldDefinition`, `rejectCustomFieldDefinition`, `suspendCustomFieldDefinition`, `unsuspendCustomFieldDefinition`, `deprecateCustomFieldDefinition`. All gated by platform-admin role.

Each action:
- Service-role client (no tenant context) or platform-admin RLS.
- State-machine guard (e.g. `approve` rejects unless current `status='submitted'`).
- `logEngineAudit` with `actorRole='platform_admin'`.

**Acceptance:** route is gated (non-platform-admin → 404); approve flips `status` to `approved` + sets `published_at`; reject sets `rejected` + `status_reason`; suspend sets `suspended` + `status_reason`; in all cases tenant sees state change in their drawer on next load.

**Risk:** medium. New platform-admin route, but Phase 9A already established the pattern.

### Slice 6 — (Optional) recommendations table (~3h)

**Files:**
- `supabase/migrations/<UTC>_p8_agency_field_recommendations.sql` — table from §2.
- `web/src/lib/server-actions/admin-taxonomy.ts` — extend Step 7 to aggregate over `agency_field_recommendations` for custom fields.
- Drawer UI add talent-type picker (multi-select against `taxonomy_terms` levels 2 + 3, filtered to tenant's enabled types).

**Defer** unless Open Question #2 is decided in favour of B. Skip in v1.

### Slice 7 — Search/AI opt-in (~3h)

**Files:**
- Discover loaders (`fetch-directory-page.ts`, `apply-directory-field-facet-filters.ts`) post-Phase-6: include `agency_field_definitions WHERE tenant_id IN (...)` joined to `talent_profile_field_values` filtered by `discover_searchable=true`.
- Drawer toggle wires to slice-3 `toggleCustomFieldDiscoverable`.

**Acceptance:** with `discover_searchable=true` on a tenant's custom field, the field appears in Discover facets for that tenant's talents only; with `false`, it does not.

**Risk:** medium. Depends on Phase 6 (Discover canonical) shipping first. Defer activation if Phase 6 isn't ready.

### Slice 8 — Plan-downgrade hook + audit polish (~2h)

**Files:**
- The plan-tier writer (wherever `agencies.plan_tier` is set — `web/src/lib/saas/...`) gains a post-write hook that, on downgrade from `agency`/`network`, auto-withdraws any `status='submitted'` rows (sets back to `draft`) and logs an `actor_role='system'` audit event.
- `engine-audit.ts` TS type widened: `EngineAuditSubjectKind` adds `"custom_field"`.

**Acceptance:** unit tests for the downgrade auto-withdraw; audit row appears with `actor_role='system'`.

**Risk:** low.

---

## Effort summary

| Slice | Effort (serial IC) | Blocker |
|---|---|---|
| 1 — Migration + schema | ~3h | `npm run db:push` approval |
| 2 — Resolver integration | ~4h | slice 1; uncontested admin-taxonomy.ts window |
| 3 — Tenant authoring server actions | ~3h | slice 1 |
| 4 — Drawer UI | ~4h | slice 3; uncontested drawers.tsx window |
| 5 — Platform governance flow | ~5h | slice 1, slice 3 |
| 6 — (Optional) recommendations table | ~3h (defer) | Open Question #2 = B |
| 7 — Search/AI opt-in | ~3h | Phase 6 shipped |
| 8 — Plan-downgrade hook + audit polish | ~2h | slice 3 |

**Total v1 (slices 1–5, 8):** ~21h serial. Plus QA cycles (~4–6h across slices). Plus slice 7 (~3h) once Phase 6 lands. Slice 6 deferred unless decision flips.

**Critical path:** slice 1 → slice 2/3 (parallelizable) → slice 4 + 5 (parallelizable, both depend on 3) → slice 8.

---

## Cross-links

- [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) §Phase 8 — the mandate this doc implements.
- [`engine-architecture.md`](engine-architecture.md) §2 (data model), §3 (resolver flow), §4 (visibility engine), §9 (caching), §11 (known debt).
- [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) — concurrent-work blockers; multi-agent coordination protocol; Phase 8 sits in workstream **G** (tail after B/C/D).
- `web/src/lib/server-actions/admin-workspace-field-settings.ts` — the pattern Phase 8 server actions mirror.
- `web/src/lib/server-actions/admin-taxonomy.ts:833` (`getFieldsForTalent`) — the resolver Phase 8 integrates into.
- `web/src/lib/field-engine/effective-visibility.ts` — unchanged by Phase 8; this is the design's central claim.
- `supabase/migrations/20260520044731_engine_audit_log.sql` — the audit table Phase 8 reuses (`subject_kind` is free-text so no schema change needed).
- `web/src/lib/server-actions/engine-audit.ts` — `logEngineAudit` helper; widen the `EngineAuditSubjectKind` union.

---

*Doc only. No code, no migration, no DB push in this commit.*
