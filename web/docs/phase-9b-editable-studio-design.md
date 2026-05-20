# Phase 9B — Editable Platform Catalog Studio (Design Doc)

> **Status:** design / decision doc, no code yet.
> **Branch:** `engine-phase9b-design-doc` (off `phase-1` tip).
> **Companion docs:** [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) §Phase 9B (the mandate); [`engine-architecture.md`](engine-architecture.md) (data model, resolver flow, visibility primitive); [`phase-8-custom-fields-design-2026-05-19.md`](phase-8-custom-fields-design-2026-05-19.md) (governance state-machine conventions); [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) §Path to Done (workstream H — *hard-gated*).
> **Hard prerequisites:** P0 (private files RLS), P1 (privacy real), P2 (catalog real), P3 (public resolver-gated), P5 (one value store), P6 (Discover canonical), P7 (audit + cache). 9B writes *global* truth that fans out to every tenant — start only after all of them.

---

## 1. Goal and non-goals

**Goal.** Let a Tulala platform admin redesign the **platform** catalog — relabel a field, change its defaults, mark it sensitive, move it between groups, add or remove a talent-type recommendation, deprecate it, or create a new platform field — via a **change-set → impact-preview → publish → rollback** workflow with full audit. Every edit is reversible, every edit is observed before it ships, every edit is logged, and every edit fans out through the existing resolver without bespoke surface logic.

**Concretely, 9B owns the mutations of these tables:**

- `profile_field_definitions` — the platform field catalog
- `profile_field_groups` — the 13 reusable field bundles
- `profile_field_recommendations` — which fields apply to which talent types (the only field × taxonomy link)
- `parent_category_field_groups` — which groups auto-load per parent category

…via the **change-set abstraction only**. Direct UPDATE/INSERT/DELETE against these tables (outside migrations) becomes a code-review red flag once 9B is the canonical path. RLS already constrains writes to platform admins for `profile_field_definitions` (commit `3e939fcf3`) and `profile_field_recommendations` (commit `20a5b654b`); 9B routes those writes through one auditable lane.

**Non-goals (explicit boundary).**

- **Not for agency-specific overrides.** Per-tenant relabel, enable/disable, required-override, visibility override → that is Phase 1 (`workspace_profile_field_settings`) and Phase 2. A platform admin who wants to relabel a field *just for one agency* uses the Phase 1/2 surfaces, not 9B.
- **Not for tenant-owned custom fields.** Custom fields live in `agency_field_definitions` and are governed by Phase 8's submit/approve/publish flow. 9B does not touch `agency_field_definitions` — see §11 for the boundary.
- **Not a free-form SQL surface.** A 9B operator cannot run arbitrary SQL; the allowed ops are a strict whitelist (§3).
- **Never destructive.** No op deletes a field, renames a `field_key`, or changes a field's `kind`. See §3 (NEVER list) and §11 (hard rules).
- **Not for the canonical/reserved fixed-schema columns.** Fields hard-coded in `web/src/lib/field-canonical.ts` (identity, stage_name, etc.) are immutable from 9B.
- **Not the value-history audit.** Value-level mutations remain in `talent_profile_field_value_history` (existing trigger). 9B audits *control-plane* edits via `engine_audit_log` (Phase 7).

**What "premium SaaS" means for this phase.** Every change is (a) **previewed** against real data — "1,427 talent values will be hidden from public", (b) **published atomically** — no partially-applied change-set ever exists in published state, (c) **rolled back atomically** — one click reverses a published change-set entirely, (d) **fully audited** — every op leaves an `engine_audit_log` row with before/after JSONB, (e) **reversible by design** — no destructive primitive exists.

---

## 2. Change-set model — schema

Two new tables, both additive. Naming mirrors Phase 7 (`engine_audit_log` → `engine_change_sets` + `engine_change_set_ops`) so the platform admin surface reads as a coherent "engine ops" family.

### 2.1 `engine_change_sets` — the header

```sql
CREATE TABLE public.engine_change_sets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary               text NOT NULL,                  -- 1-line human description
  description           text,                           -- optional long-form context
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','publishing','published',
                                            'failed','rolled-back')),
  author_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Publish
  published_at          timestamptz,
  published_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  publish_error         text,                           -- non-null when status='failed'

  -- Rollback
  rolled_back_at        timestamptz,
  rolled_back_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rolled_back_reason    text,

  -- Cached impact at last `validate` — refreshed each time a draft is
  -- validated; used by the UI to show stable counts after the impact
  -- engine ran. Source of truth is always the recomputation.
  last_validated_at     timestamptz,
  last_impact_summary   jsonb                           -- see §4
);

-- Hot index: draft + recently-published lists.
CREATE INDEX engine_change_sets_status_idx
  ON public.engine_change_sets (status, created_at DESC);

ALTER TABLE public.engine_change_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY engine_change_sets_platform_select
  ON public.engine_change_sets FOR SELECT
  USING (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies — writes go through the service-role
-- client driven by platform-admin-gated server actions. Mirrors the
-- engine_audit_log pattern: append-only-ish, only the service role
-- mutates.
```

### 2.2 `engine_change_set_ops` — the line items

```sql
CREATE TABLE public.engine_change_set_ops (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_set_id       uuid NOT NULL REFERENCES public.engine_change_sets(id) ON DELETE CASCADE,
  ordinal             int  NOT NULL,                    -- apply order within set (1..N)
  op_kind             text NOT NULL CHECK (op_kind IN (
                          'relabel_field',
                          'change_field_defaults',
                          'move_field_to_group',
                          'add_recommendation',
                          'remove_recommendation',
                          'change_recommendation_strength',
                          'deprecate_field',
                          'undeprecate_field',
                          'create_field',
                          'relabel_group',
                          'change_group_active',
                          'create_group',
                          'attach_group_to_category',
                          'detach_group_from_category'
                        )),

  -- What is touched
  subject_kind        text NOT NULL CHECK (subject_kind IN (
                          'field','group','recommendation','category_group_link'
                        )),
  subject_id          uuid,                             -- nullable for create_* ops
  subject_key         text,                             -- field_key / group slug for readability

  -- The change
  before_value        jsonb,                            -- pre-state snapshot; null for create_*
  after_value         jsonb,                            -- post-state target; null for delete-ish (remove_recommendation, deprecate)

  -- Apply / rollback metadata
  applied_at          timestamptz,                      -- non-null once successfully applied
  apply_error         text,                             -- non-null if this op caused publish to fail
  reverted_at         timestamptz,                      -- non-null once rollback has reverted this op

  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (change_set_id, ordinal)
);

CREATE INDEX engine_change_set_ops_set_idx
  ON public.engine_change_set_ops (change_set_id, ordinal);

-- Subject index: useful for "show me every pending op touching this field"
CREATE INDEX engine_change_set_ops_subject_idx
  ON public.engine_change_set_ops (subject_kind, subject_id);

ALTER TABLE public.engine_change_set_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_change_set_ops_platform_select
  ON public.engine_change_set_ops FOR SELECT
  USING (public.is_platform_admin());
-- Writes via service role only.
```

**Why both `subject_id` and `subject_key`?** `subject_id` is the canonical UUID; `subject_key` is the denormalized human handle (field_key, group slug). Mirrors `engine_audit_log` (Phase 7) so a deprecated/replaced field's history still renders without joining a possibly-deleted row.

