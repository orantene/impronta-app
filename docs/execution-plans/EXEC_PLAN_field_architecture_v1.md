# Execution Plan — Field Architecture V1

**Status:** Approved 2026-05-07. Awaiting Phase 1 kickoff.
**Owner:** Claude (data + migrations) + user (review gates).
**Predecessor:** `taxonomy_cleanup_v1` migration — ✅ APPLIED 2026-05-07.

---

## Goal

Convert the talent profile data model from a flat 179-field-with-recommendations system into a **group-based, parent-driven, requirement-tiered architecture** that:

1. Renders the right fields automatically when a talent picks a primary + (up to 2) secondary types
2. Supports per-tenant overrides at both group and field level
3. Cleanly separates self-reported data from earned trust + admin-managed verification
4. Powers an OAuth-style permission flow when one talent works with multiple agencies
5. Lets each agency curate its own photo layer for branded site display

---

## Architectural Decisions (locked)

| # | Decision | Source |
|---|---|---|
| D1 | Field catalog = UI definitions only. Source of truth for taxonomy/languages/contexts/media stays in structured tables. | User direction |
| D2 | No `entity_type` on talent_profiles. Bands/groups handled via Studio workspace pattern (Phase X charter). | User direction |
| D3 | Field-count problem solved by UI filtering on primary + 2 secondary cap. Don't trim catalog aggressively. | User direction |
| D4 | Trust = separate first-class concept (`talent_profile_trust_badges`), not a field group. | User + my audit |
| D5 | **Claim-based ownership + OAuth-style cross-agency permissions.** Pre-claim agency has full control; post-claim talent owns and grants scopes per agency. | User direction |
| D6 | Workspace controls field group display order via `workspace_field_group_settings`. | User direction |
| D7 | **Two-layer photo model.** Talent's master photos universal; agency layer (add or overwrite) shown only on agency-branded surfaces. | User direction |
| D8 | Trim Sales / Operations / Equipment groups to ~5 fields total in V1; defer rest to V2. | My recommendation, accepted |
| D9 | Add 3 columns to `talent_profiles` (last_active_at, profile_completeness_pct, total_completed_bookings) as earned-trust foundations. Full metrics layer defers to V2. | My recommendation, accepted |
| D10 | Add `validation_rules JSONB` and `show_when JSONB` schema NOW — frontend engine builds later. | User + my recommendation |
| D11 | Pull `talent_profile_external_calendars` (Calendly/Google/iCal links) into V1 schema; UI deferred. | My recommendation, accepted |
| D12 | Reconciliation of existing 179 fields MANDATORY before any new field rows. | My recommendation, accepted |
| D13 | Spanish translations inline for all new groups + fields. | User direction |
| D14 | Catalog field naming: dot-path keys (`chef.cuisine_types`, `model.runway_experience`). DB slugs use kebab-case (`chef-cuisine-types`). One canonical key per concept. | My recommendation, accepted |

---

## Phase Sequence

### Pre-condition (DONE)
- [x] `taxonomy_cleanup_v1` migration applied + 14/14 safety checks passing.

### Phase 1 — Reconciliation document (HUMAN-IN-THE-LOOP)

**Deliverable:** `docs/taxonomy/FIELD_RECONCILIATION_v1.md` — table of every existing field in `profile_field_definitions` (179 rows: 11 universal + 22 global + 146 type-specific).

**For each row:**
| Current `field_key` | Current label | Tier | Section | Recommended for terms | Proposed canonical key | Proposed group | Action | Notes |

**Actions:**
- **KEEP** — already canonical, only set `field_group_id`
- **RENAME** — new canonical key (e.g., `chefs.cuisines` → `chef.cuisine_types`); preserve as alias in `legacy_field_keys`
- **MERGE** — duplicate concept; absorb into existing canonical
- **ARCHIVE** — obsolete or replaced by group-level field

**Estimated output:** ~200-line markdown table. Generated via single batched SQL query against live DB (Management API).

**Gate:** User redlines. No code execution until reconciliation actions agreed.

**Estimate:** 30 min generate + (your review time).

---

