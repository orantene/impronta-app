# Talent Profile Engine — Master Audit (2026-05-18)

> Canonical pre-implementation document for the **"Make Talent types & Catalog Fields Real"** phase. Combines: the prior catalog-control audit, the product-strategy alignment, and a new full talent-database / profile-field / category-rendering / files audit. Read-only audit — no code changed.
> Real table/file/function names used throughout. Unknowns are marked **UNKNOWN**.

---

## 1. Executive Summary

The talent profile engine has **one real read resolver** but a **fragmented write/storage reality** and **two severe safety gaps**.

- **Coherent & real:** `getFieldsForTalent` (`src/lib/server-actions/admin-taxonomy.ts:833`) is the canonical resolver. The admin **Details/Physical/Wardrobe** tabs (`LiveCategoryFieldsEditor`) and **Agency Fields** panel (`LiveCategoryFieldsPanel`) read it; values persist to `talent_profile_field_values` (2,329 rows / 50 talents). Identity/about/location/rates/availability/credits/limits/social = real fixed columns on `talent_profiles`. "Categories on your site" is real (`agency_taxonomy_settings`, 11,612 rows).
- **Mock (no DB writer):** `FieldPrivacyDrawer`, `FieldCatalogDrawer`, `WorkspaceFieldSettingsDrawer` write to in-memory React context only. The tenant-override tables `workspace_profile_field_settings` (19 cols) and `workspace_field_group_settings` (12 cols) **exist, have RLS + write policies, are read by the resolver, and contain 0 rows** — agencies have zero real catalog control today.
- **Dangerous (P0):** (a) **`media-originals` storage RLS is wide open** — `storage_media_originals_select_authenticated` / `_insert_authenticated` (`supabase/migrations/20250409000000_init.sql:643-648`) grant *any authenticated user* read+write to the private bucket with no owner/tenant check. Every NDA/passport/W-8/contract uploaded via `FilesEditor` is reachable cross-tenant by path. (b) **Public profile bypasses the resolver** (`src/app/t/[profileCode]/page.tsx`) — raw-queries `talent_profile_field_values` with its own visibility logic and **no taxonomy gate**, so stale values from a category the talent no longer has still render publicly.
- **Fragmented:** split-brain field storage — Details/Physical/Wardrobe → `talent_profile_field_values`; specialties/skills/contexts/refinement → **legacy `field_values`** (`profile-shell-dyn-field-values.ts:143`). Discover/search reads only legacy `field_values` (407 rows / 25 talents) — a stale partial mirror of canonical (2,329 / 50). `height_cm` is triple-written. A **second resolver** (`getFieldsForTalentAsTalent`) exists for talent self-edit.
- **Blocks SaaS readiness:** agencies cannot actually control privacy/catalog; public profile can leak/show stale fields; private documents are not access-controlled; Discover indexes the wrong table.

---

## 2. Product North Star

> **The talent profile engine is the single governed source of truth for how a talent is described, gated, shown publicly, searched, verified, and managed across talent, agency, client, and platform contexts — one catalog, one resolver, one value store, with platform-safe floors and agency-scoped control.**

Refinement: "single source of truth" must mean **one value store** (`talent_profile_field_values`), **one resolver** used by every surface (editor, Agency Fields, public profile, Discover, talent self-edit), and **one control plane** (platform defaults + tenant overrides via `workspace_*` tables). Today none of these three "ones" is fully true.

---

## 3. Source-of-Truth Map

