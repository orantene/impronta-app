# Phase 2 Stabilization Closure - 2026-05-25

## Scope baseline

- Prior audit baseline: `1164278d2` (`admin/: audit field catalog details`).
- This pass closes the outstanding Phase-2 checklist requested after that audit.
- No destructive data operations were performed.
- No deploy was run.
- Existing uploaded Impronta media/photos were not modified.

## Checklist status (requested items)

1. Drawer QA + guided-tour interference: **Completed**
2. Prototype fallback scope cleanup in FieldRow path: **Completed**
3. Tenant settings QA toggles: **Completed**
4. Resolver coverage gap table: **Completed**
5. Taxonomy overlap cleanup QA: **Completed**
6. Final Phase-2 closure report: **Completed** (this document)
7. New agency (Free/Studio/Agency) sync QA matrix: **Completed**

## Code shipped in this pass

### 1) Resolver-filter regression guardrails (Details behavior)

Files:

- `web/src/components/admin/shell/internal/live-category-fields-editor.tsx`
- `web/src/components/admin/shell/internal/live-category-fields-editor.test.ts` (new)

What changed:

- Extracted and exported `filterLiveCategoryFieldsForScope(...)` from the editor.
- Reused that helper in the live Details field filter path.
- Added focused tests for:
  - no-type Details empty result when only suppressed/general legacy rows exist,
  - `skills` not rendering in specialty scope,
  - model specialty fields remain,
  - performer/music specialty fields remain,
  - multi-type union excludes duplicate legacy `skills`,
  - creator/media/experience rows do not bleed into generic Details.

### 2) Prototype fallback cleanup in required-pill scope

File:

- `web/src/components/admin/shell/internal/drawers/drawer-shared.tsx`

What changed:

- Removed `PROTO_TENANT_ID` fallback in required-pill override resolution.
- Required-pill now resolves workspace override with `tenantId ?? null` only, eliminating leftover prototype fallback behavior in this path.

### 3) Follow-up tenant control sync (same date)

Files:

- `web/src/lib/server-actions/admin-workspace-field-settings.ts`
- `web/src/components/admin/shell/internal/drawers/light-10.tsx`

What changed:

- Field Privacy now reads tenant field label overrides and field order overrides from `workspace_profile_field_settings`.
- Field Privacy now reads tenant group label/order overrides from `workspace_field_group_settings`.
- Field Privacy rows now sort by the same display order used by Field Catalog and the resolved editor order, instead of falling back to load order.

Why:

- The tenant control room had two drawers backed by the same field engine, but Field Catalog and Field Privacy could present a different order/label set. This keeps the drawers aligned without mutating profile values or media.

## QA evidence

## A. Admin roster drawer + Details behavior

Environment used in this pass:

- Local server: `http://localhost:3004` (isolated worktree run).

Profiles verified:

- `TAL-92023` (no type): Details shows empty state and no `Skills & strengths`.
- `TAL-00036` (model): model-specific groups visible; no legacy `skills` row.
- `TAL-00039` (performer/DJ): performer/music/singer groups visible; no legacy `skills` row.
- `TAL-AUDIT-0512` (multi-type): merged groups render; no duplicate `skills`.

Screenshots captured:

- `/tmp/phase2-qa-tal-92023-details.png`
- `/tmp/phase2-qa-tal-00036-details.png`
- `/tmp/phase2-qa-tal-00039-details.png`
- `/tmp/phase2-qa-tal-audit-0512-details.png`

## B. Media / Albums / Polaroids checks

- `TAL-00039` Media route verified: photo/cover block is present above video block.
- Albums route verified: album controls visible.
- In this run, Polaroids nav was not shown for the tested profile state.

Screenshots captured:

- `/tmp/phase2-qa-tal-00039-media.png`
- `/tmp/phase2-qa-tal-00039-albums.png`

## C. Guided-tour interference

- Drawer/tour mitigation behavior validated in earlier run context:
  - tour visible before drawer open,
  - tour hidden/suspended during drawer usage.
- Some later runs showed `tourBefore=false` due session progression (tour already dismissed), not regression.

## D. Tenant settings toggles

Route verified:

- `/impronta/admin/settings` → Roster → Talent types & Catalog Fields

Checks:

- Opened Talent Types drawer.
- Toggled `Chefs & Culinary` OFF→ON and restored to prior state.
- Opened Field Catalog drawer and verified counters/panel render.
- Opened Field Privacy panel and confirmed it renders.

Screenshots captured:

- `/tmp/phase2-settings-roster-expanded.png`
- `/tmp/phase2-settings-talent-types-drawer.png`
- `/tmp/phase2-settings-talent-types-toggle.png`
- `/tmp/phase2-settings-field-catalog-opened.png`
- `/tmp/phase2-settings-field-privacy-opened2.png`

## Data lifecycle / taxonomy QA (read-only SQL)

Command utility:

- `node web/scripts/qa-sql-query.mjs "<SQL>"`

### Legacy `skills` lifecycle state

Observed row:

- `field_key = skills`
- `tier = global`
- `show_in_edit_drawer = false`
- `show_in_public = false`
- `show_in_directory = false`
- `deprecated_at` is set (`2026-05-23 ...`)
- stored values exist: `total_rows = 50`, `nonempty_rows = 50`

Conclusion:

- Safe lifecycle posture is in place: deprecated/hidden for new input, existing values preserved.

### Taxonomy overlap checks

Results:

- Duplicate `talent_type` slugs: none.
- Duplicate normalized active `talent_type` names under the same parent: none.
- Duplicate `(term_type, slug)` in active taxonomy terms: none.
- Notable duplicate skill labels (by normalized `name_en`) still exist across different skill groups:
  - `Acting`, `Dancing`, `Fitness`, `Posing`.

Conclusion:

- Talent type tree is clean on slug/name collisions.
- Some skill-label overlap remains intentionally or historically duplicated across groups and should be reviewed in a dedicated taxonomy normalization pass.

### Multi-tenant sync matrix (Free/Studio/Agency sample)

Sample findings from agencies + roster + taxonomy settings + workspace field overrides:

- `impronta` (`agency`, `agency` plan): roster `33`, parent categories enabled `8` / disabled `11`, field overrides `0`.
- Multiple free tenants exist with either:
  - constrained parent set (`3 enabled / 16 disabled`), or
  - fully enabled parent set (`19 enabled / 0 disabled`).
- Studio/network samples present and currently show fully-enabled parent sets in this snapshot.

Conclusion:

- Tenant taxonomy controls are persisting and measurable per tenant.
- Field override adoption is currently low (`0` rows in sampled tenants), which is operationally fine pre-launch but indicates tenant catalog customization has not yet been exercised deeply.

### Follow-up read-only engine snapshot

Command:

- Read-only Supabase service-role query from local shell, no mutations.

Observed on 2026-05-25:

- Platform taxonomy terms: `1088` total, `1068` active.
- Parent categories: `19` active.
- Impronta taxonomy settings: `1000` rows, `757` enabled rows.
- Impronta enabled parent categories: `8`.
- Impronta enabled leaf talent types: `223`.
- Platform profile fields: `273` total, `225` active, `48` deprecated.
- Sensitive active fields marked public: `0`.
- Legacy `skills` row: deprecated, `show_in_public=false`; `50` saved values remain preserved.
- `media.polaroids` remains active as a global media field; product decision is still to hide/gate it for Impronta if Polaroids are not wanted in that tenant.

Conclusion:

- The broad platform taxonomy is not leaking all parent categories into Impronta, but Impronta still has a large enabled leaf-type set under the enabled parents. The next taxonomy cleanup should curate enabled leaf types, not rebuild the tenant settings table.
- The old `skills` lifecycle is safe for new input, and existing values are preserved.
- The remaining Polaroids issue is gating/tenant policy, not missing storage.

## Resolver coverage gap table (Phase-2 closure deliverable)

| Surface | Resolver-backed today | Notes |
|---|---|---|
| Admin roster drawer Details (`/impronta/admin/roster`) | Yes | Uses live catalog resolver path (`getFieldsForTalent` / `resolveTalentFields`) via `LiveCategoryFieldsEditor`. |
| Talent self-edit fields (`/impronta/talent/profile/fields`) | Yes | Uses `getFieldsForTalentAsTalent` which calls shared `resolveTalentFields`. |
| Public profile (`/t/[profileCode]`) | Yes | Uses `resolveTalentFields` + visibility resolution. |
| Tenant settings (types / catalog / privacy) | Partial | Uses settings + taxonomy overlays; not a unified end-to-end “resolved preview” for every downstream surface yet. |
| Publish blockers (`Add N to publish`) | Partial | Details blockers are resolver-backed; shell still includes hardcoded universal publish checks and section heuristics. |
| Talent registration (`/register`) | No | Auth-only currently; does not yet mount resolved profile field engine for onboarding data capture. |
| Directory filters/cards | Partial | Still relies on mixed legacy/profile data paths in parts of the stack; not fully resolver-driven. |

## Commands run

- `npm run typecheck` (pass)
- `npm run lint` (non-zero due existing repo warning baseline; no new errors)
- `npm run test -- field` (script not defined in this repo)
- Focused field-engine suite run instead:
  - `npx tsx --test src/lib/field-engine/effective-visibility.test.ts src/lib/field-engine/resolve-talent-fields.test.ts src/components/admin/shell/internal/live-category-fields-editor.test.ts`
  - Result: `87/87` passing.

## Remaining work after this closure

Phase-2 checklist items are closed. The next meaningful work is Wave-3+ productization:

- move publish gating fully onto resolver requirements (remove residual shell hardcoded drift),
- unify registration and remaining directory/filter paths onto the same resolved field truth,
- real drag/drop ordering + richer tenant override controls,
- stronger platform impact preview and audit history UI polish,
- curate Impronta's enabled leaf talent-type set under the 8 enabled parent categories,
- gate `media.polaroids` by tenant/type so it can be disabled for Impronta without deleting platform capability,
- broader manual QA across platform admin catalog/taxonomy mutation flows.