### Phase 2 — Field reconciliation migration

**Deliverable:** `supabase/migrations/20260907170000_field_reconciliation_v1.sql`

**Operations:**
1. Add `legacy_field_keys TEXT[]` column on `profile_field_definitions` (preserve old keys for code that reads them).
2. RENAME action: update `field_key` to canonical form; append old key to `legacy_field_keys`.
3. MERGE action: retag all `talent_profile_field_values` rows from old `field_definition_id` → new canonical id; archive old definition (`deprecated_at = now()`).
4. ARCHIVE action: `deprecated_at = now()` on definition; values left intact pointing at archived def.
5. KEEP — no-op for the row, just set `field_group_id` (deferred to Phase 3).

**Safety pattern:** identical to taxonomy_cleanup (idempotent guards, soft archive only, final assertion block, single transaction).

**Gate:** Run it, then 5 safety queries (zero orphan field_values, all renames mapped, all merges completed, archived count matches plan, no PK collisions in field_values).

**Estimate:** 1-2 hours write + apply.

---

### Phase 3 — Field architecture schema + group seed

**Deliverable:** `supabase/migrations/20260907180000_field_architecture_v1.sql`

**Schema additions:**

```sql
-- 1. Field groups (the 13 reusable bundles)
CREATE TABLE profile_field_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_es TEXT,
  description_en TEXT,
  description_es TEXT,
  sort_order INT DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Definitions reference groups
ALTER TABLE profile_field_definitions
  ADD COLUMN field_group_id UUID REFERENCES profile_field_groups(id),
  ADD COLUMN validation_rules JSONB,    -- {min, max, regex, enum, etc.}
  ADD COLUMN show_when JSONB;           -- {field_key, operator, value}

-- 3. Parent → group mapping
CREATE TABLE parent_category_field_groups (
  parent_category_id UUID REFERENCES taxonomy_terms(id),
  field_group_id UUID REFERENCES profile_field_groups(id),
  is_default BOOLEAN DEFAULT true,
  weight TEXT CHECK (weight IN ('default','heavy','light','optional')) DEFAULT 'default',
  display_order INT DEFAULT 100,
  in_registration_wizard BOOLEAN DEFAULT false,
  in_profile_editor BOOLEAN DEFAULT true,
  completeness_weight DECIMAL(3,2) DEFAULT 1.0,
  PRIMARY KEY (parent_category_id, field_group_id)
);

-- 4. Recommendation requirement-level columns
ALTER TABLE profile_field_recommendations
  ADD COLUMN required_at_registration BOOLEAN DEFAULT false,
  ADD COLUMN required_before_publish BOOLEAN DEFAULT false,
  ADD COLUMN required_before_verification BOOLEAN DEFAULT false,
  ADD COLUMN is_admin_only BOOLEAN DEFAULT false,
  ADD COLUMN requires_verification BOOLEAN DEFAULT false;

-- 5. Workspace can override at group level
CREATE TABLE workspace_field_group_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES agencies(id),
  field_group_id UUID REFERENCES profile_field_groups(id),
  is_enabled BOOLEAN,
  show_in_registration BOOLEAN,
  show_in_profile_edit BOOLEAN,
  show_in_public_profile BOOLEAN,
  display_order INT,
  custom_label TEXT,
  helper_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, field_group_id)
);

-- 6. Earned-trust foundations on talent_profiles
ALTER TABLE talent_profiles
  ADD COLUMN last_active_at TIMESTAMPTZ,
  ADD COLUMN profile_completeness_pct SMALLINT,
  ADD COLUMN total_completed_bookings INT DEFAULT 0;

-- 7. Trust badges (separate first-class concept)
CREATE TABLE talent_profile_trust_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID REFERENCES talent_profiles(id),
  badge_kind TEXT NOT NULL,                -- 'identity', 'background_check', 'license', 'insurance', 'social_account', etc.
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'verified', 'rejected', 'expired'
  scope TEXT NOT NULL DEFAULT 'platform',  -- 'platform' (verified by Tulala) or 'agency' (verified by a tenant)
  scope_tenant_id UUID REFERENCES agencies(id),
  evidence_media_id UUID,
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID,
  expires_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. OAuth-style cross-agency permission requests
CREATE TABLE talent_agency_permission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID REFERENCES talent_profiles(id),
  requesting_tenant_id UUID REFERENCES agencies(id),
  requested_scopes TEXT[] NOT NULL,         -- ['identity','media','rates','service_areas','availability','documents','physical','experience']
  request_message TEXT,
  status TEXT CHECK (status IN ('pending','approved','denied','expired','cancelled')) DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 days',
  approved_scopes TEXT[],                    -- talent may approve subset
  responded_by_user_id UUID
);

-- 9. Active grant of data scopes per agency (talent-controlled, revocable)
CREATE TABLE talent_agency_data_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID REFERENCES talent_profiles(id),
  tenant_id UUID REFERENCES agencies(id),
  granted_scopes TEXT[] NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  source_request_id UUID REFERENCES talent_agency_permission_requests(id),
  granted_by_user_id UUID,
  UNIQUE (talent_profile_id, tenant_id)     -- one active grant per (talent, tenant) pair
);

-- 10. External calendars (Calendly/Google/iCal/cal.com)
CREATE TABLE talent_profile_external_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID REFERENCES talent_profiles(id),
  kind TEXT CHECK (kind IN ('calendly','google','ical','cal_com','manual')),
  external_url TEXT,
  is_primary BOOLEAN DEFAULT false,
  display_in_profile BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Photo ownership + agency curation
--
-- Photo ownership model:
--   media_assets.ownership_kind: 'talent' | 'agency' | 'platform'
--   Talent-owned: uploaded by talent, talent controls visibility.
--   Agency-owned: uploaded by agency staff (paid shoot, branded asset).
--                 Agency retains copyright/ownership. Photo can appear on:
--                   • Agency's branded site (always, unless agency hides)
--                   • Talent's master Tulala profile (default ON, talent
--                     can hide; reflects "this agency made this for me")
--                   • Talent's editor view (always — they see what's tagged)
--                 If agency leaves the roster, photo stays but visibility
--                 on master profile flips to OFF until talent re-confirms
--                 (handled in roster-lifecycle migration, not here).
--
-- Two-layer rendering:
--   - Master profile (tulala.digital/t/<slug>) renders:
--       talent-owned photos + agency-owned photos with
--       visible_on_master_profile=true (with subtle attribution badge).
--   - Agency-branded site (agency.com) renders:
--       agency_talent_media curation order, which can include both
--       talent-owned and agency-owned photos, plus agency overrides
--       (replace one talent photo with an agency edit/crop on this site only).

ALTER TABLE media_assets
  ADD COLUMN ownership_kind TEXT NOT NULL DEFAULT 'talent'
    CHECK (ownership_kind IN ('talent','agency','platform')),
  ADD COLUMN owner_tenant_id UUID REFERENCES agencies(id),
  ADD COLUMN visible_on_master_profile BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN visible_in_talent_editor  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN attribution_note TEXT;       -- e.g., "Photo by Impronta Studio"

-- Constraint: agency-owned photos must have owner_tenant_id set
ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_agency_ownership_chk
    CHECK (
      (ownership_kind = 'agency' AND owner_tenant_id IS NOT NULL)
      OR (ownership_kind <> 'agency')
    );

-- Per-tenant curation layer (decides agency-site display + overrides)
CREATE TABLE agency_talent_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES agencies(id),
  talent_profile_id UUID REFERENCES talent_profiles(id),
  -- If set, this row overrides one of the talent's media_assets
  -- on this tenant's branded surfaces (e.g., a different crop or edit).
  -- NULL = agency-original photo (no master photo replaced).
  master_media_id UUID REFERENCES media_assets(id),
  -- The agency's photo asset (must exist in media_assets table).
  -- Could be agency-owned or talent-owned; agency_talent_media just
  -- describes how the agency chooses to ARRANGE photos on its site.
  agency_media_id UUID NOT NULL REFERENCES media_assets(id),
  display_order INT DEFAULT 100,
  caption TEXT,
  is_visible_on_agency_site BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID,
  UNIQUE (tenant_id, talent_profile_id, agency_media_id)
);

-- Rendering rules:
--
-- A) Talent's master profile (tulala.digital/t/<slug>):
--    SELECT * FROM media_assets
--    WHERE talent_profile_id = X
--      AND visible_on_master_profile = true
--      AND deleted_at IS NULL
--    -- Includes agency-owned photos that the agency uploaded for this talent
--    -- as long as visible_on_master_profile is true (default).
--    -- Talent can toggle visible_on_master_profile=false on any photo to hide.
--
-- B) Agency T's branded site (agency.com/talent/<slug>):
--    1. Pull agency_talent_media WHERE tenant_id=T (curation layer)
--    2. For each row where master_media_id IS NOT NULL:
--         render agency_media_id IN PLACE OF master_media_id (override)
--    3. For each row where master_media_id IS NULL:
--         render agency_media_id (agency addition)
--    4. Plus any media_assets for talent_profile_id NOT in the curation set
--       and NOT overridden — talent's master photos that the agency lets
--       through unchanged.
--
-- C) Talent's editor view:
--    SELECT * FROM media_assets WHERE talent_profile_id = X
--    -- Always shows everything (talent + agency-owned), with a label
--    -- showing ownership and which agency uploaded it. Talent CAN hide
--    -- agency-owned photos from their master profile but cannot delete them.
```

