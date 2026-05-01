# Taxonomy & Registration — Architecture Direction

**Status:** Architecture direction (not yet locked at the implementation level). Author: founder (product direction); architecture written 2026-04-25.

This document is **directional** — it picks an architectural lane and reserves the right shapes so future implementation isn't blocked. It is not a fully locked spec; specific column names and migration shapes can shift during build. What's locked is the *direction*: a three-layer taxonomy model, adaptive registration that respects workspace configuration, plan-gated taxonomy width, and dynamic profile fields by talent type.

This doc is part of the locked-product-logic set referenced from `OPERATING.md` §12. It complements:
- [`docs/page-builder-invariants.md`](page-builder-invariants.md) — binding subsystem constraints
- [`docs/talent-relationship-model.md`](talent-relationship-model.md) — how talents relate to workspaces
- [`docs/transaction-architecture.md`](transaction-architecture.md) — v1 payments
- [`docs/talent-monetization.md`](talent-monetization.md) — third commercial lane
- [`docs/client-trust-and-contact-controls.md`](client-trust-and-contact-controls.md) — fourth product layer

The founder's principle, locked verbatim:

> **Tulala owns the master taxonomy. The agency/hub chooses its allowed offer menu. The talent sees only the relevant registration flow for that agency/hub.**

That sentence is the architectural test for every decision below.

---

## 1. Three-layer taxonomy model

The system separates three concerns that are easy to conflate. Don't.

| Layer | What it is | Owner | Stored in |
|---|---|---|---|
| **Master taxonomy** | The platform's full vocabulary (every talent type, category, attribute that has ever existed). Stable across all tenants. | Platform (super_admin) | `talent_types`, `tags`, `skills`, etc. — existing platform-level tables |
| **Workspace enablement** | Which terms from the master vocabulary this specific workspace exposes. Admins decide. Plan-gated. | Workspace (admin+) | `agency_taxonomy_settings` (new table; deferred migration) |
| **Talent selection** | The terms an individual talent has chosen for themselves. Bounded by workspace enablement. | Talent (talent self) | `talent_profile_types`, `talent_profile_skills`, etc. — existing talent-side join tables |

A model agency's registration page shows "Models / Hosts / Performers / Creators." A hospitality hub's registration page shows "Housekeepers / Drivers / Chefs / Event Staff / Security." Both run on the same engine; both pull from the same master vocabulary; each shows only what the workspace enabled.

### Why three layers, not one

- **Master without enablement** = every workspace shows the entire 200-term taxonomy. Registration becomes a database form. Brand quality collapses.
- **Master without talent selection** = registration becomes a multi-page checklist of every option a workspace allows. Talent decides what they actually offer.
- **Enablement without master** = each workspace invents their own vocabulary. No platform discovery, no hub interop, no SEO continuity.

The three layers make each concern independently configurable.

### Rules

- Talents **cannot** select types outside the workspace's enabled set. Hard rule, server-enforced.
- A workspace **cannot** enable terms that don't exist in the master. Hard rule, FK-enforced.
- The master **never** loses terms (deprecation flag only). Removing a term breaks every workspace using it.
- Plan tier **caps** how many parent categories a workspace can enable (see §4).

---

## 2. Existing tables and what's already there

Today's schema (per the blueprint and audit):

| Table | Layer | Status |
|---|---|---|
| `talent_types` | Master | Exists — platform-level vocabulary of types |
| `tags` | Master | Exists |
| `skills` | Master | Exists |
| `event_types` | Master | Exists |
| `industries` | Master | Exists |
| `fit_labels` | Master | Exists |
| `languages` | Master | Exists |
| `locations` | Master | Exists |
| `talent_profile_types` (or similar join) | Talent selection | Likely exists per blueprint |
| `talent_profile_skills` | Talent selection | Likely exists |
| **`agency_taxonomy_settings`** | **Workspace enablement** | **NEW — deferred migration** |
| **`talent_type_field_groups`** | Profile-field schema (§5) | **NEW — deferred migration** |

The new layer is the workspace enablement. Everything else mostly exists or is straightforward extension.

---

## 3. Workspace taxonomy configuration

The new table (deferred migration; reserved shape):

