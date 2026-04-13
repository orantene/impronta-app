# Profile editing section mapping (truthful schema contract)

This document is the source-of-truth map between **UI sections**, **schema tables**, **role visibility/editability**, and **save pathways**.

## Roles

- **client**: non-staff, no profile editing/admin surfaces
- **talent**: self-service editing of *own* profile (allowed fields only)
- **agency_staff**: staff operational editing surfaces
- **super_admin**: all staff permissions + privileged controls (e.g. role changes)

## Visibility classification

- **Public**: can appear on public profile (`/t/[profileCode]`) when allowed by public contracts/RLS
- **Agency-private**: visible to staff/admin; not public
- **Internal-only**: operational/admin-only; not part of normal profile presentation

## Talent: `/talent/my-profile` (Priority 1)

| Section | Source table(s) | Visible to | Editable by | Classification | UI surface | Save action |
|---|---|---|---|---|---|---|
| Command header | `talent_profiles`, `media_assets`, `talent_workflow_events`, derived checklist | talent | — | Mixed (labels shown) | Inline header | — |
| Public profile | `talent_profiles` (`display_name`, `short_bio`, `location_id`, `first_name`, `last_name`) | talent | talent (own) | Public + Agency-private (first/last) | Rich card + **Sheet** | `updateTalentProfile` (`web/src/app/(dashboard)/talent/actions.ts`) |
| Categories & tags | `talent_profile_taxonomy`, `taxonomy_terms` (filtered by field governance) | talent | talent (own) | Agency-private (until approved/public) | Compact strip + **Sheet** | `assignTaxonomyToSelf` / `removeTaxonomyFromSelf` (`web/src/app/(dashboard)/talent/actions.ts`) |
| Attributes & specs | `field_definitions`, `field_values` (talent-editable only) | talent | talent (own) | Mixed per field (Public/Agency-private/Internal-only labeled) | Compact strip + **Sheet** | `saveTalentScalarFieldValues` (`web/src/app/(dashboard)/talent/field-values-actions.ts`) |
| Portfolio | `media_assets`, Supabase Storage | talent | talent (own) | Agency-private until approved derivatives | Visual block + **Page** | `web/src/app/(dashboard)/talent/media-actions.ts` |
| Review & submission | `talent_profiles`, `talent_submission_*` (via RPC) | talent | talent (own) | Operational (workflow) | Side panel + **Sheet** | `submitTalentForReview` (`web/src/app/(dashboard)/talent/actions.ts`) |
| Preview public profile | public profile route `/t/[profileCode]` (+ owner `?preview=1`) | talent | — | Public contract only | Header CTA | — |

## Admin: `/admin/talent/[id]` (Priority 2)

| Section | Source table(s) | Visible to | Editable by | Classification | UI surface | Save action |
|---|---|---|---|---|---|---|
| Command header (ops) | `talent_profiles`, `profiles`, `media_assets`, `talent_submission_*`, `talent_workflow_events`, derived completion/checklist | agency_staff, super_admin | — | Mixed | Inline/panel header | — |
| Account | `profiles` (`display_name`, `account_status`, `app_role`) | agency_staff, super_admin | agency_staff (limited), super_admin (privileged) | Internal ops | Summary + **Sheet** | `adminUpdateUser` (`web/src/app/(dashboard)/admin/users/actions.ts`) |
| Public profile | `talent_profiles` (`display_name`, `short_bio`, `location_id`) | agency_staff, super_admin | agency_staff | Public | Summary + **Sheet** | `updateTalentProfile` (`web/src/app/(dashboard)/admin/talent/actions.ts`) |
| Agency-private identity | `talent_profiles` (`first_name`, `last_name`) | agency_staff, super_admin | agency_staff | Agency-private | Summary + **Sheet** | `updateTalentProfile` |
| Workflow & visibility | `talent_profiles` (`workflow_status`, `visibility`) + `talent_workflow_events` | agency_staff, super_admin | agency_staff | Internal ops | Ops panel + **Sheet** (confirm modals for destructive transitions) | `updateTalentProfile` (+ inserts workflow events) |
| Featured / merchandising | `talent_profiles` (`is_featured`, `featured_level`, `featured_position`, `membership_tier`) | agency_staff, super_admin | agency_staff | Internal ops | Compact strip + **Sheet** | `updateTalentProfile` |
| Submission & workflow history | `talent_submission_history`, `talent_submission_consents`, `talent_workflow_events` | agency_staff, super_admin | — | Internal ops | Read-only panel | — |
| Taxonomy / roles / tags | `talent_profile_taxonomy`, `taxonomy_terms` | agency_staff, super_admin | agency_staff | Mixed (depends on kind) | Summary + **Sheet** (upgrade to page if heavy) | `assignTaxonomyTerm` / `removeTaxonomyTerm` (`web/src/app/(dashboard)/admin/talent/actions.ts`) |
| Field values (staff scalar) | `field_definitions`, `field_values` | agency_staff, super_admin | agency_staff (per `editable_by_staff`) | Mixed per field flags | Summary + **Sheet** | `saveAdminTalentScalarFieldValues` (`web/src/app/(dashboard)/admin/talent/actions.ts`) |
| Media | `media_assets` + Storage | agency_staff, super_admin | agency_staff | Mixed (public derivatives gated) | Visual preview + **Page** | `/admin/talent/[id]/media` + `admin-media-actions.ts` |

## Notes / current gaps (truth preserved)

- **Completion % today**: talent-side is checklist-driven; admin-side currently doesn’t compute a rich “missing blockers” list. We will compute it in the cockpit from real fields (no fake columns) and show missing items + blockers.\n+- **Taxonomy admin UX today**: grouped by kind but currently a flat toggle list; will be upgraded to searchable + clearer summaries and potentially a dedicated page if it grows.\n+- **Public/Agency-private/Internal-only labeling**: field system flags support Public/Internal-only; “agency-private” is not explicitly encoded for every field, so UI will label based on current truth (table/column + known contracts) and document any gaps.

