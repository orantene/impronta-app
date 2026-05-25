# Resolver Coverage Pass - 2026-05-25

## Goal

Make the shared profile field resolver the enforcement point for profile field surfaces, not just the UI loader.

This pass is scoped to coverage mapping plus one safe enforcement fix. It does not change media/photos, delete data, rewrite registration, or cut directory filters over to the new catalog.

## Coverage map

| Surface | Resolver coverage | Current status | Next action |
|---|---:|---|---|
| Admin roster drawer Details | Full read coverage | `LiveCategoryFieldsEditor` calls `getFieldsForTalent`, which wraps `resolveTalentFields`. Dynamic Details categories and required blockers consume the resolved field list. | Keep covered by focused field-engine tests. |
| Admin catalog value writes | Full write gate after this pass | `setTalentFieldValue` now checks that the requested field exists in `resolveTalentFields` for that talent and tenant before upsert/delete. | Add deeper integration test once server-action DB fixtures are available. |
| Admin catalog visibility writes | Full write gate after this pass | `setTalentFieldVisibility` now uses the same resolver gate before mutating visibility overrides. | Add platform-safety floor checks for sensitive fields in the next privacy pass. |
| Talent self-edit Details | Full read coverage | `/talent/profile/fields` mounts `LiveCategoryFieldsEditor` with `getFieldsForTalentAsTalent`, which wraps `resolveTalentFields`. | Browser QA with a claimed talent account. |
| Talent self catalog value writes | Full write gate after this pass | `setTalentFieldValueAsTalent` now checks `talent_editable`, deprecated state, active tenant roster, and resolver availability before mutating values. | Add integration test for tenant-disabled and type-mismatched fields. |
| Talent self visibility writes | Full write gate after this pass | `setTalentFieldVisibilityAsTalent` now mirrors the talent-editable and resolver availability checks. | Add privacy-floor guard so sensitive/admin-only fields cannot be made public by talent. |
| Public profile | Full read coverage with fallback | `/t/[profileCode]` resolves fields with `resolveTalentFields` and applies visibility/governance. A fallback remains for local/service misconfiguration. | Keep fallback until public-profile resolver path has production telemetry. |
| Publish blockers | Partial | Core universal floor is hardcoded in `buildCorePublishRequirements`; Details/type-specific blockers are resolver-driven via `buildProfilePublishRequirements`. | Move universal requirements into an engine-owned config once universal fields are modeled as first-class resolver requirements. |
| Tenant Field Catalog / Privacy | Partial | Tenant settings read platform definitions and workspace overrides. Field Privacy now shares catalog labels/order, but it is not yet a full resolved preview per talent type. | Build tenant preview by selected type using `resolveTalentFields` or a type-simulation resolver. |
| Platform Catalog / Taxonomy | Partial | Platform admin edits canonical field/taxonomy tables and shows impact diagnostics, but platform preview is not yet the only source every surface consumes. | Add mutation audit history and impact preview before applying risky visibility/lifecycle changes. |
| Talent registration / onboarding | Not covered | Auth/onboarding captures fixed identity basics, then sends talent to the dashboard. It does not mount dynamic resolved field groups during registration. | Add a post-account onboarding profile step powered by the resolver after tenant/type selection. |
| Directory filters/cards | Partial/legacy | Directory still uses `field_definitions` plus legacy/RPC scalar paths for several facets/cards. Some profile catalog values are mirrored to legacy for compatibility. | Plan a staged directory cutover: profile catalog -> search document -> facet RPCs -> card attributes. |

## Fix shipped in this pass

The live editor already read through the resolver, but server writes could still target any non-deprecated `profile_field_definitions` row by id. This created a mismatch: hidden, tenant-disabled, or type-mismatched fields could be written if a stale client or script knew the id.

Changed files:

- `web/src/lib/server-actions/admin-talent-field-values.ts`
- `web/src/lib/server-actions/talent-field-values-catalog.ts`
- `web/src/lib/server-actions/admin-talent-field-values.security.test.ts`
- `web/src/lib/server-actions/talent-field-values-catalog.security.test.ts`

Behavior now:

- Admin value writes require the field to be present in `resolveTalentFields({ viewerRole: "agency_admin" })`.
- Admin visibility writes use the same resolver gate.
- Talent value writes require active tenant roster membership, `talent_editable !== false`, no `deprecated_at`, and resolver availability.
- Talent visibility writes now use the same editable-field and resolver gates as talent value writes.

## Deferred by design

- No registration UX rewrite in this pass.
- No directory RPC/schema cutover in this pass.
- No platform field lifecycle mutations.
- No uploaded media or photo data touched.
- No destructive cleanup.