**Why ordinal-and-not-array?** Two reasons. (a) Each op is an independent row that the impact-preview engine can aggregate over with a single SELECT. (b) Apply order matters and `applied_at` per row lets us know exactly how far publish got if the transaction fails.

**Why `before_value` and `after_value` as `jsonb`?** The same shape philosophy as `engine_audit_log`: a structured-but-flexible record of what changed. The exact shape is op-kind-specific (see §3); the resolver code that interprets these is the only consumer.

---

## 3. Allowed ops

Strict whitelist. Each op is reversible. Each `before_value` is captured at publish time (not at draft time) to avoid race-with-other-platform-edits.

### 3.1 Whitelist with op specs

| `op_kind` | Target table | `before_value` shape | `after_value` shape | Reversibility |
|---|---|---|---|---|
| `relabel_field` | `profile_field_definitions` | `{label, label_es, helper, placeholder, unit, display_order}` | same shape | UPDATE-back |
| `change_field_defaults` | `profile_field_definitions` | `{default_visibility, is_optional, show_in_public, admin_only, is_sensitive}` | same shape | UPDATE-back |
| `move_field_to_group` | `profile_field_definitions` | `{field_group_id}` | `{field_group_id}` | UPDATE-back |
| `add_recommendation` | `profile_field_recommendations` | `null` | `{field_definition_id, taxonomy_term_id, relationship, display_order, required_at_registration, required_before_publish, required_before_verification, is_admin_only, requires_verification}` | DELETE the inserted row |
| `remove_recommendation` | `profile_field_recommendations` | full row snapshot | `null` | INSERT from `before_value` |
| `change_recommendation_strength` | `profile_field_recommendations` | `{relationship, required_*…}` | same shape | UPDATE-back |
| `deprecate_field` | `profile_field_definitions` | `{deprecated_at: null}` | `{deprecated_at: <publish_at>}` | UPDATE deprecated_at to null |
| `undeprecate_field` | `profile_field_definitions` | `{deprecated_at: <ts>}` | `{deprecated_at: null}` | UPDATE-back |
| `create_field` | `profile_field_definitions` (+ optional recs) | `null` | full insert payload | Soft-revert via deprecate_field on rollback (see §6) |
| `relabel_group` | `profile_field_groups` | `{name_en, name_es}` | same shape | UPDATE-back |
| `change_group_active` | `profile_field_groups` | `{is_active}` | `{is_active}` | UPDATE-back |
| `create_group` | `profile_field_groups` | `null` | full insert payload | Rollback sets `is_active=false`; only hard-delete if no fields reference it |
| `attach_group_to_category` | `parent_category_field_groups` | `null` | row payload | DELETE on rollback |
| `detach_group_from_category` | `parent_category_field_groups` | full row | `null` | INSERT on rollback |

### 3.2 NEVER list (codified — there is no UI affordance, no server action)

These intents are redirected, never executed:

- **`DELETE field`** → redirect to `deprecate_field`. The field row stays; the resolver excludes deprecated definitions (`engine-architecture.md` §3 step 5). Values are never destroyed.
- **`Rename field_key`** → blocked. `field_key` is the immutable identity of the field. Every consumer keys off it (legacy bridge `NEW_TO_OLD_KEY`, public-profile sidebar gate, talent-self resolver, stored values reference it indirectly via `field_definition_id`). A rename is effectively a deprecate-and-create-new (which 9B supports as two separate ops in one change-set).
- **`Change kind`** (e.g. `text` → `number`) → blocked. Stored JSONB values were written for the old kind; changing the kind would silently corrupt every existing value. The redirect is: `deprecate_field` + `create_field` with the new kind + (out of 9B scope) a migration that backfills values across kinds. The migration is an explicit DBA action, not a 9B op.
- **`Change field_key prefix`** (`identity.legal_name` → `legal.name`) → blocked. Same reason as rename.
- **`Touch a reserved/canonical key`** — fields enumerated in `web/src/lib/field-canonical.ts` (`stage_name`, `primary_type`, etc.) are excluded from every op kind. Server action validates `subject_id` against the reserved list and rejects.
- **`Change profile_field_groups.slug`** → blocked. Consumers (the legacy `public-profile-field-visibility.ts` gate, custom-field tenants who chose this group) key off the slug.
- **`Insert tenant-owned data via 9B`** → blocked. 9B never writes to `agency_field_definitions`, `workspace_profile_field_settings`, `workspace_field_group_settings`, or any tenant-scoped table. Phase 8 is the only path for tenant-owned definition writes.

### 3.3 What an op's `after_value` looks like for the impact engine

For ops that affect visibility (`change_field_defaults`, `deprecate_field`), the `after_value` is enough to re-run `platformBaseVisibility` and `effectiveFieldVisibility` for each tenant — meaning the impact engine never has to mutate anything to know what would happen.

---

## 4. Impact preview engine

The impact preview is computed by a single server function `computeChangeSetImpact(changeSetId)` that runs on every "Validate" click in the composer and is the gating signal for the publish button.

### 4.1 What it computes — per op

For each `engine_change_set_ops` row in the draft, the engine answers six questions:

| Signal | How it's computed | Reuses Phase 9A? |
|---|---|---|
| **# talent values touched** | `SELECT count(*) FROM talent_profile_field_values WHERE field_definition_id = $subject_id AND workflow_state = 'live'` | Same query shape as `loadPlatformCatalogMap` value-count |
| **# workspaces overriding** | `SELECT count(*) FROM workspace_profile_field_settings WHERE field_definition_id = $subject_id` | Same as `loadPlatformCatalogFieldDetail.total_override_count` |
| **# publicly-displaying talents (before → after)** | Re-run `effectiveFieldVisibility(def, tenantOverride)` per tenant against the *after_value*; sum live-value-count where `eff === 'public'` | Builds on `loadTenantCatalogPosture.fieldOverrides` |
| **# talent types affected** | For recommendation ops: `subject_id` is the rec row; for field-default ops: count `taxonomy_terms` reachable via `profile_field_recommendations.field_definition_id = $subject_id` | Same query path as resolver §3 step 4–7 |
| **# Discover surfaces affected** | If `change_field_defaults` flips visibility public→non-public on a field that has Discover-bridge entries (legacy `NEW_TO_OLD_KEY` until Phase 5 fully retires it; canonical Discover after Phase 6), surface it explicitly | New |
| **# Conflicting ops in this set** | Two ops with same `(subject_kind, subject_id)`; or two ops with conflicting after_values (e.g. `change_field_defaults: admin_only=true` and `change_field_defaults: show_in_public=true` for same field) | New (in-set scan) |

### 4.2 Aggregated change-set summary

```typescript
type ChangeSetImpact = {
  ops: OpImpact[];
  totals: {
    fieldsAffected: number;            // distinct field_definition_id touched
    groupsAffected: number;            // distinct group_id touched
    recommendationsAdded: number;
    recommendationsRemoved: number;
    deprecations: number;
    creations: number;
    // Cross-cutting fan-out
    workspacesAffected: number;        // distinct tenant_ids overriding any touched field
    talentValuesAffected: number;      // sum across all touched fields
    publiclyDisplayingTalentsBefore: number;
    publiclyDisplayingTalentsAfter: number;
    // Conflicts
    conflicts: ChangeSetConflict[];
  };
  risk: 'low' | 'medium' | 'high' | 'blocked';
  computedAt: string;                  // ISO timestamp
};

type ChangeSetConflict = {
  kind: 'duplicate_subject' | 'visibility_contradiction' |
        'reserved_key' | 'kind_change_attempt' | 'rename_attempt' |
        'unresolved_after_value';
  opIds: string[];                     // the offending op rows
  detail: string;                      // human-readable
};
```