**Seed: 13 field groups (with Spanish):**

```
physical-casting              | Físico / Casting
media-portfolio               | Media / Portafolio
experience                    | Experiencia
service-area-travel           | Zona de Servicio / Viajes
languages-communication       | Idiomas / Comunicación
sales-client-interaction      | Ventas / Atención al Cliente
equipment-tools               | Equipo / Herramientas
certifications-documents      | Certificaciones / Documentos
rates-booking                 | Tarifas / Condiciones
availability                  | Disponibilidad
context-best-fit              | Mejor Uso / Contexto
trust-verification            | Confianza / Verificación
operational-requirements      | Requisitos Operativos
```

**Seed: parent_category_field_groups mappings** (per Section B of v3 architecture, 19 parents × 5-9 groups each = ~120 rows).

**Note:** No new field rows seeded yet — that's Phase 4. This phase only sets up the architecture.

**Estimate:** 2-3 hours write + apply.

---

### Phase 4 — Field seeds for 6 priority talent_types

**Deliverable:** `supabase/migrations/20260907190000_field_seeds_v1.sql`

**Seeds:**

For each of [Chef, Dancer, Model, Travel Agent, Driver, Singer]:
1. INSERT new `profile_field_definitions` rows (only fields not already in catalog post-reconciliation)
2. INSERT `profile_field_recommendations` rows linking field → talent_type with the 5 requirement-level booleans
3. UPDATE existing `profile_field_definitions` to set `field_group_id` (massage cleanup, etc.)