| Data concern | Current SoT | Should remain? | Problem | Recommended SoT |
|---|---|---|---|---|
| Which fields exist | `profile_field_definitions` (273; 226 live) | Yes (platform-global) | groupless defs (123) / 3 empty groups | same + cleanup |
| Which apply to a talent | resolver `getFieldsForTalent` over `talent_profile_taxonomy`→parent walk→`profile_field_recommendations`(584, **all L1**) | Yes | recs only at parent_category granularity → all subtypes of a parent share one field set | same; (future) allow L3 recs |
| Tenant field overrides (privacy/enable/label/required) | `workspace_profile_field_settings` (0 rows) | Yes | **no writer exists** | same — wire a writer |
| Tenant group overrides | `workspace_field_group_settings` (0 rows) | Yes | no writer | same — wire a writer |
| Which categories the roster supports | `agency_taxonomy_settings` (11,612) | Yes | none (real) | same |
| Dynamic values | `talent_profile_field_values` (2,329/50) | Yes | split-brain w/ legacy | **canonical, everywhere** |
| Specialties/skills/contexts/refinement | **legacy `field_values`** via `profile-shell-dyn-field-values.ts` | No | parallel store, not in new catalog | migrate to `talent_profile_field_values` (future) |
| Discover/search facets | legacy `field_values`/`field_definitions` (407/25) | No | stale partial mirror | canonical (future, deferred) |
| Identity/contact | fixed columns on `talent_profiles` | Yes | UI "contact email" → `invitation_email` aliasing; phone = string concat | keep fixed; clarify |
| Admin/internal | `agency_talent_roster` (internal_notes, emergency_contact, field_locks_data, feature_in_directory) | Yes | per-roster not global; talent-self path can't reach | keep; document scope |
| Languages | canonical `talent_languages` (panel) vs `talent_profiles.languages_data`/bios JSON | partial | dual storage, conditional skip on `tenantId` flag | canonical `talent_languages` |
| Service area / home base | canonical `talent_service_areas` (panel) vs scalar columns | partial | dual storage, conditional skip | canonical `talent_service_areas` |
| `height_cm` | dynamic field value **+** mirrored to `talent_profiles.height_cm` from 2 paths | partial | triple-write, stale risk | dynamic value canonical; mirror one path |
| Media/photos | `media_assets` table + `media-public` bucket | Yes | none (real) | same |
| Documents/files | `talent_profiles.documents_data` JSONB + `media-originals` bucket | partial | **no real table; bucket RLS open (P0)** | dedicated table + scoped RLS |
| Trust/verification | **MOCK** (no store) | No | KYC unimplemented | future real store |
| History/audit | `talent_profile_field_value_history` (field values only) | partial | no doc/category/identity audit | broaden later |

---

## 4. Talent Editor Sidebar Audit

Render orchestrator: `saveAll()` (`drawers.tsx:5566`). Admin path → batched `commitTalentProfileShellAdmin` (`admin-talent-profile-sections.ts:476`); talent-self path → ~14 `updateSelf*` (`talent-self-profile-sections.ts`). Languages/service-areas owned by independent slot panels (skipped from batch when a real tenant exists).

| Section (id) | Source / table | Server action | Class | Notes |
|---|---|---|---|---|
| identity | `talent_profiles` (display/legal/first/last name, pronouns, gender, dob, age_display_mode, nationality, invitation_email, phone, is_discoverable, field_visibility) | `updateSelfIdentity`/batch | REAL | "contact email" persists to `invitation_email`; phone = prefix+number concat (no structured column) |
| about | `talent_profiles` (bios, bio_tone, personality_traits, tagline) | `updateSelfAbout` | REAL | |
| services | `talent_profile_taxonomy` (`syncTalentTypeTaxonomyFromShellSlugs`) | batch / `updateSelfProfileShellTaxonomy` | REAL | drives the resolver |
| profile_fields / physical / wardrobe / details ("Details" tabs) | `talent_profile_field_values` + `profile_field_definitions` via `getFieldsForTalent` | `setTalentFieldValue` (inline, not in saveAll) | REAL | the dynamic catalog |
| location | `talent_service_areas` (panel) + scalar columns | `saveTalentServiceAreas` / `updateSelfLocation` | REAL | dual storage |
| logistics | `talent_profiles` (passport_status, drivers_license, work_eligibility, remote_only, travel_fee_required) | `updateSelfLocation` | REAL | |
| availability | `talent_profiles.availability_data` | `updateSelfAvailability` | REAL | |
| media | `media_assets` + `media-public` bucket | `actionUploadAndAssignMedia` | REAL | |
| albums | photos→`media_assets`; names/order→`talent_profiles.media_albums_data` JSONB | `updateSelfMediaAlbums` / MediaGalleryDrawer | REAL | legacy `PhotoGalleryReal` is an off-path `createObjectURL` MOCK |
| polaroids | (admin) `media_assets` `variant_kind=polaroid`; (talent self) **MOCK disabled button** | media actions | MIXED | talent self-drawer stubbed |
| rates | `talent_profiles` (rates_data, rate_tiers_data, package_rates_data, rate_card_visibility, ask_for_quote) | `updateSelfRates` | REAL | |
| limits ("Restrictions") | `talent_profiles.limits_data` | `updateSelfLimits` | REAL | |
| credits | `talent_profiles.credits_data` | `updateSelfCredits` | REAL | |
| social_proof ("Past clients") | `talent_profiles.social_proof_data` | `updateSelfSocialProof` | REAL | |
| verifications ("Trust") | `talent_profiles` flags / contact_policy; **talent-self KYC = MOCK** | batch / extras | MIXED | verification queue + talent verification = mock |
| files ("Files") | `talent_profiles.documents_data` JSONB + `media-originals` (signed URL 300s) | `actionUploadTalentDocument`/`actionDeleteTalentDocument` | REAL (admin) / MOCK (talent self) | **bucket RLS open — P0**; hard delete, no audit |
| refinement ("Extra details") | skillEntries/contexts → `dynFields` → **legacy `field_values`** | dyn-field sync | MIXED | split-brain vs new catalog |
| agency_fields ("Agency Fields") | `getFieldsForTalent` (definitions only, no values) | read-only | REAL | back-office transparency projection |
| admin | `agency_talent_roster` (internal_notes, emergency_contact, field_locks_data, feature_in_directory); `talent_profiles.workflow_status` | batch `rosterMeta` | REAL | per-roster scope, not global identity |
| history | `talent_profile_field_value_history` (modal) | `getTalentFieldValueHistory` | REAL (partial) | field-values only; no actor name/agency, no doc/identity audit |