```sql
CREATE TABLE public.agency_taxonomy_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  taxonomy_kind            TEXT NOT NULL,
    -- 'talent_type' | 'tag' | 'skill' | 'event_type' | 'industry' | etc.
  taxonomy_term_id         UUID NOT NULL,
    -- FK to the relevant master table; checked by trigger since polymorphic
  is_enabled               BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_directory        BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_registration     BOOLEAN NOT NULL DEFAULT TRUE,
  allow_as_primary         BOOLEAN NOT NULL DEFAULT TRUE,
  allow_as_secondary       BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval        BOOLEAN NOT NULL DEFAULT FALSE,
  display_order            INTEGER NOT NULL DEFAULT 0,
  custom_label             TEXT,
    -- workspace can rename the term for their site (e.g. "Talent" → "Roster")
    -- platform-master display name is the default
  helper_text              TEXT,
    -- workspace can add registration-flow guidance
  version                  INTEGER NOT NULL DEFAULT 1,
    -- Per page-builder-invariants.md §3 CAS
  updated_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, taxonomy_kind, taxonomy_term_id)
);
```

### Field meanings

| Field | What it controls |
|---|---|
| `is_enabled` | Master switch. False = hidden everywhere on this workspace. |
| `show_in_directory` | Whether the term filters/labels in the public directory. |
| `show_in_registration` | Whether the term appears in the registration flow. (May be enabled internally for staff but hidden from talent UI.) |
| `allow_as_primary` | Whether talent can pick this as their primary type. |
| `allow_as_secondary` | Whether talent can pick this as a secondary type. |
| `requires_approval` | When a talent picks this term, registration goes to admin review (overrides workspace's default approval mode). |
| `display_order` | Workspace-defined ordering on the registration page. |
| `custom_label` | Workspace-friendly rename ("Performers" → "Artists"). The master term key stays for cross-workspace interop; only the display label changes. |
| `helper_text` | Per-term registration guidance. |

### Defaults

- A new workspace on Free defaults to **3 parent talent types enabled** (per the plan-tier limits in §4). Which 3? The workspace's industry, inferred at signup; admin can change.
- Studio defaults to **5 enabled** (admin can configure up to 8). Agency, **8** (up to all). Network, **all**.
- Beyond talent_types, other taxonomies (skills, languages, event_types) start with platform defaults. Admin can prune.

### Hub note

Hubs (`agencies.kind = 'hub'`) use the same `agency_taxonomy_settings` table. Hubs typically enable broader vocabularies (cross-agency discovery), but the mechanism is identical. There's no separate `hub_taxonomy_settings` table.

---

## 4. Plan-gated taxonomy width

The number of **parent talent type groups** a workspace can enable is plan-gated:

| Plan | `max_taxonomy_groups` (parent talent types) | Notes |
|---|---|---|
| `free` | 3 | Most solo operators only need 3 |
| `studio` | 8 | Multi-vertical solos and small studios |
| `agency` | unlimited | Full-spectrum agencies |
| `network` | unlimited + custom hubs | Multi-brand operators |
| `talent_basic` / `talent_pro` / `talent_portfolio` | 1 | Solo workspaces — talent has one identity |

Implementation: this becomes a new entry in [`plan-limits.ts`](../web/src/lib/access/plan-limits.ts):

```
LIMIT_KEYS = [
  ...,
  "max_taxonomy_groups",
];
```

When the limit is reached, additional parent types render as locked cards in the admin UI:

```
You're using 3 of 3 talent type groups on Free.

Enabled:
  Models
  Hosts
  Creators

Locked:
  Performers — Upgrade to Studio
  Music & DJs — Upgrade to Studio
  Chefs & Culinary — Upgrade to Agency
```

The `max_taxonomy_groups` only counts **parent talent types**, not every term. Sub-terms (e.g., "Fashion Model," "Promotional Model" under "Models") are unbounded.

### What's not plan-gated

- The **master vocabulary itself** isn't gated — every workspace can browse all terms; they just can't enable more than their plan allows.
- **Custom labels** (renaming "Performers" → "Artists") aren't gated. That's UX flexibility, not feature width.
- **Other taxonomy kinds** (skills, languages, event_types) aren't counted in the parent-type limit. They're independently bounded by their own plan-limits if/when we add them.

### Network plan special case — custom vocabularies

Network plan unlocks custom hub creation (per `talent-relationship-model.md` §2). A network operator can create a hub with a custom-named category set ("Wellness Practitioners," "Corporate Retreat Staff," etc.) — that's the network-tier monetization lever. Architecturally: a Network workspace can write to the master taxonomy as a "tenant-scoped extension" — terms with `tenant_id` set, only visible to that hub. (Deferred — separate migration when Network features land.)

---

## 5. Dynamic profile fields by talent type

A model and a driver should not see the same profile-edit form. The form must be **schema-driven** based on the talent's selected types.

### The new (deferred) table

```sql
CREATE TABLE public.talent_type_field_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_term_id    UUID NOT NULL,
    -- The talent_type that triggers this field group
  field_group_key     TEXT NOT NULL,
    -- e.g. 'model_measurements', 'singer_repertoire', 'driver_vehicle'
  display_order       INTEGER NOT NULL DEFAULT 0,
  is_required_for_publish BOOLEAN NOT NULL DEFAULT FALSE,
    -- Talent must complete this group before profile can publish
  created_at, updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each field group is a set of fields; reuses the existing field-catalog
-- system (lib/site-admin/field-catalog or similar). Field definitions
-- (label, type, validators, etc.) live in the existing field tables.
```

### Examples

| Talent type | Field group keys | Surfaces |
|---|---|---|
| Model | `model_measurements`, `model_portfolio_style`, `model_experience` | Height, measurements, hair, eyes, runway/shoot/commercial experience |
| Singer | `singer_repertoire`, `singer_equipment`, `singer_performance` | Genres, audio/video links, set duration, equipment, live experience |
| Driver | `driver_vehicle`, `driver_credentials`, `driver_service_areas` | Vehicle type, license, airport-transfer, chauffeur-available |
| Housekeeper | `housekeeping_experience`, `housekeeping_availability` | Cleaning experience, villa/Airbnb/hotel, schedule, supplies |
| Massage Therapist | `wellness_modalities`, `wellness_certifications`, `wellness_logistics` | Massage types, certifications, mobile service, table available |

### Composition rule

If a talent selects MULTIPLE types (Primary: Model, Secondary: Host), they see the **union** of field groups, with primary type's groups first. Each group is displayed under a labeled section ("Model details," "Host details"). Talent can collapse / skip optional groups.

### Field catalog integration

The existing `manage_field_catalog` capability (already in the registry) governs platform-level master field-catalog edits. The new capability `workspace.taxonomy.configure` covers workspace-side enablement of field groups (in case a workspace wants to hide some fields even for an enabled type). Platform-level field-group definitions are super_admin-managed.

---

## 6. Adaptive registration flow

The registration flow is **mobile-first, step-by-step**, and **schema-driven** by the workspace's taxonomy configuration. The user proposed an 8-step flow (locked here):

| Step | Purpose | Source of options |
|---|---|---|
| 1. Welcome | Brand-aligned intro | Workspace's `agency_branding` + `agency_business_identity` |
| 2. Choose talent type (parent) | "What can clients book you for?" | `agency_taxonomy_settings WHERE is_enabled AND show_in_registration AND allow_as_primary` filtered to parent talent_types |
| 3. Choose specific type (sub-term) | "What kind of model are you?" | Children of the parent term, same filter |
| 4. Location / service areas | Home base + travel radius | `locations` master |
| 5. Media | Photos / videos | Existing media-upload pipeline |
| 6. Type-specific fields | Dynamic per talent type | `talent_type_field_groups` for selected types |
| 7. Skills / languages | Talent attributes | `agency_taxonomy_settings` filtered to skills/languages |
| 8. Submit for review | Submission gate | `agency_taxonomy_settings.requires_approval` OR workspace's default approval mode determines whether it goes to admin review |

### Step skipping

- If the workspace enables only **one** parent talent type, skip step 2 (auto-select).
- If the workspace doesn't gate on `requires_approval`, step 8 immediately publishes (still subject to workspace's overall approval mode).
- If the talent has chosen no field groups requiring location, step 4 uses workspace defaults.