**Trim list applied (V1 scope only):**

Sales / Client Interaction group:
- ✅ `sales.experience_summary` (textarea)
- ✅ `sales.cash_handling_certified` (toggle)
- ❌ Drop: upselling, lead gen, closing deals, product demo, VIP handling, follow-up workflow

Operational Requirements group:
- ✅ `ops.requirements_notes` (textarea)
- ✅ `ops.requires_sound_system`, `ops.requires_stage`, `ops.requires_parking`, `ops.requires_power_outlet` (4 toggles)
- ❌ Drop: minimum_space_sqm, setup_time_minutes, requires_kitchen_access, requires_water_access, requires_assistant, requires_permit, safety_notes

Equipment / Tools group:
- ✅ `equipment.owns_equipment` (toggle)
- ✅ `equipment.notes` (textarea)
- ✅ Category-specific toggles: sound_system (Music), drone_available (Photo), vehicle (Drivers), massage_table (Wellness)
- ❌ Drop: structured `(item, model, qty)[]` array

**Spanish translations inline for all new fields.**

**Estimate:** 4-6 hours write + apply.

---

### Phase 5 — Backend resolver + new server actions

**Deliverables:**

**5a. Update `getFieldsForTalent()` resolver** (`web/src/lib/server-actions/admin-taxonomy.ts`):
- Walk talent's `talent_profile_taxonomy` → expand to parent_categories
- Resolve groups via `parent_category_field_groups` for primary + secondaries' parents
- Load fields where `field_group_id IN (resolved groups) OR id IN (recommendations for these terms)`
- Apply `workspace_field_group_settings` overrides (group-level)
- Apply `workspace_profile_field_settings` overrides (field-level)
- Return ordered field list with all 5 requirement-level flags + `show_when` rules

