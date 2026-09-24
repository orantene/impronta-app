# Services rebuild report

Work lives on `feat/services-rebuild`, branched from `origin/feat/talent-mxn-usd-equivalent` (PR #2217, not yet on `origin/main`). Shared checkout was not switched.

## 1. Summary

Implemented in one worktree (not seven merged PRs yet): shell, Clients, Services home, editor, defaults, extras, categories, website reward, shared `OfferingCard`, and `services_catalog` builder widget layers.

| PR block | Branch state | Production |
|---|---|---|
| 1 Shell + Clients | on `feat/services-rebuild`, not opened as a GitHub PR | not deployed |
| 2 Services home | same | not deployed |
| 3 Editor + defaults | same | not deployed |
| 4 Product / extras / add many | same | not deployed |
| 5 Categories | same | not deployed |
| 6 Website reward | same | not deployed |
| 7 Public card + widget | same | not deployed |

Do not merge until #2217 lands, CI is green, and this branch is rebased onto `origin/main`.

## 2. Screen inventory

| PDF | Status | Route / component | Evidence |
|---|---|---|---|
| 1, 2, 16, 22, 30, 36 | not built (dividers) | — | — |
| 3, 4 | built | rail + `ServicesHome` | not shot |
| 5 | built | type dialog in `ServicesHome` | not shot |
| 6, 7 | built with deviation | `EditorScreen` (single scroll; no step numbers) | not shot |
| 8 | built | publish buttons on editor | not shot |
| 9, 10 | built | `PublishedBanner` | not shot |
| 11 | built | preview dialog | not shot |
| 12 | built | edit live / save changes | not shot |
| 13 | built | `duplicateTalentOffering` | not shot |
| 14 | built | Hide / Show again | not shot |
| 15 | built | `DefaultsScreen` | not shot |
| 17–21 | built | `WebsiteRewardControl` + sheet | not shot |
| 23, 24 | built with deviation | product fields in same editor | not shot |
| 25 | built | `talent_addon_groups` + attachments | not shot |
| 26, 27 | built | `PortfolioSheet` | not shot |
| 28 | built | `AddManyScreen` | not shot |
| 29 | built | `CameraAddScreen` | not shot |
| 31–35 | built | category field + `OrganizeScreen` | not shot |
| 37 | built | `ItemStateChips` | not shot |
| 38 | built | `OfferingCard` + `services_catalog` | not shot |

## 3. Actions (section 6)

Clicked-on-Jor column is empty until the owner signs in on localhost:3244. Code paths exist for: Add item, open row, Edit, Preview, Share, Duplicate, Hide, Show again, Archive, Restore, Delete forever, Save draft, Publish, Save changes, Upload, From portfolio, Reorder via move up/down, Organize, Defaults, Search, filters, Show them, Add many, Add an extra, Website reward.

## 4. Schema

Migration `20261231284000_services_rebuild.sql` applied via Management API (`apply-migration.mjs --apply-pending`). Adds `first_published_at`, `category_order`, `selling_defaults`, `category_rename_log`, `talent_addon_groups`, `talent_addon_group_attachments`.

## 5. Writes to Jor's data

None from this session. Category renames and photos must be done through the product after sign-in.

## 6. Deviations from the PDF

- Product and extra screens use the single-scroll editor, not "Step 3 of 4".
- Extras are shared groups (`talent_addon_groups`), not top-level catalogue rows.
- Website reward sheet currently lists missing checklist items and opens Public page; it does not yet focus the first unfinished profile field.
- Side-by-side evidence PNGs are not captured; owner must sign in.
- Seven sequential GitHub PRs were not opened; one implementation branch holds all blocks.

## 7. Widget

Kind `services_catalog` is registered: types, registry schema, create, drop-policy, MVP allow-list, needs walker, `loadBuilderNodeDataSources` (talent profile id from `render-max-site`), renderer, gallery ("Services menu"), inspector, layer label. Layouts: rows (default). Other layouts are props, not yet distinct CSS. Four profession fixtures: not shot.

## 8. NOT DONE

- GitHub PRs 1–7 and production pointer pacing.
- Pixel evidence under `docs/plans/services-rebuild/evidence/`.
- Click-through on Jor as impersonated talent (needs owner login on :3244).
- Jor category rename `unas` → Uñas (etc.) through the Organize UI.
- Attaching portfolio photos to her 22 items through the picker.
- Booking an extra on localhost with pay in person.
- `npm run typecheck` (queued) / `npm run lint` not finished this session; `tsc` OOM'd when invoked directly.
- Workspace Menu and staff drawer still use `TalentOfferingsManager` (kept working).

## 9. Gates

- `npx tsx --test src/lib/talent/publication-state.test.ts src/lib/talent/website-reward.test.ts` → 13 pass, exit 0.
- `apply-migration.mjs --apply-pending` → exit 0, applied `20261231284000`.
- `npm run db:push` → not linked in the worktree; used the Management API instead.

## 10. Risks / follow-ups

- Rebase onto main after #2217 merges.
- `talent_bookings` column names used by Clients / delete-forever may not match; empty or error states are honest.
- Selling defaults persist; buffer / min notice are not yet written into `booking_hours` (UI says new bookings only).
- Integrator still swaps Jor's live menu band.