### Workspace-driven copy

- Welcome screen text comes from the workspace's `agency_business_identity.public_name` and a workspace-defined `registration_welcome_message` field (deferred — captured in `agency_taxonomy_settings.helper_text` per kind).
- Per-step helper text comes from `agency_taxonomy_settings.helper_text` for the relevant terms.

### Source-ownership

The talent registers **into** a specific workspace (the URL they visited). The resulting `talent_profiles` row is linked via `talent_profiles.created_by_agency_id` to that workspace. After claim, the talent's solo workspace (per `talent-monetization.md` §4.4) is auto-provisioned. They can later be rostered at additional workspaces (agencies, hubs).

This integrates cleanly with the source-ownership rule: the registering workspace owns the initial inquiry funnel; subsequent rostering is per-workspace.

---

## 7. Two-mode profile editor

### Talent mode (mobile-first, simple)

The talent's own `/talent/profile` surface. Premium-feeling, fast, save-as-you-go:

```
Profile strength: 72%

1. Your services       (selected types + field groups for each)
2. Photos & media       (gallery)
3. Location             (home base + service areas)
4. About you            (bio + identity fields)
5. Details              (type-specific field groups)
6. Languages            (multi-select)
7. Availability         (calendar / typical schedule)
8. Submit for review    (only when changes need approval)
```