**5b. New server actions:**

```typescript
// Trust badges
createTrustBadge(talent_profile_id, badge_kind, scope, evidence_media_id?)
updateTrustBadge(badge_id, status, notes?)
getTrustBadges(talent_profile_id, scope?)
revokeTrustBadge(badge_id, reason)

// Permission requests (OAuth-style consent)
createPermissionRequest(talent_profile_id, requesting_tenant_id, requested_scopes[], message?)
respondToPermissionRequest(request_id, decision: 'approved'|'denied', approved_scopes?)
getPendingRequestsForTalent(talent_profile_id)
getPendingRequestsForTenant(tenant_id)

// Data grants
revokeDataGrant(grant_id, reason)
getActiveGrants(talent_profile_id)
getActiveGrantForTenant(talent_profile_id, tenant_id)

// External calendars
addExternalCalendar(talent_profile_id, kind, url)
removeExternalCalendar(calendar_id)
setPrimaryCalendar(calendar_id)

// Agency photo curation
addAgencyMedia(tenant_id, talent_profile_id, agency_media_id, master_media_id?, caption?)
removeAgencyMedia(agency_talent_media_id)
reorderAgencyMedia(tenant_id, talent_profile_id, ordered_ids[])
getAgencyMediaForTenant(tenant_id, talent_profile_id)  // returns agency layer
getRenderedMediaForTenant(tenant_id, talent_profile_id) // returns final composed list (master + overrides + agency-originals)

// Profile completeness compute
computeProfileCompleteness(talent_profile_id) // returns pct, fills profile_completeness_pct column
```

**Estimate:** 1 day code + tests.

---

### Phase 6 — Prototype shell wired to resolver

**Deliverable:** Updates to `web/src/app/prototypes/admin-shell/_drawers.tsx` + `_state.tsx`.

**Changes:**
- Replace `TAXONOMY_FIELDS` and `getDynamicFieldsForType()` calls with the new resolver result
- Render fields grouped by `field_group_id`, sectioned per `parent_category_field_groups.display_order`
- Profile completeness ring/bar at top of editor (reads `profile_completeness_pct`)
- Required-by-publish checklist surfaced in profile drawer
- `show_when` engine: simple frontend evaluator (operators: equals, not_equals, in, not_in, is_empty, is_not_empty)
- Validation: `validation_rules` JSONB consumed by frontend form library

**Risks:**
- The existing prototype `_drawers.tsx` is huge (~25k lines). Surgical edits required.
- Touchpoints: `TalentProfileShellDrawer`, `IdentityEditor`, `ProfileAccordionSection`, `dynamicGroups` resolution.

**Estimate:** 2 days. Most expensive phase.

---

### Phase 7 — UI for new concepts

**Deliverables:**

**7a. Permission consent flow** (talent-side):
- `/admin/permissions` page in talent surface
- "Approve agency access" modal: lists requested scopes with toggleable approval per scope
- Notification + email when request lands

**7b. Permission inbox** (agency-side):
- Settings → "Talent permissions" tab
- Shows pending outbound requests + active grants per talent
- "Request access" button on talent rows that aren't yet granted

**7c. Agency photo curation panel:**
- In talent profile drawer (admin view): "Agency photo layer" section
- Shows: master photos | agency overrides | agency-original photos
- Drag-drop reorder; click to override; upload agency-original
- Toggle "Show on our site" per photo

**7d. Trust badges display:**
- Profile public surface: badge ladder (Identity / Profile / Media / Background / License / Insurance) with verification status
- Admin verification workflow drawer: per-badge approve/reject + evidence review