No section is a pure write-mock except the **talent-self** Documents/Verification/Tax/Polaroids drawers (disabled buttons) and the in-context Field privacy/Field catalog/Workspace-field drawers.

---

## 5. Universal / Fixed-Schema Fields

`field-canonical.ts` reserves canonical keys (display_name, first/last_name, phone, gender, date_of_birth, residence/origin geo, short_bio, location) — these **cannot** be redefined as dynamic fields. All fixed identity/contact data is columns on `talent_profiles`; admin/internal data is on `agency_talent_roster`.

| Field | Fixed schema or Dynamic? | Catalog-controlled? | Privacy-controlled? | Public? | Admin editor | Talent editor | Recommendation |
|---|---|---|---|---|---|---|---|
| display_name | Fixed (`talent_profiles`) | No | No (always public-ish) | Yes | Yes | Yes (lockable) | keep fixed |
| legal_name | Fixed | No | **Yes (mask)** | Masked | Yes | Yes (lockable) | keep fixed; privacy = mask only |
| first/last_name | Fixed | No | partial | partial | Yes | Yes | keep fixed |
| invitation_email (UI "contact email") | Fixed | No | No | No | Yes | Yes | **clarify aliasing** |
| phone (prefix+number) | Fixed (string concat) | No | No | No | Yes | Yes | future: structured column |
| whatsapp/business line | Fixed (`social_links` JSON) | No | optional | optional | Yes | Yes | keep |
| emergency_contact | Fixed (`agency_talent_roster` JSONB) | No | **never public** | No | Yes (admin) | UNKNOWN | platform-private floor |
| date_of_birth + age_display_mode | Fixed | No | Yes (mask) | Masked | Yes | Yes | keep |
| gender/pronouns | Fixed | No | No | Yes | Yes | Yes | keep |
| profile_code / public slug | Fixed (system) | No | n/a | URL | No | No | keep |
| workflow_status / visibility | Fixed | No | n/a | n/a | Yes (admin) | status only | keep |
| internal_notes | Fixed (`agency_talent_roster`) | No | **never public** | No | Yes (admin) | No | platform-private floor |
| height/bust/waist/etc., skin tone, languages-as-catalog, all "Details" | **Dynamic** (`talent_profile_field_values`) | **Yes** | **Yes** | per visibility | Yes | Yes | catalog + privacy controlled |

**Rule:** Fixed identity/contact/admin columns are **NOT** agency-catalog-controllable (platform owns identity & safety). Dynamic catalog fields ARE. Agency Fields panel should *display* fixed columns as read-only context but never offer to "control" them.

---

## 6. Category-Specific Field Audit

