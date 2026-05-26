# Tulala Profile Engine Finish Closure - 2026-05-25

## Scope Completed

This pass continued the Field Catalog / Profile Editor stabilization on `main`.
It did not touch Impronta uploaded media or profile photos.

## Commits

- `b6a42a3cd admin/: centralize profile publish requirements`
- `252e47442 talent/: route registration through profile engine`
- `61325bb7c directory/: resolve public taxonomy through tenant engine`
- `f9f65d18d platform/: harden engine control room`
- `ab2b3b644 admin/: expand tenant field controls`
- `32835183c admin/: polish profile editor engine UX`
- `6dc6c70d4 admin/: curate impronta taxonomy settings`
- `58c7873ae admin/: enforce tenant taxonomy limits`

## Engine Behavior Now

- Admin profile Details fields use the resolver-backed dynamic category model.
- No-type Details stays empty and says: "Select a talent type in Services to see relevant fields."
- Legacy `skills` stays deprecated/hidden for new input; saved values are preserved.
- Publish dropdown/action uses a shared publish requirement helper in the drawer.
- Tenant Field Catalog and Field Privacy are scoped to enabled tenant taxonomy.
- Platform field mutations clamp sensitive/admin-only fields away from public, directory, registration, and talent-editable surfaces.
- Directory taxonomy filtering rejects disabled tenant terms and disabled ancestors.
- Add Talent now respects tenant-disabled leaf talent types, not only parent/group settings.
- Impronta Polaroids remain tenant-disabled; media/photos were not touched.

## Impronta Taxonomy Curation

Migration applied and recorded:

- `supabase/migrations/20261003000000_impronta_launch_taxonomy_curation.sql`

What it did:

- Kept Tulala platform taxonomy broad.
- Narrowed Impronta's enabled leaf talent types from `223` to `134` effective leaves.
- Wrote only `agency_taxonomy_settings` tenant overrides.
- Wrote one `engine_audit_log` row with `media_touched=false` and `non_destructive=true`.
- Preserved existing taxonomy terms, talent assignments, field values, and media.

Effective Impronta leaf counts after curation:

| Parent | Enabled leaves |
|---|---:|
| Event Staff | 14 |
| Hosts & Promo | 16 |
| Influencers & Creators | 15 |
| Models | 24 |
| Music & DJs | 17 |
| Performers | 17 |
| Photo, Video & Creative | 19 |
| Wellness & Beauty | 12 |

## Free / Studio / Agency QA Matrix

Read-only live snapshot:

| Plan | Tenants found | Expected posture |
|---|---:|---|
| Free | 9 | Most have 3 enabled parent groups / 94 effective leaves |
| Studio | 1 | Currently 19 parent groups / 438 effective leaves |
| Agency | 1 | Impronta has 8 parent groups / 134 effective leaves |
| Network | 1 | 19 parent groups / 438 effective leaves |

Important finding:

- Two Free tenants (`morena-studio`, `qa-free-studio`) currently have all 19 parent groups enabled. I did not mutate those fixtures in this pass, but the server action now prevents Free tenants from enabling beyond the 3-parent cap going forward.

## Safety Rules Added

- Free workspaces cannot enable a fourth parent category through tenant taxonomy actions.
- Studio workspaces are capped at 8 parent categories.
- Agency/network remain effectively uncapped.
- Already-enabled rows can still be saved even if a historical fixture is over cap, so admins can disable/reorder without being locked out.

## Verification

Focused tests passed:

- `profile-publish-requirements.test.ts`
- `auth-routing.test.ts`
- `taxonomy-tenant-safety.test.ts`
- `new-talent-taxonomy.test.ts`
- `tenant-taxonomy-plan-limits.test.ts`
- field-engine focused suite from the earlier phase

Commands run during this closure:

- `npm run typecheck` - passed
- Targeted ESLint on changed taxonomy/editor files - passed
- Focused taxonomy/directory tests - passed
- Focused engine/taxonomy/auth suite - passed `151/151`
- `npm run test:tenant-isolation` - passed `26/26`
- `npm run ci` - passed through typecheck, server-action verification, i18n, locale, inquiry, AI, tenant-isolation, builder, presentation, publish preflight, billing, and UI message checks; stopped at full-repo lint with `928` existing warnings and `0` errors.
- Browser smoke reached `/platform/admin/catalog`, `/platform/admin/taxonomy`, `/impronta/admin/settings`, and `/impronta/admin/roster` on the local authenticated session. `/talent/profile/fields` redirected to the admin home because the active browser session is signed in as an admin user.

## Remaining Risks

- A direct server-side hard block inside the raw profile-shell save action is still the next hardening step; the drawer publish action itself is guarded.
- Full browser drawer regression still depends on a clean authenticated local session.
- Existing Free fixture tenants over the taxonomy cap should be cleaned with a deliberate fixture migration if they are not intentionally broad QA tenants.
- Full `npm run lint` currently exits non-zero with `928` warnings and `0` errors. This is repo-wide lint debt, not introduced by the changed profile-engine files.

## Launch Posture

The core engine is now usable for launch data entry:

- Platform owns canonical fields/taxonomy.
- Tenant settings narrow the engine.
- Admin editor, Add Talent, directory taxonomy, and publish UI consume the resolved rules more consistently.
- Impronta is narrowed enough to start real profile entry without exposing the full Tulala platform universe.