**Estimate:** 3-4 days across all four UI surfaces.

---

## Migration order (locked)

```
✅ 20260907160000_taxonomy_cleanup_v1.sql           [APPLIED 2026-05-07]
   20260907170000_field_reconciliation_v1.sql       [Phase 2]
   20260907180000_field_architecture_v1.sql         [Phase 3 — schema + group seeds]
   20260907190000_field_seeds_v1.sql                [Phase 4 — talent-type field seeds]
```

Three migrations must apply in order. Each safety-net pattern (idempotent, soft archive, final assertion) per the cleanup migration.

---

## Total effort estimate

| Phase | Effort | Cumulative |
|---|---|---|
| 1. Reconciliation doc | 30 min + your review | day 1 |
| 2. Reconciliation migration | 2 hr | day 1 |
| 3. Architecture migration | 3 hr | day 1-2 |
| 4. Field seeds migration | 6 hr | day 2-3 |
| 5. Resolver + server actions | 1 day | day 3-4 |
| 6. Prototype shell wiring | 2 days | day 5-6 |
| 7. New UI surfaces | 3-4 days | day 7-10 |

**Total: ~10 working days end-to-end**, with review gates after Phases 1, 2, 3, 4, 6.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Reconciliation surfaces 20+ ambiguous fields needing user input | High | Medium | Phase 1 is built around your review — slow but safe |
| Existing 146 type-specific fields conflict with new naming | Medium | Medium | Reconciliation migration handles via `legacy_field_keys` aliases |
| `show_when` JSONB schema becomes messy without engine | Low | Low | Simple shape `{field_key, op, value}` — defer engine to V2 |
| Photo two-layer model has complex render logic | Medium | High | Detailed render order documented in agency_talent_media schema comment; tests required |
| Permission system overlaps with existing roster invitation flow | Medium | Medium | Phase 7a/7b must reuse existing invitation primitives, not duplicate |
| Profile completeness math gets gamed (talent fills random text) | Low | Low | Defer scoring sophistication to V2 (validation rules will help) |
| Migration breaks existing prototype renderer | High | High | Phase 6 is the hot zone — test on local dev with Impronta tenant before any deploy |

---

## Decision gates (your reviews)

**G1 (after Phase 1):** Approve the field reconciliation actions before any code runs.
**G2 (after Phase 3):** Confirm the architecture migration applied cleanly (safety checks).
**G3 (after Phase 4):** Confirm field seeds match expectations + Spanish translations approved.
**G4 (mid-Phase 6):** Sample profile drawer rendering correctly for Impronta talent.
**G5 (end of Phase 7):** Full end-to-end QA: talent claim flow, agency permission request, photo curation.

---

## Out of scope (explicitly deferred to V2+)

Per user direction:
- ❌ Minor / under-18 talent flow (compliance burden)
- ❌ Equipment per-booking overrides (booking-side)
- ❌ Reviews/ratings infrastructure (own product slice)
- ❌ Pricing engine nuance (rates structured table, separate slice)
- ❌ Talent narrative builder (press kit, video intro)
- ❌ AI/recommendation engine
- ❌ Full earned-metrics layer (response_rate, repeat_client_pct, etc.)
- ❌ Custom domain integration for agency-curated photos
- ❌ Bulk photo migration tools
- ❌ Multi-agency talent_profiles in single search (use single source + per-tenant grants)

---

## Charter linkage

This execution plan is the implementation arm of:
- `project_impronta_blueprint.md` (data model — extends profile field tier system)
- `project_inquiry_flow_spec.md` (categorization powering inquiry → talent matching)
- `project_agency_exclusivity_model.md` (claim + permission model integrates here)
- `project_workspace_talent_hybrid.md` (workspace-as-bookable model for bands/groups)
- `project_client_trust_badges.md` (trust badges produced by Phase 3 schema)

---

## What I need from you to start Phase 1

Just **"go"**. I'll generate the reconciliation document via a single batched SQL query against the live DB and surface it in the chat for your redline.

No code changes, no migrations. Output is a markdown table you review row-by-row.