Taxonomy (`taxonomy_terms`, active): **19 parent_category (L1) · 75 category_group (L2) · 438 talent_type (L3)**. Parent categories include: Models, Hosts & Promo, Performers, Music & DJs, Chefs & Culinary, Wellness & Beauty, Photo/Video & Creative, Influencers & Creators, Event Staff, Hospitality & Property, Travel & Concierge, Transportation, Home & Technical, Security & Protection, Sports & Fitness, Kids & Family, Speakers/Coaches, Production/BTS, Animals & Specialty.

Field defs: 226 live = **11 universal + 33 global (always-on for everyone) + 182 type-specific** (gated by a `profile_field_recommendations` row matching a talent term). 584 recs, 134 `parent_category_field_groups`, 13 groups (12 active).

| Talent type → parent | Resolved field groups | Source rule |
|---|---|---|
| Editorial Model → Models | availability, experience, languages-communication, media-portfolio, physical-casting, rates-booking, service-area-travel, trust-verification (8) | parent_category_field_groups + recs |
| House DJ → Music & DJs | availability, equipment-tools, experience, media-portfolio, operational-requirements, rates-booking, service-area-travel (7) | same |
| Fashion Photographer → Photo/Video | availability, equipment-tools, experience, media-portfolio, operational-requirements, rates-booking (6) | same |
| Chef types → Chefs & Culinary | resolvable (41 recs) | same |

**Critical:** **all 584 recommendations are keyed to L1 `parent_category` (0 to talent_type/category_group).** The resolver's parent-walk makes it functional, but **two talent types under the same parent resolve an identical field set** (Editorial Model = Runway Model). Field differentiation is only parent-category-deep today.

---

## 7. Fixed Schema vs Dynamic Catalog

- **Fixed schema (platform-owned, never agency-catalog):** identity, contact, legal, emergency, admin notes, workflow/visibility, slug — columns on `talent_profiles` / `agency_talent_roster`. Reserved by `field-canonical.ts`.
- **Dynamic catalog (engine, agency-influenceable):** everything under Details/Physical/Wardrobe — `profile_field_definitions` → `talent_profile_field_values`.
- **Wrongly split (should be canonical, currently legacy):** specialties, skills, contexts, refinement → legacy `field_values`.
- **Dual-stored (correctness depends on a runtime flag):** languages (`talent_languages` vs JSON), service area (`talent_service_areas` vs scalars), `height_cm` (value + 2 mirror paths → column).
- **Decision:** never move fixed identity/admin into the dynamic engine; never let the engine redefine reserved keys. Converge specialties/skills/contexts onto canonical (future phase).

---

## 8. Agency Fields as Truth Preview

Today `LiveCategoryFieldsPanel` (`drawers.tsx:2174`, mounted as the Back-Office "Agency Fields" rail section) is **read-only**, calls **only** `getFieldsForTalent` → shows the resolved **field definitions/labels/tiers/required badges, no values, no source attribution, no visibility state**.

**Recommendation: confirmed — Agency Fields should become the engine transparency panel.** It must answer, per talent: *why is this field here* (which category/recommendation), *universal vs type-specific*, *public/admin-only/hidden* (effective), *required (platform vs agency)*, *platform-default vs agency-override*, *active/inactive*, *does the talent have a value, is it missing*. It must stay **read-only** (editing stays in Details). Add a **"view as" mode** (public client / admin / talent) so an agency sees exactly what each audience sees. This is the single highest-trust feature and is cheap once Field Privacy is real.

---

## 9. Field Privacy — Product Rules

**Two orthogonal axes — separate them.** Visibility (Field Privacy): **Public · Admin-only · Hidden**. Requirement (Field Catalog, not Privacy): **Optional · Required** — "required" is a completeness/governance concern, not who-can-see.

Backed by existing columns: `workspace_profile_field_settings.show_in_public_override / admin_only_override / default_visibility_override` (+ group-level `workspace_field_group_settings.show_in_public_profile`).

**Precedence (most-restrictive-wins for safety):**
1. **Platform floor:** `profile_field_definitions.admin_only=true` or `is_sensitive=true` → tenant/talent **cannot** raise to public.
2. **Tenant override:** may make a platform-public field Admin-only or Hidden (more restrictive only).
3. **Talent value override** (`visibility_override`): may only narrow within what the tenant allows.
4. Staff/admin always see admin-only + hidden where roster-scoped (RLS-permitted).

