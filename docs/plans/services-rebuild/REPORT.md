# Services rebuild report (2026-09-24, round 2)

Worktree `.claude/worktrees/services-rebuild` on `feat/services-rebuild`, rebased onto `origin/main`. No PR. No push.

## Live home page

Round 1 wrote the Services menu onto Jor's real home page (`talent_pages` `bad420b5-13cc-45ab-a915-841e775b1a7c`) and that page was republished at 17:20 UTC. A later repair restored revision `79ef2414`.

Checked this round, read only:

- `published_at`: `2026-09-24 17:20:56+00`
- `updated_at`: `2026-09-24 18:24:52+00`
- `services_catalog` in `blocks`: false
- Menu copy (`Seleccionar` / menú) still present
- sha256 prefix of `blocks` text: `6d83ddc965`, the same prefix as revision `79ef2414`

The token `f8156c9405` is not the md5 or sha256 prefix of that text. The live row matches the restored revision, not a second digest I could reproduce. This round has not written her home page or `talent_sites`.

## Done

- Booking sheet and island committed, then rebased onto `origin/main`.
- Category note is passed from `CatalogGroup.note` into the sheet. The real widget reads `selling_defaults.categoryNotes` when that map exists. The Uñas manicure sentence is prototype copy in `web/src/app/dev/jor-beauty/seed.ts` and static HTML on her live band. It is not a column.
- Organize and the editor warn with `categoryNearMatch` (so "Unas" matches "Uñas") and Organize will not add that near match.
- Ship stays off. Checkout does not charge a shipping fee. Copy says so.
- Defaults use the talent's currency from her items. Buffer and minimum notice stay on the defaults record and the screen says they do not change open slots yet.

Evidence already in `docs/plans/services-rebuild/evidence/` from round 1: `p-widget-select.png`, `p-widget-extras.png`, `p-widget-slots.png`, `p-widget-who.png`, `p-widget-done.png`, `p04-hub-desktop.png`, `p04-services-390.png`, `p13-duplicate-review.png`, `p14-hide-dialog.png`, `p20-intro-task.png`, `p21-intro-saved.png`, `p24-product-editor.png`, `p34-organize.png`, `p34-near-match.png`, `p38-hub-profile.png`.

## Not done yet

- Live slots API and `createInstantBookingAction` click-through on `/dev/jor-beauty`, then delete the test booking.
- No-extras jump, consult pending, Spanish, 390, and `p-widget-vs-live.png`.
- Extras, hide failure, publish retry, preview, category rename-and-back, p37 on a test item, three surfaces, phone frames.
- Add many photo slots, camera steps, Clients log, editor "Jor Beauty · Cancún" and last-saved (no `updated_at` on the offering type).
- Spanish walk, `db:check`, billing comparison on `origin/main`.

## Owner decisions

1. Swap the live `#servicios` band for the widget. Not done.
2. Open a PR. Not done.
3. Guest access-link bug stays off this branch.
