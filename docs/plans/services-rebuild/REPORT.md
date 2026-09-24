# Services rebuild stop report (2026-09-24, round 2)

Worktree `.claude/worktrees/services-rebuild` on `feat/services-rebuild`, upstream `origin/main`. No PR. No push. No merge.

## 1. Done

- Booking sheet, island, category note, near-match warning, ship lock, and defaults currency are on the branch.
- Buffer and minimum notice stay on the defaults record. The Defaults screen says they do not change open slots. Wiring them into `api/public/booking/slots` is larger than this round.
- Ship stays off. The card says checkout does not charge a shipping fee yet. Pickup and appointment still save.
- Add many: the "+" on each parsed row opens the portfolio picker and the chosen photo is attached on publish.
- Editor preview card shows the talent display name and home city, and "Last saved {when}" when the offering row has `updated_at`.
- Camera add is one screen (photo, name, price, save). There is no "1 of 3" step counter.
- Category order is already read by the hub and the widget. The sentence "Category order is not saved yet" is not rendered.
- `npm run db:check`: 867 local migrations, all applied.
- Remote columns: `talent_offerings.first_published_at`, `talent_profiles.category_order`, `talent_profiles.selling_defaults`, table `talent_addon_groups`. No new migration this round.
- Gates after these edits: `npm run typecheck` 0, `npm run lint` 0, `npm run test:builder-node-bindings` 1802 pass, `npm run test:billing` 679 pass.

Widget proof, off her home page, on `/dev/jor-beauty`:

- Spanish extras: Ojo de gato raised the total from $300 to $400. `evidence/p-widget-es-extras.png`.
- Live slots: `GET /api/public/booking/slots?offering=f4afd359-5cf4-4e4b-a3d8-855d1c299ab5&from=2026-09-24&days=14` returned no slots. Continue stayed disabled. No booking row was written. `evidence/p-widget-es-slots-empty.png`.
- A service with no extras (Gel en pies) opened on the time step. `evidence/p-widget-es-no-extras.png`.
- A request-mode consult ended on "Queda pendiente de confirmación" in demo mode (nothing saved). `evidence/p-widget-es-consult-pending.png`.
- Same sheet at 390px. `evidence/p-widget-es-390.png`.
- Side by side with the live band, read only. `evidence/p-widget-vs-live.png`, plus `p-live-servicios-band.png` and `p-widget-band.png`.

The Uñas sentence is prototype copy in `web/src/app/dev/jor-beauty/seed.ts` and static HTML on the live band. The widget shows a note only when `selling_defaults.categoryNotes` has one. It is not hardcoded for every talent.

## 2. Not done

- No confirmed live booking. The slots API returned an empty window for that offering, so `createInstantBookingAction` was never called. Nothing to delete.
- Extras create/attach/delete, hide failure, publish retry, preview, category rename-and-back, p37, p38, and the 390/360 editor frames. Two tries on `/talent/services`: the shell stayed on "Your services are loading" because chunk `src_0nukcsx._.js` 404'd and the page never hydrated. After a dev-server restart the signed-in `/talent/*` layout returned the branded page-not-found (the profile loader did not return a profile). `/dev/jor-beauty` then 404'd from the page's production gate. I did not create test rows.
- Spanish walk of the talent editor screens. The widget flow above is in Spanish. The editor locale on the stuck shell was English, and the screens never finished loading.
- Clients log. `/talent/clients` stayed on "Loading" for the same hydration failure, then 404'd after the restart.

## 3. Jor writes and undos

None this round. No scratch page, no test item, no extra, no booking, no category rename.

## 4. Home page

`talent_pages` `bad420b5-13cc-45ab-a915-841e775b1a7c`, read only, after this round:

- `updated_at`: `2026-09-24 18:24:52+00`
- `published_at`: `2026-09-24 17:20:56+00`
- `services_catalog` in `blocks`: false
- Menu copy still present
- sha256 prefix of `blocks` text: `6d83ddc965` (same as restored revision `79ef2414`)
- md5: `3cbd1fdf9597b7c450fad875dbddf831`

The token `f8156c9405` is not the md5 or the sha256 prefix. The live row matches the restored revision. This round did not write the page or `talent_sites`.

## 5. Owner decisions

1. Swap the live `#servicios` band for the widget. Not done. Comparison shot is `evidence/p-widget-vs-live.png`.
2. Open a PR. Not done.
3. Guest access-link bug stays off this branch.
4. Whether to put buffer and minimum notice into slot computation. They are saved and labeled as not affecting slots yet.