| User type | Public field | Admin-only field | Hidden field |
|---|---|---|---|
| Public visitor | see | never | never |
| Client | see | never | never |
| Agency owner/admin | see + edit | see + edit | see (greyed) + edit |
| Coordinator | see | see (read) | see (read) |
| Talent | see; may narrow | see own value, "admin-only" label | sees field exists, value retained, not public |
| Platform admin | see | see | see |

"Hidden" = hidden from public **only**; still editable/visible in admin + talent editors (data retained). Public profile always applies the most restrictive effective rule.

---

## 10. Field Catalog — Product Rules (MVP)

Schema for tenant control **already exists, RLS-secured, resolver-read, empty.** MVP = wire a writer; **no migration**.

| Capability | Decision | Backing |
|---|---|---|
| View platform catalog | Build now (read) | `profile_field_definitions` |
| Enable/disable platform field per workspace | Build now | `workspace_profile_field_settings.enabled_override` |
| Per-workspace relabel / helper | Build now | `custom_label` / `custom_helper` |
| Required per field per workspace | Build now | `required_override` |
| Group enable + relabel | Build now | `workspace_field_group_settings` |
| Reorder fields/groups | Defer | `display_order_override` exists, low value |
| Agency **custom new** field definitions | **Defer — platform-admin-governed later** | needs ownership/abuse model; `profile_field_definitions` is platform-global |
| Category-specific requirements | Defer | richer model needed |

---

## 11. Category Control Rules

Disabling a category (e.g. "Dancer") must:
- Hide it from the public site + Discover filters.
- Prevent new talent selecting it (services editor / future registration).
- Remove its fields from the Details editor resolution (resolver already group-gates).
- **Preserve** existing `talent_profile_field_values` — never delete; mark **inactive/internal** (admin can still see, recoverable on re-enable).
- Hide those fields/values on the public profile.
- Show a **confirmation warning** when disabling a category that has filled values.
- Discover hides talents from that category facet; AI matching ignores it.
**Confirmed: never delete values, preserve history, hide publicly, prevent new selection, recoverable.**

---

## 12. Files, Media & Private Uploads Audit

Buckets: `media-public` (**PUBLIC**), `media-originals` (private), `inquiry-files` (private), `pitch-files` (private).

| Surface | Public/Private | Bucket | DB | Upload | Delete | Risk |
|---|---|---|---|---|---|---|
| Media/gallery/avatar/hero | Public | media-public | `media_assets` (talent+tenant scoped, soft-delete) | REAL | Yes | Low (correct `getPublicUrl`) |
| Albums | Public | media-public | media_assets + `media_albums_data` JSONB | REAL | Yes | Low |
| Files/documents (admin) | Private | **media-originals** | `talent_profiles.documents_data` JSONB (no table) | REAL (`actionUploadTalentDocument`) | Yes (hard, no audit) | **P0 — see below** |
| Polaroids (talent self) | — | — | mock | MOCK (disabled) | No | dead button |
| Documents/Verification/Tax (talent self) | — | — | mock | MOCK (disabled) | No | KYC/trust fake |
| Verification queue (admin) | — | — | mock | MOCK | No | no real doc store |

**P0 — private documents are world-readable to any authenticated user.** `supabase/migrations/20250409000000_init.sql:643-648`: `storage_media_originals_select_authenticated` (`FOR SELECT TO authenticated USING (bucket_id='media-originals')`) and `_insert_authenticated` grant **all authenticated users** read+write to `media-originals` with **no owner/tenant/path predicate**. Later migrations *add* staff/talent path policies but do not `DROP` the broad ones (RLS is permissive-OR), so any talent/client can read/write any NDA/passport/W-8/contract by path (`<talent_profile_id>/documents/<uuid>`). UUID filenames mitigate guessing but talent_profile_id is broadly known. **Cross-tenant private-document exposure.** (UNKNOWN: not verified against live prod RLS — recommend `SELECT * FROM pg_policies WHERE tablename='objects' AND policyname LIKE '%media_originals%';` before fix.)

---

## 13. Public Profile Safety Audit