Cards, progress indicators, save-as-you-go — no big "Save" button required. Each card is a kit-primitive `InspectorGroup` per `page-builder-invariants.md` §6.

### Admin mode (deeper controls, agency staff)

The workspace admin's `/(workspace)/[tenantSlug]/admin/talent/[id]` surface:

```
Identity
  Primary role / Secondary roles
  Visibility (public / hidden / private)
  Featured status / featured_level / featured_position
  Approval status (draft / submitted / under_review / approved / hidden)
  Profile completeness %
  Internal notes (admin-only)

Categorization
  Categories allowed (per workspace's agency_taxonomy_settings)
  Skills / languages / service areas
  Type-specific field groups (read + edit)

Distribution
  Directory priority
  Hub visibility status (per talent-relationship-model.md)
  Rate visibility (public / on-request / hidden)
  Personal-page distribution overrides (if exclusive — per talent-monetization.md §7a)

Commercial
  Default rates by type
  Commission settings (per agency-talent relationship)
  Booking history
```

### The talent does NOT see admin-only fields

`approval_status`, `internal_notes`, `directory_priority`, etc. are admin-scope. The talent's mobile UI focuses on what they can edit themselves; everything else is server-filtered.

---

## 8. Capability keys

Reserved as locked product contracts. Most have no callers in v1 — the prototype's taxonomy / registration / profile UIs reference them as they get built.

| Key | Category | Gating | Granted to |
|---|---|---|---|
| `workspace.taxonomy.configure` | team | role | admin+ on the workspace. Covers enable/disable, show_in_directory, show_in_registration, primary/secondary toggles, requires_approval, display_order, custom_label, helper_text. |
| `workspace.registration.configure` | team | role | admin+. Covers workspace-wide registration behavior toggles (default approval, allow secondary roles, allow custom requests). |
| `agency.talent.approve_registration` | talent | role | admin+. Approves a talent's submitted registration. |
| `platform.taxonomy.manage` | platform | platform_role | super_admin. Add/edit/deprecate master vocabulary terms across all `talent_types`, `tags`, `skills`, `event_types`, etc. |

4 new capability keys. Registry: 84 → 88.