### 4.3 Risk-score heuristic

```
low:
  - relabel_field (label / helper / placeholder only)
  - relabel_group
  - undeprecate_field
  - change_recommendation_strength (downgrade only: required → recommended → applies)
  - create_group with is_active=false
  - attach_group_to_category for a brand-new group (no fields yet)

medium:
  - change_field_defaults that doesn't loosen visibility
    (platform-floors stay; tenant overrides still ride the most-restrictive-wins rule)
  - move_field_to_group
  - add_recommendation (new talents will see new field)
  - change_recommendation_strength (upgrade: applies → recommended → required)
  - create_field (no values, no overrides yet — but new field will surface in editors)
  - create_group with is_active=true
  - detach_group_from_category

high:
  - change_field_defaults that loosens visibility (admin → public)
    even though tenant overrides + platform floor will clamp it,
    the platform DEFAULT changing affects every tenant without an override
  - change_field_defaults that sets is_sensitive=true or admin_only=true
    on a field currently displayed publicly — public-facing data will be hidden
  - deprecate_field with > 0 stored values (orphans values; preserved but resolver excludes)
  - remove_recommendation that drops the last talent_type for a field
    (the field becomes a dead type-specific field per resolver §3 step 8)
  - any op affecting > 1000 talent values

blocked (publish refuses):
  - any ChangeSetConflict
  - any op referencing a reserved/canonical field_key
  - any op that would result in a CHECK-constraint violation post-apply
    (caught by dry-run)
```

The UI surfaces the risk score next to the Publish button. `low` publishes with no confirmation modal. `medium` requires a checkbox acknowledgement. `high` requires the user to type the change-set's summary text to confirm. `blocked` greys out Publish entirely and lists the conflicts inline.

### 4.4 Reusing Phase 9A

The 9A loaders (`catalog-map-data.ts`, `catalog-field-detail-data.ts`, `tenant-catalog-data.ts`) already do the heavy aggregate work:

- `loadPlatformCatalogFieldDetail(fieldKey)` returns `total_value_count`, `total_override_count`, `tenants_with_values`, and per-workspace breakdown — that's most of the "# talent values touched", "# workspaces overriding", and "publicly-displaying" math, scoped to one field.
- `loadPlatformCatalogMap()` provides the aggregate baseline so the UI can show "this change affects 3 of 412 platform fields".
- `loadTenantCatalogPosture(tenantId)` lets the user drill in to "show me how Agency X is affected".

The impact engine is a thin orchestrator over these: for each op, call the relevant 9A loader; aggregate the result; compute risk. **No new heavy queries.** The single new SELECT is the conflict scan within the change-set's own ops (cheap — O(N) over the ops table).

### 4.5 When the impact is computed

- **On every "Validate" click** in the composer — runs synchronously, refreshes `last_impact_summary` JSONB on the change-set.
- **Before publish** — re-runs, even if `last_impact_summary` is fresh, to defeat racing platform-admin edits.
- **Never on draft save** (would be expensive per keystroke); the user explicitly clicks Validate.

---

## 5. Publish flow — atomic apply

### 5.1 The atomicity question

Supabase exposes Postgres but does **not** wrap REST calls in a single transaction. A naive "for each op, run UPDATE" loop has a half-applied-mid-failure window. The clean fix: a PL/pgSQL function that does the whole apply server-side in one transaction.

**Decision: ship Phase 9B with a `publish_change_set(p_id uuid, p_actor uuid)` PL/pgSQL function.** The server action validates auth + computes impact + invokes the function via the service-role client. The function is the only place where the canonical tables are written, by design.

```sql
CREATE OR REPLACE FUNCTION public.publish_change_set(
  p_change_set_id uuid,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the function owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  v_set    public.engine_change_sets%ROWTYPE;
  v_op     public.engine_change_set_ops%ROWTYPE;
  v_now    timestamptz := now();
  v_result jsonb := '{"ok":true,"applied":0,"errors":[]}'::jsonb;
BEGIN
  -- Lock the change-set row to prevent concurrent publish on same set.
  SELECT * INTO v_set FROM public.engine_change_sets
    WHERE id = p_change_set_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_set % not found', p_change_set_id;
  END IF;
  IF v_set.status <> 'draft' THEN
    RAISE EXCEPTION 'change_set % is not in draft (status=%)', p_change_set_id, v_set.status;
  END IF;

  UPDATE public.engine_change_sets
     SET status = 'publishing', updated_at = v_now
   WHERE id = p_change_set_id;

  FOR v_op IN
    SELECT * FROM public.engine_change_set_ops
     WHERE change_set_id = p_change_set_id
     ORDER BY ordinal ASC
  LOOP
    -- Snapshot before_value at apply time (defeats races against
    -- concurrent platform-admin edits since draft creation).
    -- … op-kind-specific UPDATE/INSERT/DELETE …
    -- … insert engine_audit_log row for this op …
    UPDATE public.engine_change_set_ops
       SET applied_at = v_now
     WHERE id = v_op.id;
  END LOOP;

  UPDATE public.engine_change_sets
     SET status = 'published',
         published_at = v_now,
         published_by_user_id = p_actor_user_id,
         updated_at = v_now
   WHERE id = p_change_set_id;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  -- Postgres rolls back the entire function on RAISE.
  -- We still want to record the failure on the change-set row,
  -- but that itself would be rolled back. So: catch + re-raise.
  -- The server action catches the error, then issues a separate
  -- UPDATE to mark the set 'failed' with the error message.
  RAISE;
END;
$$;
```

### 5.2 The full publish sequence (server-action level)

```
1. Server action `publishChangeSet(changeSetId)`:
   a. Auth: requirePlatformAdminAction()
   b. Load change-set; reject if status != 'draft'
   c. Compute impact (§4); reject if risk == 'blocked' (conflicts)
   d. Cache before-values for every op:
        - SELECT current state of every subject_id into op.before_value
          via UPDATE engine_change_set_ops SET before_value = ...
        - This is OUTSIDE the publish transaction by design — it must
          succeed first so rollback has its snapshot.
   e. Call publish_change_set(changeSetId, actorUserId) via service-role
   f. On success:
        - For each applied op: insert engine_audit_log row
          (subject_kind, subject_id, before_value, after_value, actor)
        - bustFieldCatalog() for every tenant (broad invalidation —
          revalidateTag('field-catalog') is cheap and 9B publishes
          are infrequent enough that broad-bust is fine)
        - Return { ok: true, changeSetId, impact }
   g. On failure (Postgres exception raised):
        - UPDATE engine_change_sets SET status='failed',
          publish_error = '<error message>'
        - Return { ok: false, error: '<...>' }
        - Audit log entries are NOT written for the failed set
          (because the apply was rolled back, so the audit
          would describe state changes that didn't happen)
```

### 5.3 Op-by-op validators (inside the PL/pgSQL)