Public page `src/app/t/[profileCode]/page.tsx` **bypasses `getFieldsForTalent`**: raw-queries `talent_profile_field_values` (`fetchPublicFieldValues` ~:377) with its own visibility logic (`workflow_state='live'`, `!deprecated_at`, `!admin_only`, effective `visibility_override||default_visibility` includes `public` OR `show_in_public`); sidebar section gating uses **legacy `field_definitions`** via `getPublicProfileFieldVisibility` (`public-profile-field-visibility.ts:24`).

| Concern | Currently public? | Should be? | Risk | Fix |
|---|---|---|---|---|
| Value from a category the talent no longer has | **Yes** (no taxonomy gate) | No | HIGH | resolver-gate |
| Tenant `admin_only_override` / `hidden` | **No** (overrides empty + not applied) | No | HIGH (once overrides exist they won't apply) | resolver-gate |
| Platform `admin_only` / sensitive | No (filtered) | No | OK | keep |
| Legacy `field_definitions`-driven section visibility | divergent logic | use one engine | MED | unify |
| Empty values | UNKNOWN (likely shown as section) | "not provided" or hidden | LOW | rule |

**Rule:** public profile must render only fields that are `live` ∧ effective-visibility public ∧ applicable to current taxonomy ∧ tenant-enabled ∧ not admin_only/hidden ∧ not deprecated — via the **same resolver core** as the editor. Values preserved in DB, gated out of render.

**Per-agency surface:** if a talent appears on two agency sites, visible fields **may differ** (each tenant's overrides). Canonical = the talent's global value store; **agency context = a filter/lens on top**, never a separate value copy.

---

## 14. Discover / Search Alignment

Discover card display (`fetch-directory-page.ts:733`), facet filters (`apply-directory-field-facet-filters.ts:56`), legacy keyword search (`directory-search-legacy.ts:56`) all read **legacy `field_values` / `field_definitions`** (407 rows / 25 talents / ~40 defs) — not canonical (2,329 / 50 / 273). Sync via `mirrorWriteToLegacy` (~17 bridged keys only).

Product risk: clients **cannot find** talent by any non-bridged field; facets operate on a stale near-empty mirror; new-catalog values are invisible to search. Hidden/admin-only do not currently leak into search (different table) but there is **no shared visibility rule** — a future bridge expansion could leak.

**Short-term:** document & defer (do not touch Discover this phase). **Long-term:** migrate Discover/facets to canonical `talent_profile_field_values` + the shared resolver/visibility core (own search-infra phase). **Risk of deferral: medium** (search quality gap, known, contained).

---

## 15. Duplication & Legacy Cleanup

| Concept A | Concept B | Conflict | Recommendation |
|---|---|---|---|
| `talent_profile_field_values` | legacy `field_values` | split-brain (Details vs specialties/skills/contexts) | converge on canonical (future) |
| Field privacy drawer | Field catalog drawer | both mock; required overlaps | privacy=visibility, catalog=enable/label/required |
| Details | Agency Fields | editor vs read-only projection | keep distinct (edit vs transparency) |
| Languages JSON | `talent_languages` | dual store | canonical table |
| Service-area scalars | `talent_service_areas` | dual store | canonical table |
| `height_cm` value | `talent_profiles.height_cm` mirror (×2 paths) | triple-write | one mirror path |
| `getFieldsForTalent` | `getFieldsForTalentAsTalent` | two resolvers | extract one shared pure core |
| Public profile visibility logic | resolver visibility | divergent | one `effectiveVisibility()` |
| `invitation_email` | "contact email" UI | aliasing | rename/clarify |

---

## 16. Database Health Checks

| Check | Result | Risk | Fix |
|---|---|---|---|
| Duplicate field keys | **0** | none | — |
| Orphan values (no definition) | **0** | none | — |
| Values on deprecated defs | **0** | none | — |
| Recs → missing def | **0** | none | — |
| Defs with no group (live) | **123** | low–med (groupless = universal/global by design, but verify) | classify |
| Groups with no active def | **3** | low | deprecate empty groups |
| Recs at L3 talent_type | **0 of 584** (all L1) | **med** (no per-subtype differentiation) | future: L3 recs |
| Canonical values | 2,329 / 50 talents | — | — |
| Legacy `field_values` | 407 / **25** talents | med (Discover sees ~½ talents, fraction of values) | migrate Discover |

Engine integrity is **clean** (no orphans/dupes/deprecated-leaks). The issues are *architectural* (split stores, L1-only recs, mock control), not data corruption.

---

## 17. Recommended Product Decisions (need founder approval before coding)

1. Field Privacy = **Public / Admin-only / Hidden**; "Required" lives in Field Catalog, not Privacy.
2. Precedence: **platform `admin_only`/`is_sensitive` = hard floor**; tenant may only restrict further; talent narrows within tenant.
3. Field Catalog MVP = enable/disable + relabel + helper + required + group enable; **custom new fields deferred**.
4. Disabling a category **preserves values as inactive**, never deletes; warns when filled; recoverable.
5. Public profile must go through the shared resolver core (resolver-gate) — non-negotiable safety.
6. Discover = **documented & deferred** this phase.
7. Cache = tenant-scoped key + `revalidateTag` on every settings write (export the unused `field-catalog` tag).
8. Agency Fields becomes the **read-only transparency panel** with "view as" modes.
9. **P0 storage RLS fix** (media-originals) treated as a security hotfix, separate from the catalog phase.
10. Governance: only **owner/admin** may change category/privacy/catalog settings (coordinators/editors read-only); all changes audited; confirm before hiding fields that hold data; reset-to-platform-default supported.
11. Plan tiers (proposed, do not hardcode now): Free = view only; Studio = privacy + enable/disable; Agency = + relabel/required/group; Network = + (future) custom fields. Build the data model tier-agnostic; gate in UI later.

---

## 18. Recommended Implementation Roadmap

- **Phase 0 (security hotfix, separate):** scope-correct `media-originals` RLS (owner/tenant/path predicate; drop or supersede the broad authenticated policies). Migration. Highest urgency; not part of catalog phase.
- **Phase 1 — Make Field Privacy real:** server actions `getWorkspaceFieldSettings` / `setWorkspaceFieldVisibility` (RLS-ready), one shared pure `effectiveVisibility()`, wire `FieldPrivacyDrawer`, `revalidateTag`. No migration. **Lowest risk; highest leverage.**
- **Phase 2 — Field Catalog MVP real:** enable/disable/relabel/required + group settings; lock deferred items (no fake buttons).
- **Phase 3 — Resolver-gate public profile:** extract shared resolver core; repoint `/t/[profileCode]`; preserve values, gate render.
- **Phase 4 — Agency Fields truth preview:** source attribution + visibility/required + "view as" modes.
- **Phase 5 — Talent editor IA cleanup:** converge the dual resolver; address split-brain/dual-store (per `feedback_admin_editor_field_layout` + editor-IA backlog).
- **Phase 6 — Discover canonical alignment:** migrate facets/search to canonical (own phase).
- **Phase 7 — Custom fields (future):** platform-governed, tier-gated.

## 19. Acceptance Criteria (next phase, Phase 1)

- Changing a field's privacy persists to `workspace_profile_field_settings` and survives refresh.
- Details editor, Agency Fields, and public profile all reflect the setting via one `effectiveVisibility()`.
- Platform `admin_only` cannot be overridden to public (enforced + tested).
- No mock/in-memory state remains in `FieldPrivacyDrawer`.
- `revalidateTag` busts the catalog cache on save; no >120s stale window.
- Zero talent values deleted; empty `workspace_*` table = exact current behavior (safe default).

## 20. Open Questions (founder)

1. Plan-tier matrix for catalog controls — confirm the proposed split.
2. Should "Hidden" ever be hidden from the *talent's own* editor, or only public? (recommended: public only).
3. Custom-field governance model — platform approval vs free agency creation (recommended: platform-governed).
4. Should disabling a category also retract already-published public profiles immediately, or on next save? (recommended: immediately via resolver-gate).
5. Discover migration priority vs other roadmap items.
6. P0 storage RLS — confirm it is treated as an out-of-band security hotfix (recommended: yes, now).
7. L1-only recommendations — accept parent-category-deep field sets for now, or invest in L3 differentiation?

---

*Audit performed read-only. No runtime behavior changed. Sources: code inspection (drawers.tsx, live-category-fields-editor.tsx, admin-taxonomy.ts, talent-self/admin profile sections, public profile + directory paths, supabase/migrations), live DB introspection via `scripts/qa-sql-query.mjs`, and the prior catalog-control + product-strategy passes.*