The existing `manage_field_catalog` capability already covers workspace-side field-group enablement. The existing `agency.talent.create` covers admin-creating-talent (e.g., adding a friend's profile). The new keys cover what's genuinely new: taxonomy configuration and registration approval.

---

## 9. Reserved schema concepts (deferred migrations)

### New tables

- `agency_taxonomy_settings` (full DDL in §3)
- `talent_type_field_groups` (full DDL in §5)
- Possibly extend `agencies` with workspace-wide registration behavior fields:
  - `default_requires_approval BOOLEAN` (deferred)
  - `allow_secondary_roles BOOLEAN` (deferred)
  - `allow_open_applications BOOLEAN` (deferred — for "talent can apply for a type the workspace hasn't explicitly enabled")

### Modified tables

- `talent_profiles` already has `talent_type_id` (primary) and join tables for secondaries. No changes required.
- `talent_profiles` may need `submitted_at` / `approved_at` / `approved_by_profile_id` columns for the registration approval flow (some may already exist via `profile_workflow_status`).

### Plan limits

- New `LIMIT_KEYS` entry: `max_taxonomy_groups`. Applied per plan in `plan-limits.ts`.

### Cache tags (per `page-builder-invariants.md` §2)

New surface entries for `cache-tags.ts`:
- `taxonomy` — workspace's enabled taxonomy
- `registration-flow` — the assembled registration UI for a workspace

When admin changes taxonomy settings → `updateTag(tagFor(tenantId, 'taxonomy'))`. The registration page reads from `unstable_cache` with these tags.

### CAS

`agency_taxonomy_settings` carries `version` (already in §3 DDL). Saves follow the existing CAS protocol per `page-builder-invariants.md` §3. Reference: `web/src/lib/site-admin/server/sections.ts`.

### RLS

- `agency_taxonomy_settings`:
  - `staff_select_own_tenant` — staff read own
  - `staff_write_own_tenant` — admin+ writes (capability checked at app layer)
  - `public_select_enabled_for_registration` — anonymous reads needed during the registration flow (filter to `is_enabled AND show_in_registration`)
- `talent_type_field_groups` — public read (no tenant scope; this is master vocabulary linked to master taxonomy).

---

## 10. Build sequence — Phase A through E

The user proposed a 5-phase build order. Locked:

### Phase A — Foundation (data layer, mostly already exists)

- Master taxonomy tables: `talent_types`, `tags`, `skills`, `event_types`, etc. Mostly exist.
- Platform-level seed data for the master vocabulary (super_admin manages via `platform.taxonomy.manage`).
- Field catalog system (already exists).
- Talent type assignments on `talent_profiles` (already exists).

**Status:** mostly there. Phase A is checking what's missing and adding seeds.

### Phase B — Workspace controls (the new work)

- Migration: `agency_taxonomy_settings` table + indexes + RLS + CAS protocol.
- Server actions: enable / disable terms, set visibility flags, custom labels, helper text.
- Admin UI: "Workspace Settings → Talent Types" page using inspector kit primitives.
- Plan limits applied: `max_taxonomy_groups` enforced. Locked-card UX for over-limit terms.
- Cache-tag entries added.

### Phase C — Registration flow (talent-facing)

- Mobile-first 8-step registration UI. Schema-driven by `agency_taxonomy_settings`.
- Server actions: each step persists progress; final submit triggers approval flow if required.
- Source-ownership preserved: `talent_profiles.created_by_agency_id` set to the registering workspace.
- Auto-provisioning of solo workspace at claim (per `talent-monetization.md` §4.4) — happens when registration completes AND talent_profiles.user_id is set.

### Phase D — Profile edit page (both modes)

- Talent mode: simple, mobile-first, save-as-you-go. `/talent/profile`.
- Admin mode: full controls. `/(workspace)/[tenantSlug]/admin/talent/[id]`.
- Dynamic field groups by talent type (reads `talent_type_field_groups`).
- Profile completeness calculation.
- Approval review tools (admin sees pending submissions; can approve / request changes / reject).

### Phase E — Plan gating

- `max_taxonomy_groups` enforced via the existing limit-check pattern (per `transaction-architecture.md` and the access module's `assertWithinLimit`).
- Locked-card UI in admin showing "Upgrade to Studio to enable Performers."
- Network plan: custom hub vocabulary creation (deferred to a separate sub-phase).

### Sequencing relative to other tracks

This work fits **after Track B.5 (shell rebuild) starts**, because the new admin shell is where the taxonomy configuration UI lives. Phases A and B can begin in parallel (data + server actions + initial admin UI). Phases C and D are downstream of B (registration depends on workspace config; profile edit depends on field groups).

Suggested integration into the existing track plan:
- **Track B.5**: includes Phase B's admin UI (workspace settings → talent types) as one of the workspace-admin surfaces
- **Track C**: includes Phase E (plan-limit on `max_taxonomy_groups`)
- **A new Track E** (post-B.5, post-C): Phases C + D — registration + profile editor

---

## 11. UX implications

### Admin: "Workspace Settings → Talent Types" page

Composes inspector kit primitives per `page-builder-invariants.md` §6. Layout:

- Top: "You're using 3 of 3 talent type groups on Free." (or unlimited badge for higher tiers)
- Enabled section: each enabled term as a card with toggle, visibility flags, custom label, helper text
- Locked section: terms beyond plan limit with upgrade CTAs
- Search/filter for the master vocabulary
- "Suggest a new term" link → super_admin review queue

### Talent: registration flow

Per the user's 8-step flow in §6. Premium feel, large card buttons, progress indicator, mobile-first responsive.

Each step is a separate route (or a stack of route-segments) so refresh/back work cleanly. Server actions persist progress between steps.

### Platform admin: master vocabulary editor

`/admin/taxonomy` (super_admin only). Cap: `platform.taxonomy.manage`.

- Add new terms (talent types, tags, skills, etc.)
- Mark terms as deprecated (hides from new enablement; existing workspaces keep)
- Merge duplicates (rare, audited)
- Define field groups for new talent types

This is platform infrastructure — not Phase B/C work; it's Phase A foundation that may need a small UI on top.

---

## 12. Out of scope for v1

- **Cross-workspace taxonomy sharing.** Each workspace's enablement is independent. No "import Acme's taxonomy preset."
- **Talent-driven taxonomy requests.** Talent can't request a workspace enable a new type; admins control the menu.
- **Hub auto-criteria based on taxonomy.** A hub COULD auto-include any talent matching certain types — that's a future hub-feature, not in this scope.
- **Multi-language term labels.** v1: terms have one display name (with `custom_label` per workspace). Locale-aware labels deferred.
- **Term-level permissions per role.** A workspace can't say "only coordinators can manage Models, only owners can manage Performers." Single admin-level cap covers all taxonomy editing.
- **Auto-suggesting types from talent's existing data.** v1: talent picks. Smart suggestions later.
- **Profile-completeness ML.** v1: completeness is a simple field-coverage percentage. Smarter quality scoring later.
- **Nuanced field-group conditional logic.** v1: field group X is shown if talent has type Y. No "X is shown if Y AND Z but NOT W." Single-condition matching only.

---

## 13. Reference scenarios

### Scenario 1 — Impronta Models (model agency, Agency plan)

Admin enables: Models, Hosts & Promo, Performers, Influencers & Creators. (4 parent types — within Agency unlimited limit.)

Disables: Chefs, Drivers, Home Services, Housekeeping, Security.

Sets `requires_approval = true` for "Belly Dancer" (a sub-term under Performers) but not for fashion models.

Outcome: Talent visiting `impronta.tulala.digital/register` see only Models / Hosts / Performers / Creators as parent options. A model registers; goes through fast approval. A belly dancer registers; goes to admin review queue.

### Scenario 2 — Hospitality hub (Network plan)

A hospitality staffing hub on Network plan creates a custom vocabulary set: Housekeepers / Drivers / Chefs / Event Staff / Security.

The hub doesn't enable Models, Hosts, Performers, etc. — none are relevant.

Outcome: registration on the hub's URL shows the hospitality menu only. A driver registering goes through driver-specific field groups (vehicle, license, service areas).

### Scenario 3 — Free-tier solo creator hits the limit

Maria signs up Free. Her industry is detected as "creators." Default 3 enabled: Models, Hosts, Creators.

She wants to also enable Music & DJs. Admin UI shows it as locked: "Upgrade to Studio to add Music & DJs."

Outcome: she either upgrades (Studio = 8 limit), changes her current selection (drop Hosts, add Music), or accepts the limit.

### Scenario 4 — Talent registers with multiple types

A talent registers at `acme.tulala.digital`. The agency has enabled Models, Hosts, Performers.

She picks: Primary = Fashion Model, Secondary = VIP Host.

The profile-edit page shows two field-group sections: "Model details" (height, measurements, runway experience) and "Host details" (event experience, languages). Both must be filled (or skipped if optional) before publish.

### Scenario 5 — Network operator builds a wellness hub

Network plan unlocks custom hub vocabulary creation. An operator launches `wellness-circle.tulala.digital` and defines new master terms: Massage Therapist, Yoga Instructor, Sound Healer, Reiki Practitioner.

Those terms are added to the master vocabulary scoped to the network operator's organization. Other workspaces can reference them (if enabled in their `agency_taxonomy_settings`); the global vocabulary grows.

---

## 14. Open questions

Smaller decisions still pending; not blockers for any current work.

1. **What's the platform-master sub-term tree depth?** Single-level (parent → child) or multi-level (parent → child → grandchild)? Recommendation: two levels max (parent talent_type → specific subtype). Deeper hierarchies confuse UX.

2. **Workspace-scoped custom subtypes** without going through platform vocabulary. Should an Agency-plan workspace be able to add a custom subtype to "Models" (e.g., "Fashion Model — Editorial-Only") without super_admin approval? Default direction: no — keep all vocabulary platform-managed for consistency.

3. **Auto-detection of workspace industry at signup.** When a new workspace signs up, do we infer their industry and auto-enable a default set, or do they pick during onboarding? Recommendation: pick during onboarding (small step in workspace onboarding flow).

4. **`requires_approval` precedence.** If the workspace's default is "no approval required" but a specific term has `requires_approval = true`, does the term-level setting win? Default direction: yes — term-level beats workspace-level (most cautious).

5. **Talent who registers, gets approved, then the agency disables the term.** What happens? Default direction: the talent's profile stays approved with that term marked as "no longer offered by this workspace" in admin view. Talent can still edit other types; the disabled type is read-only on their profile.

6. **Field-group versioning.** When platform adds a new field to "model_measurements," how does it propagate to existing talent profiles? Default direction: additive — new fields are optional and populate as null on existing profiles. Required fields can only be marked required at the platform level prospectively (not retroactively).

---

## 15. Locked vs deferred

### Locked now (architectural direction)

- Three-layer taxonomy model: master / workspace-enablement / talent-selection
- `agency_taxonomy_settings` shape (per-tenant per-term config with the documented flags)
- Plan-gated parent-type width (`max_taxonomy_groups`)
- Adaptive registration flow (8-step, schema-driven by workspace config)
- Dynamic profile-field groups by talent type (`talent_type_field_groups`)
- Two-mode profile editor (talent simple / admin advanced)
- 4 capability keys
- Build sequence (Phases A-E)
- Out-of-scope list (§12)

### Deferred (planned, not built yet)

- All migrations: `agency_taxonomy_settings`, `talent_type_field_groups`, plan-limit entry for `max_taxonomy_groups`, registration-behavior columns on `agencies`
- Cache-tag entries (`taxonomy`, `registration-flow`)
- Master-vocabulary admin UI for super_admin
- Workspace-admin "Talent Types" settings page
- Adaptive registration UI (8 steps)
- Two-mode profile editor
- Plan-limit enforcement on `max_taxonomy_groups`
- Custom-vocabulary creation for Network plan (further deferred)
- Resolution of the 6 open questions in §14

---

## 16. Page-builder integration

This subsystem builds heavily on the page-builder invariants per [`page-builder-invariants.md`](page-builder-invariants.md):

- **Workspace-admin "Talent Types" settings page** composes inspector kit primitives (`InspectorGroup`, `KIT.input`, `KIT.label`, `VisualChipGroup`). Don't re-style fields ad-hoc.
- **`agency_taxonomy_settings`** carries `version` column and follows the **CAS protocol** (`expectedVersion` round-trip + `VERSION_CONFLICT` refetch). Reference: `web/src/lib/site-admin/server/sections.ts`.
- **New cache-tag surfaces** (`taxonomy`, `registration-flow`) are added to `cache-tags.ts`. The `tagFor(tenantId, surface, qualifier?)` helper is the only path; bare strings banned.
- **The registration flow's UI components** (step screens, large card buttons, progress indicator) compose kit primitives where applicable. Mobile-first specific layout patterns may need new primitives — add to the kit, don't fork.
- **Platform-admin master-vocabulary UI** at `/admin/taxonomy` follows the same invariants: inspector kit, CAS, cache-tag discipline.
- **Custom-label workspace renames** ("Performers" → "Artists") are operator-editable text. They go through the existing token-registry pattern only if they affect the visual rendering of a token; otherwise they're plain text fields with the standard CAS-protected save.

---

## 17. Reference

This doc is the canonical source for this direction. Code, schema, or copy that conflicts must be raised as a Decision-Log amendment before being changed.

The founder's full statement that established this direction is in the session transcript dated 2026-04-25.