Each op kind has a small inline validator before applying:

- `relabel_field`: subject_id exists in `profile_field_definitions`; not in reserved list; `after_value.label` length 1–80; no `field_key` field present in the payload (defence in depth — server action stripped it but DB doesn't trust).
- `change_field_defaults`: subject_id exists; the after_value does not contain any disallowed key (e.g. `field_key`, `kind`).
- `deprecate_field`: subject_id exists, currently `deprecated_at IS NULL`, and not a reserved key.
- `create_field`: `field_key` not already in `profile_field_definitions`; not in reserved list; not starting with `custom.` (that prefix is Phase 8's namespace); `kind` in the allowed enum.
- `add_recommendation`: target `taxonomy_terms.id` exists and `is_active=true`; field exists.

If any validator fails, the function raises and the whole publish rolls back.

### 5.4 Cache invalidation

`profile_field_definitions` writes invalidate the catalog cache. Two layers:

1. **Per-tenant tag** — `revalidateTag('field-catalog:<tenantId>')` for every tenant touched. Since 9B changes are global, we just call `revalidateTag('field-catalog')` (the broad tag) once after publish.
2. **120s natural expiry** — already configured in `getCachedTenantFieldCatalog` (see `engine-architecture.md` §9). The recent Phase 7 "safety-net TTL" commit (`e20c55d90`) ensures even a failed `revalidateTag` self-heals within 5 minutes.

Cache-bust order: publish (transaction commits) → revalidateTag (fire-and-forget) → return success to the UI. If revalidateTag fails, the 120s TTL covers it. We do **not** await revalidation — never make a successful publish look failed because of a non-critical cache side-effect.

---

## 6. Rollback flow

Rollback reverses a `published` change-set by applying each op's `before_value` in **reverse ordinal order**. Same PL/pgSQL pattern as publish.

### 6.1 The function

```sql
CREATE OR REPLACE FUNCTION public.rollback_change_set(
  p_change_set_id uuid,
  p_actor_user_id uuid,
  p_reason        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set    public.engine_change_sets%ROWTYPE;
  v_op     public.engine_change_set_ops%ROWTYPE;
  v_now    timestamptz := now();
BEGIN
  SELECT * INTO v_set FROM public.engine_change_sets
    WHERE id = p_change_set_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_set % not found', p_change_set_id;
  END IF;
  IF v_set.status <> 'published' THEN
    RAISE EXCEPTION 'change_set % is not published (status=%)', p_change_set_id, v_set.status;
  END IF;

  -- Reverse-apply ops in REVERSE order (LIFO).
  FOR v_op IN
    SELECT * FROM public.engine_change_set_ops
     WHERE change_set_id = p_change_set_id AND applied_at IS NOT NULL
     ORDER BY ordinal DESC
  LOOP
    -- … op-kind-specific reverse-apply using v_op.before_value …
    -- … insert engine_audit_log row with operation='rollback' …
    UPDATE public.engine_change_set_ops
       SET reverted_at = v_now
     WHERE id = v_op.id;
  END LOOP;

  UPDATE public.engine_change_sets
     SET status = 'rolled-back',
         rolled_back_at = v_now,
         rolled_back_by_user_id = p_actor_user_id,
         rolled_back_reason = p_reason,
         updated_at = v_now
   WHERE id = p_change_set_id;

  RETURN '{"ok":true}'::jsonb;
END;
$$;
```

### 6.2 Op-kind reverse-apply rules

| `op_kind` | Forward apply | Reverse apply |
|---|---|---|
| `relabel_field` | UPDATE → `after_value` | UPDATE → `before_value` |
| `change_field_defaults` | UPDATE → `after_value` | UPDATE → `before_value` |
| `move_field_to_group` | UPDATE `field_group_id` | UPDATE back |
| `add_recommendation` | INSERT row | DELETE row (matched by all `after_value` columns) |
| `remove_recommendation` | DELETE row | INSERT from `before_value` |
| `change_recommendation_strength` | UPDATE | UPDATE-back |
| `deprecate_field` | SET `deprecated_at = now()` | SET `deprecated_at = null` |
| `undeprecate_field` | SET `deprecated_at = null` | SET `deprecated_at = before_value.deprecated_at` |
| `create_field` | INSERT row (+ optional recs) | **Soft-revert: SET `deprecated_at = now()`**. Hard-DELETE only if no `talent_profile_field_values` reference the field — which is true within seconds of creation but rapidly stops being safe. The soft-revert preserves any values that snuck in. |
| `relabel_group` | UPDATE → `after_value` | UPDATE → `before_value` |
| `change_group_active` | UPDATE | UPDATE-back |
| `create_group` | INSERT | SET `is_active=false`; hard-DELETE only if no fields reference it |
| `attach_group_to_category` | INSERT | DELETE |
| `detach_group_from_category` | DELETE | INSERT from `before_value` |

### 6.3 The orphan-values question

`deprecate_field` rollback (undeprecate) cleanly restores the field — values reappear in the resolver.

`create_field` rollback is the asymmetric case: if a tenant talent's profile already has a stored value for the new field (typically because the field went live for hours/days before rollback), hard-deleting the field would corrupt those values (FK constraint to `field_definition_id` doesn't exist, but the row would become a dead reference). **Soft-revert is the rule**: rollback sets `deprecated_at`, the resolver excludes the field, values are preserved. The change-set summary explicitly warns "rollback will deprecate, not delete, the field — % values exist".

### 6.4 Limits

A rolled-back change-set cannot be re-published. To re-apply, the user duplicates the change-set (copy all ops into a new `draft`) and republishes. Duplication is a UI shortcut, not a special DB op.

A change-set can be rolled back at most once. Re-running rollback on a `rolled-back` set raises.

---

## 7. Auth + RLS

### 7.1 Who can see what

| Surface | Audience | Mechanism |
|---|---|---|
| `engine_change_sets` SELECT | Platform admins only | RLS `is_platform_admin()` |
| `engine_change_set_ops` SELECT | Platform admins only | RLS `is_platform_admin()` |
| `engine_change_sets` writes | Service role only (driven by server action) | No INSERT/UPDATE/DELETE policy |
| `engine_change_set_ops` writes | Service role only | No INSERT/UPDATE/DELETE policy |
| `publish_change_set()` | Platform admin via server action | Function is `SECURITY DEFINER`; server action gates auth |
| `rollback_change_set()` | Platform admin via server action | Same pattern |
| `/platform/admin/catalog-studio` route | Platform admin | Route layout checks `requirePlatformAdminAction()` |
| `engine_audit_log` reads of 9B rows | Platform admins + tenants whose data was affected (existing RLS — see `engine_audit_log_tenant_select` policy) | The audit-log RLS already filters by `tenant_id`; 9B writes audit rows with `tenant_id = NULL`-impossible, so we need to denormalise — see below |

### 7.2 The `engine_audit_log.tenant_id` complication

`engine_audit_log.tenant_id` is `NOT NULL` per the Phase 7 migration (it's the partition key for tenant-scoped reads). 9B operations are *global* (affect every tenant) — there is no single tenant.

Three options:

- **A. Emit one audit row per affected tenant.** For a single `change_field_defaults` op, write N audit rows where N = # tenants. Expensive (1k+ tenants × multiple ops × many publishes) and pollutes tenants' history rail with platform-driven events that aren't actually their changes.
- **B. Emit one audit row per op with a sentinel `tenant_id`.** Reserve a special "platform" UUID; surface in the tenant's history rail as "Tulala updated this field's default visibility". RLS lets a tenant see it only if they have an override on that field (joins via `subject_id`).
- **C. New audit-log table `engine_platform_audit_log`.** Mirrors `engine_audit_log` shape but `tenant_id` is nullable; readable by platform admins; tenants can see derived events via a view.

**Recommendation: B**, with caveat. Introduce a `platform_tenant_id` constant (e.g. `00000000-0000-0000-0000-000000000000`) seeded as a placeholder row in `agencies` (or carve out a dedicated `is_platform_event` boolean column on `engine_audit_log`). The cleanest variant: **add a `boolean is_platform_event` column to `engine_audit_log` with default `false`**; 9B writes set it to `true`; `engine_audit_log_tenant_select` policy extends to `OR (is_platform_event AND public.is_platform_admin())`. Tenant rails filter `is_platform_event = false` by default; a "platform changes" tab in the tenant's history shows the affected-by events.

**Decision needed (Open Question 4 in §13).**

### 7.3 Service-role boundary

The publish/rollback functions are `SECURITY DEFINER` — they run as the function owner (postgres role), bypassing RLS. This is deliberate: the function needs to write to multiple platform-level tables atomically. The function is reachable only via service-role RPC, and the server action that calls it is platform-admin-gated.

Mitigation: the function is *only* defined to perform whitelisted ops with whitelisted shapes (defence in depth via the CHECK constraint on `op_kind`). It cannot execute arbitrary SQL — every UPDATE statement inside has its target table and column set hard-coded.

---

## 8. UI

### 8.1 Route

`/platform/admin/catalog-studio` — sibling to the existing `/platform/admin/catalog-map` (Phase 9A). Layout-gated by platform-admin role; non-admins see 404.

Reuse the existing platform-admin shell (`web/src/app/(workspace)/platform/admin/` — same layout component).

### 8.2 Page sections (top to bottom)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Catalog Studio                                          [+ New draft] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ Drafts (3)                                                           │
│ ┌─ "Translate measurements section to ES" — Bea, 2h ago            ─┐│
│ │  4 ops · validated 3m ago · risk: low                              │
│ │  ▸ Open                                                            │
│ └────────────────────────────────────────────────────────────────────┘│
│ ┌─ "Mark `physical.dob` sensitive"            — Alex, yesterday    ─┐│
│ │  1 op · validated never · risk: ?                                  │
│ │  ▸ Open                                                            │
│ └────────────────────────────────────────────────────────────────────┘│
│ …                                                                    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Recently published                                                   │
│ ┌─ "Add waist_cm to fashion models" — Bea — published 3d ago       ─┐│
│ │  6 ops · 422 talent values affected · risk: medium                 │
│ │  ▸ View · 🔄 Rollback                                              │
│ └────────────────────────────────────────────────────────────────────┘│
│ …                                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.3 Draft composer (right pane on open)

```
┌── Draft: "Translate measurements section to ES" ──────────────────┐
│ Summary: [Translate measurements section to ES        ]            │
│ Description: [optional long-form note]                             │
│                                                                    │
│ Ops (4)                                                            │
│ ┌─ ① relabel_field `physical.height_cm`                          ─┐│
│ │   label_es: "Altura"                              [✎ Edit][× ] │
│ └────────────────────────────────────────────────────────────────┘│
│ ┌─ ② relabel_field `physical.shoe_size_eu`                       ─┐│
│ │   label_es: "Talla de zapato (UE)"                [✎ Edit][× ] │
│ └────────────────────────────────────────────────────────────────┘│
│ …                                                                  │
│                                                                    │
│ [+ Add op ▾]                                                       │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│ Impact (validated 3m ago)                              [↻ Validate]│
│ ──                                                                 │
│ Fields affected:           4                                       │
│ Talent values touched:     0   (cosmetic relabel)                  │
│ Workspaces with overrides: 0                                       │
│ Talents publicly affected: 0 → 0                                   │
│ Conflicts:                 none                                    │
│ Risk:                      ● low                                   │
│                                                                    │
│ [ Publish ]    (low risk — publishes without confirmation)         │
└────────────────────────────────────────────────────────────────────┘
```

### 8.4 Add-op picker

Dropdown choices map 1:1 to the §3 whitelist. Selecting an op opens a modal scoped to that op's editable columns (e.g. `relabel_field` modal shows label/label_es/helper/placeholder; `change_field_defaults` shows the visibility/required/admin_only/is_sensitive checkboxes). Field/group pickers are autocomplete over the live catalog (uses `loadPlatformCatalogMap`).

### 8.5 Publish confirmation modal

For `medium` risk:

```
┌─ Confirm publish ─────────────────────────────────────────────────┐
│ "Mark `physical.dob` sensitive"                                   │
│                                                                   │
│ Risk: medium                                                      │
│ 1 op · 1 field · 1,247 talent values affected                     │
│                                                                   │
│ This will:                                                        │
│   • Hide `physical.dob` from public profiles immediately          │
│   • Honor as 'admin' visibility everywhere                        │
│   • Block any tenant from making it public                        │
│                                                                   │
│ □ I've reviewed the impact summary                                │
│                                                                   │
│            [ Cancel ]              [ Publish ▸ ]                  │
└───────────────────────────────────────────────────────────────────┘
```

For `high` risk, replace the checkbox with a text-input asking the user to type the summary verbatim.

For `blocked` risk, the Publish button is disabled and the conflicts list is shown above the button with line links to the offending ops.

### 8.6 Published change-set view

Read-only render of the change-set + its applied ops + a "Rollback" button (with a reason text input). After rollback, the same page shows the change-set in `rolled-back` state with the rolled-back-by + reason + timestamps.

### 8.7 Audit cross-links

Every published change-set row links to its `engine_audit_log` entries. Every audit-log entry on a tenant's History rail (Phase 7b) that originated from a 9B publish links back to the change-set page. Bidirectional.

---

## 9. Migration plan

Two new migrations, both all-additive. Plus a function migration. No `ALTER` on existing tables.

### Migration A — `engine_change_sets` + `engine_change_set_ops`

```sql
-- supabase/migrations/<UTC>_p9b_change_sets.sql
-- See §2 for the full DDL — tables + indices + RLS policies.
```

### Migration B — publish/rollback functions

```sql
-- supabase/migrations/<UTC>_p9b_change_set_functions.sql
-- CREATE FUNCTION publish_change_set(p_change_set_id uuid, p_actor_user_id uuid)
-- CREATE FUNCTION rollback_change_set(p_change_set_id uuid, p_actor_user_id uuid, p_reason text)
-- Both SECURITY DEFINER, granted EXECUTE to service_role only.
```

### Migration C — `engine_audit_log.is_platform_event`

```sql
-- supabase/migrations/<UTC>_p9b_audit_log_platform_event.sql
ALTER TABLE public.engine_audit_log
  ADD COLUMN IF NOT EXISTS is_platform_event boolean NOT NULL DEFAULT false;

-- Extend the existing tenant select policy.
DROP POLICY IF EXISTS engine_audit_log_tenant_select ON public.engine_audit_log;
CREATE POLICY engine_audit_log_tenant_select
  ON public.engine_audit_log
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR (NOT is_platform_event AND public.is_staff_of_tenant(tenant_id))
    OR (is_platform_event AND EXISTS (
      SELECT 1 FROM public.workspace_profile_field_settings wpfs
       WHERE wpfs.tenant_id = engine_audit_log.tenant_id
         AND wpfs.field_definition_id = engine_audit_log.subject_id
    ))
  );

-- Indices for the new filter direction.
CREATE INDEX IF NOT EXISTS engine_audit_log_platform_idx
  ON public.engine_audit_log (is_platform_event, created_at DESC)
  WHERE is_platform_event;
```

(Migration C lives only if §7.2 Option B is chosen — see Open Question 4.)

### Per CLAUDE.md

- `npm run db:push` is part of slice 1 commit.
- Unique UTC timestamps per agent.
- Additive only — `phase-1` continues to work if the migration is reverted (publish/rollback functions become NOOP-via-missing-table; the route returns "feature not enabled" via try/catch).

---

## 10. Failure modes + recovery

### 10.1 Publish partial-fail mid-transaction

**Scenario:** Op #3 of 5 fails (e.g. a concurrent platform-admin deleted the recommendation row we were trying to update). Postgres `RAISE` triggers automatic rollback of the entire function — ops #1 and #2 are reverted to pre-publish state by the database.

**What the user sees:** Change-set stays in `failed` status with `publish_error` populated. No partial effect on the catalog. They fix the op (or the conflict) and republish.

**What the audit log shows:** Nothing for this attempt (audit-log inserts inside the function were rolled back too). The change-set row's `publish_error` is the only record of the attempt — adequate for forensic review.

### 10.2 Publish succeeds, cache-bust fails

**Scenario:** Postgres function returns success. `revalidateTag('field-catalog')` throws (Next.js infra hiccup).

**What happens:** The publish is durable. The cache returns stale data for up to 120 seconds (the catalog cache's TTL). On the 121st-second request, the cache misses and re-loads — naturally healed.

**Mitigation already in place:** Phase 7's `300s safety-net TTL` commit (`e20c55d90`) makes the worst-case staleness 5 minutes, not infinite.

**What the user sees:** Publish succeeds. If they refresh the catalog map immediately, they may see the old labels for up to 2 minutes. Acceptable for a non-realtime control plane.

### 10.3 Rollback succeeds, cache-bust fails

Same as 10.2. 120s natural expiry.

### 10.4 Concurrent publishes on the same change-set

**Mitigation:** Each `publish_change_set()` call begins with `SELECT … FOR UPDATE` on the change-set row. The second concurrent caller blocks until the first commits, then sees `status = 'publishing' or 'published'` and raises.

### 10.5 Concurrent edits on the same field, two change-sets

**Scenario:** Change-set A relabels field X. Change-set B (different draft) also relabels field X. Both publish.

**What happens:** Whichever publishes first wins; the second's `before_value` is captured at *its* publish time (not at draft time — see §5.1) so the second's UPDATE overwrites the first's UPDATE. The audit log records both edits in order; rollback of either is self-consistent.

This is the right behaviour. Two platform admins working on the same field simultaneously is itself a process flag, not a database flag.

### 10.6 Tenant override clashes with published change

**Scenario:** Platform-admin publishes `change_field_defaults: admin_only=true` on field X. Tenant Y has `workspace_profile_field_settings.show_in_public_override = true` on field X.

**What happens:** No special case needed. The visibility primitive's most-restrictive-wins rule (`effective-visibility.ts` lines 92–121) already handles this: platform `admin_only` is an absolute floor; tenant's `show_in_public_override=true` is ignored by `moreRestrictive(base, "public")` since base is now `admin`. The tenant's row stays — they're not punished for a platform decision — but it has no effect.

The impact preview surfaces this in §4: "237 workspaces have a `show_in_public_override` on this field; their override becomes inert. Resetting is one click in their Field Privacy drawer (Phase 1)."

### 10.7 Reserved/canonical key smuggled into an op

**Defence in depth:**
1. UI: the field-picker in the composer pre-filters out reserved keys.
2. Server action: rejects ops whose `subject_key` matches `isReservedTalentProfileFieldKey()`.
3. PL/pgSQL function: per-op validator double-checks against a constant array of reserved keys.

If all three fail, the database CHECK constraints on `kind` and `field_key LIKE 'custom.%'` (Phase 8) catch the most dangerous edge — kind change attempts and namespace pollution.

### 10.8 The function reference disappears

**Scenario:** Migration B is reverted. `publish_change_set` doesn't exist. Server action call raises.

**Recovery:** Server action catches → returns "Catalog Studio is unavailable; check migration" → UI shows a banner. No data loss; drafts remain editable.

---

## 11. Hard rules — codified

These are the absolute rules of Phase 9B. Each appears in three places (the UI affordance, the server-action validator, the PL/pgSQL validator) — defence in depth.

1. **Never delete fields.** No op kind deletes a `profile_field_definitions` row. `deprecate_field` is the only retirement path. Values are never destroyed.
2. **Never rename `field_key`.** The column is treated as immutable. No op kind UPDATEs it.
3. **Never change a field's `kind`.** Stored JSONB values were written for the original kind; a change would silently corrupt every value. To "change a kind" the operator must `deprecate_field` the old + `create_field` the new (in the same change-set is fine).
4. **Never bypass the impact preview before publish.** `publishChangeSet` server action runs `computeChangeSetImpact` synchronously before invoking the PL/pgSQL function; a `blocked`-risk set cannot publish; a `medium`+ set cannot publish without typed confirmation.
5. **Never publish a change-set with unresolved conflicts.** `ChangeSetConflict[]` from §4.2 is non-empty → publish is blocked at the server-action layer.
6. **Never touch reserved/canonical fields** (`isReservedTalentProfileFieldKey`).
7. **Never touch tenant-owned tables.** 9B is global only. `workspace_profile_field_settings`, `workspace_field_group_settings`, `agency_field_definitions`, `talent_profile_field_values` are off-limits.
8. **Never start before the prerequisite phases land.** P0, P1, P2, P3, P5, P6, P7 are gates. The 9B route returns "Coming with Phase 9B — gated on talent-engine completion" until they're green.
9. **Never auto-enable a created field per tenant.** `create_field` creates the *definition*; it does not insert `workspace_profile_field_settings` rows for any tenant. Tenants opt in via their own Field Catalog drawer (Phase 2) just as they would for any other platform field.
10. **Never destroy talent values.** Even on the soft-revert path for `create_field` rollback, the field is deprecated, not deleted. Values survive in `talent_profile_field_values` indefinitely (or until a separate explicit cleanup migration; that's not 9B's domain).

---

## 12. Implementation plan — slices

Each slice is path-scoped, gate-validated (`npx tsc --noEmit && npm run lint`), and committed without push per branch governance. Migrations are part of the slice that introduces them. `npm run db:push` per CLAUDE.md.

### Slice 1 — Migration + read-only list view (~5h)

**Files:**
- `supabase/migrations/<UTC>_p9b_change_sets.sql` — Migration A (tables, indices, RLS).
- `supabase/migrations/<UTC>_p9b_audit_log_platform_event.sql` — Migration C (decision-gated).
- New: `web/src/app/(workspace)/platform/admin/catalog-studio/page.tsx` — server component, platform-admin-gated.
- New: `web/src/app/(workspace)/platform/admin/catalog-studio/data.ts` — `loadChangeSets()` returning drafts + published lists.
- Reuse the platform-admin layout.

**Acceptance:** route exists; non-platform-admin → 404; the page renders "No drafts yet" empty state + a "+ New draft" button (no-op for now); table-level RLS works (non-admin scoped client cannot SELECT).

**Risk:** low. New tables, new route, no existing-code edits.

**Effort:** 5h (3h migration + 2h route scaffold).

### Slice 2 — Draft composer (no publish) (~6h)

**Files:**
- New: `web/src/lib/server-actions/platform-change-sets.ts` — `createDraft`, `addOp`, `updateOp`, `deleteOp`, `validateDraft` (returns conflicts only; no impact math yet), `discardDraft`.
- Extend `catalog-studio/page.tsx` with the composer view + add-op modals per op kind.
- Reuse `loadPlatformCatalogMap` for the field/group autocompletes.

**Acceptance:** a platform admin can create a draft with N ops, edit each, reorder (via `ordinal`), delete; conflicts (duplicate-subject, reserved-key, kind-change, rename) are surfaced at validate time; nothing is published.

**Risk:** medium (UI surface). Mitigation: each op-kind modal is independently shippable; ship 3 op kinds in this slice (relabel_field, change_field_defaults, deprecate_field) and add the rest in slice 6.

**Effort:** 6h (3h server actions + 3h composer UI).

### Slice 3 — Impact preview engine (~5h)

**Files:**
- New: `web/src/lib/field-engine/change-set-impact.ts` — pure function `computeChangeSetImpact(opsList, catalogSnapshot): ChangeSetImpact`. No I/O; consumers pass in the loaded data.
- Extend `platform-change-sets.ts` with `validateDraft` returning impact + conflicts.
- Reuse `loadPlatformCatalogFieldDetail` and `loadTenantCatalogPosture` for per-field aggregates.
- Unit tests: `change-set-impact.test.ts` — minimum 8 scenarios (cosmetic relabel = low; deprecate-with-values = high; conflicting visibility = blocked; reserved-key = blocked; …).

**Acceptance:** validate returns the §4.2 `ChangeSetImpact` shape; risk score matches §4.3 rules; unit tests cover each risk bracket.

**Risk:** low (pure function over already-loaded data).

**Effort:** 5h (2h pure function + 1h impact loader orchestration + 2h tests).

### Slice 4 — Publish flow (atomic) (~7h)

**Files:**
- `supabase/migrations/<UTC>_p9b_publish_function.sql` — Migration B: `publish_change_set` PL/pgSQL.
- Extend `platform-change-sets.ts` with `publishChangeSet`.
- Wire the Publish button + confirmation modal in `catalog-studio/page.tsx`.
- Audit-log writes for every op (using `logEngineAudit` from Phase 7).

**Acceptance:** publishing a `low`-risk relabel of a low-traffic field succeeds in <500ms; the change-set transitions `draft → publishing → published`; every op's `applied_at` is populated; `engine_audit_log` has N rows for the N ops; cache busts (the platform catalog map refreshes within 120s).

**Risk:** **high** — this is the moment 9B starts mutating canonical tables. Mitigation:
1. Add a `DEV_DRY_RUN` env flag that wraps the function call in a `BEGIN; … ROLLBACK;` for dev-DB testing without persistence.
2. Pre-flight: smoke-test the function on a copy of prod schema in a scratch DB.
3. First production publish is a no-impact cosmetic op (e.g. relabel a single deprecated field) — verified end-to-end before any real edit.

**Effort:** 7h (3h PL/pgSQL + 2h server-action wiring + 2h UI publish flow).

### Slice 5 — Rollback flow (~4h)

**Files:**
- `supabase/migrations/<UTC>_p9b_rollback_function.sql` — `rollback_change_set` PL/pgSQL.
- Extend `platform-change-sets.ts` with `rollbackChangeSet(id, reason)`.
- Rollback button + reason input on published change-set view.

**Acceptance:** rolling back the slice-4 test publish reverses every op; the change-set transitions `published → rolled-back`; `reverted_at` is populated on every op; `engine_audit_log` gets `operation: 'rollback'` entries; cache busts.

**Risk:** high (mutating the canonical tables on a path that's used after the original mutation). Mitigation: write 6 rollback unit tests against a scratch DB *before* shipping the function.

**Effort:** 4h (2h PL/pgSQL + 1h server-action + 1h UI).

### Slice 6 — Remaining op kinds + audit cross-links + UI polish (~6h)

**Files:**
- Extend `platform-change-sets.ts` with the remaining op kinds (`move_field_to_group`, `add_recommendation`, `remove_recommendation`, `change_recommendation_strength`, `undeprecate_field`, `create_field`, `relabel_group`, `change_group_active`, `create_group`, `attach_group_to_category`, `detach_group_from_category`).
- Per-op-kind modals in the composer.
- Audit cross-links: change-set page links to its `engine_audit_log` entries; tenant History rail (Phase 7b) entries originating from `is_platform_event = true` link back to the change-set.
- Polish: keyboard shortcuts, search across drafts, "Duplicate change-set" affordance.

**Acceptance:** every op kind in §3 is composable, validatable, publishable, rollbackable; audit cross-links work bidirectionally; the studio is a coherent operational surface.

**Risk:** medium (volume of new modals). Each op is mechanical given slices 1–5 set the pattern.

**Effort:** 6h.

### Effort summary

| Slice | Effort | Critical-path dependency |
|---|---:|---|
| 1 — Migration + read-only list | ~5h | `npm run db:push` approval |
| 2 — Draft composer | ~6h | slice 1 |
| 3 — Impact preview engine | ~5h | slice 1; can run parallel to slice 2 |
| 4 — Publish flow (atomic) | ~7h | slices 2, 3 |
| 5 — Rollback flow | ~4h | slice 4 |
| 6 — Remaining ops + polish | ~6h | slice 5 |

**Total: ~33h serial + 6–8h QA cycles.** Plus pre-flight scratch-DB testing for slices 4 & 5 (~3h).

**Critical path:** slice 1 → (slice 2 ∥ slice 3) → slice 4 → slice 5 → slice 6.

The phase is unusual in that QA-on-prod-data is impossible (no scratch agency-data to break); the gate is "first publish is a no-impact cosmetic op, verified end-to-end".

---

## 13. Open questions / decisions

**1. Tenant impact attribution in `engine_audit_log` — Option B (`is_platform_event` column) or Option C (separate `engine_platform_audit_log` table)?**

- B keeps a single audit-log table; tenants see "Tulala changed this field" in their history rail (filtered by `subject_id` matching their override row).
- C is cleaner separation; tenants see platform events only via a derived view, but it doubles the surface area for the History rail.
- **Recommendation:** B. Single table, one RLS policy, tenant rail shows the cross-cutting context. Gates Migration C and slice 4 audit writes.

**2. `high`-risk publish gate — typed-summary confirmation or 2-person approval?**

- Today's plan: typed summary text input ("type 'Translate measurements section to ES' to confirm").
- Alternative: two-platform-admin approval (one drafts/publishes, a second confirms). Maps cleanly to `engine_change_sets.published_by_user_id` + a new `approved_by_user_id` column.
- **Recommendation:** typed summary for v1; add 2-person rule via column add in a 9B.1 if review feedback warrants. Don't ship the org-policy lever until the org has multiple platform admins.

**3. Bulk relabel — N ops or one op with N targets?**

- N ops: each is atomically rollback-able; impact rows scale linearly.
- One op with N targets: cheaper to compose but harder to partially-rollback.
- **Recommendation:** N ops. Composer offers a "Bulk relabel" macro that expands into N ops on selection — UX shortcut over the data model, not a new op kind.

**4. `create_field` rollback — soft-revert (deprecate) always, or hard-DELETE if no values?**

- Soft-revert always: simpler, never destructive, always safe.
- Hard-DELETE-if-safe: cleaner result if rollback happens within seconds and zero values exist.
- **Recommendation:** soft-revert always. The cost of an extra deprecated row is trivial; the asymmetric branching is a footgun.

**5. Concurrent platform-admin edits — first-wins (current spec) or pessimistic-lock-the-subject?**

- First-wins: simpler; audit log records the order; rollback is per-change-set.
- Pessimistic lock: a draft that references field X locks field X from other drafts until publish/discard. Heavy.
- **Recommendation:** first-wins for v1; observe in practice. Pessimistic lock is a 9B.1 if conflicts become real.

**6. Drafts that touch fields deprecated *after* draft creation — auto-invalidate or let publish fail?**

- Auto-invalidate at validate time: nicer UX, the user knows immediately.
- Let publish fail: simpler.
- **Recommendation:** auto-invalidate at validate time. `computeChangeSetImpact` checks each subject's current state and surfaces "Field X was deprecated yesterday — this op is now invalid".

**7. `create_field` and `create_group` UUIDs — generated by the function, or pre-allocated by the composer?**

- Generated by function: subject_id is null in the op row until applied; impact preview can reference the op only by `change_set_op.id`.
- Pre-allocated: UUID picked at op-add time; subject_id is filled in immediately.
- **Recommendation:** pre-allocated (gen_random_uuid() client-side). The impact preview can reason about the future subject_id straightforwardly; no special-case in audit log.

**8. The "first production publish is a no-impact cosmetic op" rule — codify as a launch checklist item, or a runtime feature flag?**

- Checklist item: human discipline.
- Feature flag: the first 9B publish in a fresh env must be marked `dry_run=true` (records the change in the DB but doesn't apply).
- **Recommendation:** checklist item; engineering courtesy, not a hard gate. The slice-4 acceptance test already exercises an atomic relabel against a known low-value field.

### Top three the user must decide first (gating slices 1 + 4 + 5):

1. **#1 — `is_platform_event` column on `engine_audit_log` (Migration C) vs. separate platform-audit table.** Gates Migration A + slice 4 audit writes.
2. **#2 — typed-summary vs. 2-person approval for high-risk publish.** Gates slice 4 publish modal.
3. **#4 — `create_field` rollback semantics (soft-revert vs. hard-DELETE-if-safe).** Gates slice 5 rollback function.

---

## 14. Acceptance — the whole phase

Phase 9B is done when **all** of the following hold:

1. **Every op kind in §3 is composable, validatable, publishable, rollbackable** via the Catalog Studio route. Each op has a unit test for forward apply and a unit test for reverse apply.
2. **The impact preview correctly predicts** post-publish state for every op kind. Verified by: for any draft, the predicted "publicly-displaying talents after" equals the post-publish observed count for that field; same for "talent values affected" and "workspaces overriding".
3. **No destructive op exists.** No code path deletes a `profile_field_definitions` row, renames a `field_key`, or changes a `kind`. Verified by: grep audit on the codebase for `delete().from("profile_field_definitions")` outside test files — only allowed inside the rollback function for `create_group` soft-delete, which itself only DELETEs when no fields reference the group.
4. **Every publish + rollback is in `engine_audit_log`** with before/after JSONB for every op. Verified by: query `engine_audit_log` for a published change-set ID and count rows equal to `change_set_ops` count.
5. **Tenant overrides are surfaced before any platform change.** Verified by: a `change_field_defaults` op on a field that 50 tenants override shows "50 workspaces have overrides on this field" in the impact preview.
6. **Reserved/canonical keys are uneditable from 9B.** Verified by: the field-picker excludes them; the server action rejects them; the PL/pgSQL function rejects them.
7. **Zero talent values destroyed.** Verified by: before any publish, snapshot `SELECT count(*) FROM talent_profile_field_values`; after publish + rollback round-trip, count is unchanged.
8. **The change-set / preview / publish / rollback works end-to-end on a non-destructive test edit.** The slice-4 acceptance test: relabel a deprecated low-value field, publish, observe label change in the catalog map, rollback, observe label revert. Both directions audited.
9. **Cache invalidation is correct.** Verified by: post-publish, `loadPlatformCatalogMap()` returns the new state within 120s (typically <2s).
10. **Hard prerequisites are green.** P0, P1, P2, P3, P5, P6, P7 are all shipped and observed for ≥1 week before 9B's first publish. (This is a launch-readiness gate, not a code gate.)
11. **The platform-admin route is gated.** Non-platform-admin → 404. Verified by: scoped-client integration test.
12. **The §11 hard rules are codified in three places** (UI, server action, PL/pgSQL). Verified by: grep for `isReservedTalentProfileFieldKey` (three call sites minimum) and `field_key LIKE 'custom.%'` CHECK constraints; PL/pgSQL function source includes the reserved-list constant.

---

## Cross-links

- [`talent-engine-execution-plan-2026-05-18.md`](talent-engine-execution-plan-2026-05-18.md) §Phase 9B — the mandate this doc implements.
- [`engine-architecture.md`](engine-architecture.md) §2 (data model — every table 9B writes is listed there), §3 (resolver flow — every consumer of 9B's writes), §4 (visibility primitive — unchanged by 9B), §9 (caching — busted on every publish), §11 (known debt — `profile_field_recommendations` RLS was tightened in commit `20a5b654b`, paving the way for 9B).
- [`phase-8-custom-fields-design-2026-05-19.md`](phase-8-custom-fields-design-2026-05-19.md) — governance state-machine pattern (draft → submitted → published) mirrors Phase 8's; the two designs share style but are independent (Phase 8 ≠ 9B; see §1 boundary).
- [`talent-engine-status-2026-05-18.md`](talent-engine-status-2026-05-18.md) §"Path to Done" workstream H — confirms 9B is hard-gated on 0–7 and runs *last* in the program.
- `web/src/lib/server-actions/admin-taxonomy.ts:833` — the resolver every 9B change fans out through.
- `web/src/lib/field-engine/effective-visibility.ts` — unchanged by 9B; the impact engine reuses it.
- `web/src/lib/server-actions/engine-audit.ts` — `logEngineAudit` helper Phase 9B writes through.
- `supabase/migrations/20260520044731_engine_audit_log.sql` — the audit table 9B extends (Migration C if §13 #1 = B).
- `web/src/app/(workspace)/platform/catalog-map-data.ts`, `catalog-field-detail-data.ts`, `tenant-catalog-data.ts` — Phase 9A loaders the impact preview engine orchestrates.

---

*Doc only. No code, no migration, no DB push, no schema change in this commit.*
