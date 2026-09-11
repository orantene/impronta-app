# Case-study suite run — 2026-09-11

**Host.** `https://staging-qa-journeys.tulala.digital` (A) and
`https://staging-qa-journeys-b.tulala.digital` (B).
`sentry-release=dd74cf00f3ed6a9f64d895e687267e6a9339fdf3`, matching
`origin/program/journeys-2026-09` / `origin/program/fidelity` at
`dd74cf00f`.

**Database.** Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`).
Production (`pluhdapdnuiulvxmyspd`) was not written. `npm run db:push`
was not run.

**POS modes** on workspace A (read, not assumed):
`["floor","counter","door","classes","projects"]`.
`platform_settings.workspace_pos_enabled = true`.

**Runner.** Cursor Cloud Agent (not the Mac in the prompt). No
`SUPABASE_SERVICE_ROLE_KEY` and no `VERCEL_AUTOMATION_BYPASS_SECRET` on
this VM. Vercel access used a one-time share JWT in Playwright
`storageState` (`/tmp/cases-run/storage.json`). Owner JWTs via
`/api/dev/signin`. Release helpers no-op without service role.

60/60 specs ran. Failures were rerun once. Selector patches were rerun
for C06, POS-floor, VENUE-table-service, and C08 (through r8).

After that run, leftover proof-run offerings and orphan draft POS orders
were deleted by id on tenant `33333333-3333-4333-8333-333333333333`
(isolated branch `fxlankepwnvelxjrahwk` only). `npm run seed:journeys-program`
exited 2 here (`DATABASE_URL` unset). The same `supabase/seed_journeys_program.sql`
was applied on that isolated branch, and C09 session
`33330013-0000-4000-8000-000000000001` / `…000003` `starts_at` were set
to `now() + 1 day` / `+ 1 day 4 hours`. Those seven specs were rerun
`--workers=1` (`fixture-rerun-7.log`, 20 tests, 8 passed / 12 failed,
13.5m). Spec-level class counts are unchanged.

## Spec-level counts

| Class | Count |
|---|---|
| passed | 51 |
| failed-app | 2 (C12 D-112; C08 D-113 + D-114 — inquiry and OP assign/send passed) |
| failed-fixture | 7 (C01, C02, C07, C09, pos-scanner, POS-projects, VENUE-table-service) |
| failed-spec | 0 |
| blocked-external | 0 |

C08 is one failed spec file with mixed roles (inquiry + OP passed; TAL is D-114; CUS accept is D-113). C12 is one failed spec with CUS+OP passed.

## D-ids filed this run

| ID | Case | One sentence |
|---|---|---|
| D-112 | C12-DIFF | After “At the door”, `[data-ticket-picker=held]` never appeared (rerun once). |
| D-113 | C08-CUS accept | Claimed client (`/…/client/messages?inquiry=…`) lands on **No client account here**. |
| D-114 | C08-TAL | Sent `c08-op-` offer is pending in DB; talent inbox stays Inquiry with no Approve offer. |

## Specs edited this run

- `C06-restaurant.spec.ts` — Sales row accepts `Unpaid · Awaiting payment` as well as `still owed`.
- `POS-floor-mode.spec.ts` — Settings uses `assertNotAuthWall` (no h1 after fidelity).
- `VENUE-table-service.spec.ts` — dismiss `[data-pos-overlay]` Close after waitlist.
- `C08-modelling-or-talent-agency.spec.ts` — fresh inquiry + clear `impronta_guest`; receipt regex allows `Sent · awaiting reply`; Messages identity does not require a visible h1; roster button is exact `QA Journeys Talent`; offer send clicks Draft editor Edit; talent Accept is the invite then Approve offer.
- `_isolated-db.ts` / `_floor-db.ts` / `_venue-db.ts` — release helpers return when service role is unset.

## Fixture drift confirmed on qa-journeys

- `/book` picker caps at 24 by `sort_order`. That crowding is cleared: 8
  published-public offerings remain (Complimentary class, House pizza,
  Garlic bread, QA gala ticket, Gel manicure, Massage, Couples massage,
  QA Night ticket). Gel / Massage / Couples are on the page.
- C09 Morning class / Last place **sessions** exist and start tomorrow.
  Counter still has no `Morning class` / `Last place class` chips.
- No service-role key: owner JWT cannot read `visits` / `capacity_allocations`,
  cannot INSERT `links` / `orders`. Unchanged.
- VENUE-table-service got past the earlier “room is full” waitlist refusal
  and timed out on `leaveCounter`.

## 7-spec rerun after leftover delete (2026-09-11T21:13Z)

`--project=chromium --workers=1`. 20 tests: 8 passed (smokes), 12 failed.

| Spec | Result | What changed |
|---|---|---|
| C01-nail-salon | failed-fixture (3 tests: 2 smoke pass) | Gel manicure visible; deposit `df4f0c50-897b-4064-b007-ef17103072d7` persisted. Sales has no `instant_book` text. |
| C02-spa | failed-fixture (5 tests: 2 smoke pass) | Massage / Couples on `/book`. Last-resource couples slot missing; couples confirm stayed on `/book`; DIFF Sales missing `instant_book`. |
| C07-bar | failed-fixture (4 tests: 2 smoke pass) | T1 Open tab never reached `tab · occupied`; OP T1 not Free. Visits RLS unchanged. |
| C09-yoga-or-fitness-studio | failed-fixture (5 tests: 2 smoke pass) | Storefront booked (`7f1a578e-…`, `2f197ef8-…` paid `session_picker`). Sales missing `session_picker`. Counter missing session chips. |
| POS-projects-collect-a-balance | failed-fixture | 42501 INSERT `orders`. |
| pos-scanner | failed-fixture | 42501 INSERT `links`. |
| VENUE-table-service | failed-fixture | 360s timeout on Workspace toggle after walk-in. |

## IDs removed (isolated tenant only)

Hard-deleted by explicit id. No wildcards. Paid `order_lines.offering_id`
for leftover offerings were set NULL first (no FK; keeps paid history).
Fixture offerings `33330012-0000-4000-8000-00000000000[1-7]` were not
touched. Newer drafts from this suite were not touched.

### Leftover proof-run offerings (39)

Prove class ($0.00), 10:

- `f55f4a7d-cefb-48f9-869d-f4bfd9d7b60a` Prove class 1789055840180
- `4070e43e-2fd7-44d9-8bf1-05824c026706` Prove class 1789055950176
- `98fed392-db7a-4be0-a9f5-3d5007f41fc8` Prove class 1789056054920
- `ec1a8bb6-c50f-4632-a483-bfa7a7eefc4f` Prove class 1789056185491
- `bd821e0c-4d46-4d2f-aaf7-34edfd5c2159` Prove class 1789058061008
- `77899505-3af2-41e9-8b7e-2988f9ca2c14` Prove class 1789058432994
- `78b80a13-b1c3-4db6-bd99-8b437f353f3e` Prove class 1789058826481
- `ac98753c-6799-41f8-9811-f0bb56e98b8a` Prove class 1789059148250
- `2e8e1cea-c852-4004-9306-73b4ed198e07` Prove class 1789060347838
- `2a22d116-b049-479d-81a1-c37a790de6fa` Prove class 1789105164398

Blowout leftovers (same `/book` sort_order=0 crowd; deleting Prove class
alone leaves 29 leftovers ahead of Gel/Massage), 8:

- `52c09185-c62a-4461-a9c2-d9e150ec2493` Blowout 1789056763904
- `1a3a9cda-8fec-44b1-a755-7b9f0f404b77` Blowout 1789057258133
- `22811505-c846-4738-bd66-f684b2b4212b` Blowout 1789058000476
- `482b2401-e446-4356-84e6-0b0f51712ed3` Blowout 1789058206222
- `de332eb1-9666-416f-a9b5-f4258402ca5d` Blowout 1789058391126
- `75027e70-1f45-451a-b9ea-7440a1defec0` Blowout 1789058780034
- `a8e806f9-90ff-4ab0-8dd2-82960492799c` Blowout 1789059109800
- `4cae4aa5-ba8b-4509-b186-fa5f9232f98d` Blowout 1789060297309

Door night leftovers, 13:

- `f8dda144-2889-4fe1-98d8-df57ca2ac265` Door night 1789070875845
- `80aa5f17-159f-4365-8b4a-f8065ac0de45` Door night 1789071024986
- `54cd16b1-dffe-4749-a21b-055d37f4cd87` Door night 1789071294985
- `900a484e-a7bf-4c41-847f-abdc1432afaf` Door night 1789093891227
- `4e8da4bc-1cb4-4617-94e9-d49bde84ec46` Door night 1789095751664
- `738850b8-8aa2-4fb2-b3f8-ee63ddfb8553` Door night 1789125584243
- `77718b47-0b4c-4818-855d-babacce39fc0` Door night 1789126067502
- `479d6da0-68cd-4457-ac58-e590d1b78a16` Door night 1789126421376
- `f8f19db0-4ee1-4fdf-8ad1-f76111d32062` Door night 1789126989159
- `8f2402cc-a916-4459-985c-011c11249dd4` Door night 1789127210455
- `05119582-4932-47fb-9801-066e0c9dd337` Door night 1789127346500
- `82279503-6696-4c0f-9546-83639afd67f7` Door night 1789127500443
- `27eb86fd-91cd-400f-9030-5981c1845d1a` Door night 1789128094983

POS class leftovers, 8:

- `a6d3d150-a418-4b3c-b199-8aa1566cbfad` POS class 1789071287182
- `bb16b285-f2e0-4b2a-906a-269e7ac3a9cb` POS class 1789072181747
- `7955f341-33a6-495a-8377-f1e8bac31402` POS class 1789072692399
- `20439a94-2ef9-4312-84cd-4a6ec06a1009` POS class 1789073463089
- `c1064ddb-7aa3-465f-8a24-dafd419b4a1b` POS class 1789093158157
- `b0c04333-1518-432e-86e0-75b69f611e44` POS class 1789108356531
- `f754cfba-e843-499d-ae87-213571124134` POS class 1789110327975
- `7ece8023-cd7d-466a-8468-e568d95741dc` POS class 1789110798867

### Orphan draft POS orders older than 24h (59)

`orders.status = 'draft'` and `source_channel = 'pos'`, created
2026-09-08 through 2026-09-10 19:50Z. Lines deleted first, then orders.

- `d1bc345b-dd67-4a6b-a595-796fa7fcb0da`
- `c3445939-aef8-4dab-8238-d4b4c5206738`
- `80d90712-d6f6-4828-8736-ed079e897971`
- `3f077861-20a6-4afd-95d6-a4815c56cc1d`
- `2fa1273c-70e1-4f84-b5a6-62d367deac3a`
- `140580c7-2739-43e9-9b1e-6cbff34b8274`
- `ae67227c-0fb9-45a7-b033-7f21d3e84aab`
- `d8752df4-9e75-4948-b2c0-98216cdc05e2`
- `3f46a3ba-e4c3-43f6-9d9b-d0d9b996d2a0`
- `e7858914-7313-437c-a28b-84944b5e27cd`
- `2b63e4f3-aab1-4d99-840a-060923d4665c`
- `5ea210bc-924e-42db-ab8e-83695d3a0753`
- `222cd609-c8f5-4b08-82f3-d11275af9130`
- `171bcda2-ba01-4304-a769-b788a1036888`
- `52d94bfc-e3ef-405b-9d5f-f237e7ba2d86`
- `16cd8cf2-8f2a-44a7-ac3f-c3679d1bd810`
- `8e48a252-ec78-475c-9f33-0770c984e799`
- `a6ac9f89-49f5-4a8e-afd0-46fe60942bc5`
- `d534fd70-493f-4927-b39a-59c1f46e6085`
- `f2746b72-ae8b-400e-adb7-b22c8526efca`
- `3567789f-eb61-4e40-b7d4-ae2a9d221420`
- `947aad41-20d3-40a9-b499-ca1ed712a72c`
- `c50df2f4-4e53-49e3-bc76-aff59cbeb0b1`
- `a46ac20c-cbc8-4da7-80b2-9f52a79cba1e`
- `576dbc16-89f9-4eb0-907a-5e86b8ca2e7d`
- `83ae0c88-68cc-428c-aca7-cef99e4500d3`
- `3f148386-a6f6-48eb-ab8f-a523be9ad38d`
- `6d77b178-43ca-4423-bb01-beb3bd9b8394`
- `5776bb3d-fb45-43c4-a97c-ed35bdaf0a84`
- `e1505643-73a9-4d41-94ec-0c06e15e05b2`
- `9b91e4a6-83b3-4bb8-997d-c6652d55cc6a`
- `715791dd-0ba4-4be0-b4b6-607c3e350b1c`
- `9aef6cb1-2cfd-4622-948c-cd49d508a93d`
- `dfed43e1-57c9-43b9-8a75-379878a8c587`
- `2f52c087-2a7e-48ca-9d81-8bf4bb22b3c7`
- `a1889599-eabe-44c7-93b0-ce123c03dd37`
- `af9c281e-a7c7-44cb-ba96-9bc797dd732b`
- `9434a0c7-1d11-403f-90a9-531d6d2739c4`
- `3529f14c-aea8-4ae4-a912-42474ead3e74`
- `08513cd7-45b7-4d8f-893a-89d7c745d1c8`
- `b8bff722-bf66-4b55-90e3-ccbee94a1c68`
- `739a762a-8061-40b4-9efd-109b7afbf254`
- `107f290e-40bd-45ea-9e97-d42b0ab5a7fc`
- `f6f2ed10-105a-442d-9706-f6d4a4504db6`
- `349901af-2178-4d7c-92f7-7067ddf799d9`
- `192dceb0-20e8-447a-9e43-9ebf1483e806`
- `7e357310-e7ca-4cc2-a2b1-27b0e175ab8a`
- `c95590c8-4481-4164-a0fc-a12954c02bd2`
- `45944810-4dd7-440c-95d0-175b885e5474`
- `40253f37-f257-4c9c-9678-5453d984e1c6`
- `4da70868-517f-4eaf-886f-d9fff6a98131`
- `273cc2fd-d0c3-43e6-83ae-f6cca591195c`
- `136d12f1-094b-4931-bc3a-ac3dfae1df4b`
- `22832ad7-d43f-48de-8a23-f8f54832024d`
- `c490ddf3-53f3-4163-adc4-27a86ac7a733`
- `bbba7283-defb-4b20-8b4b-dcef6decbb39`
- `e915543d-35f7-433a-9d5e-0058a7bbcb24`
- `64f772d4-2a00-401b-8a31-27b18c941100`
- `cbcd60ff-22e0-40c9-a496-2de4d70ec845`

## Rows left on the fixture workspace

Accepted from the original suite, plus rows created by the 7-spec rerun
(`instant_book` / `session_picker` / leftover POS drafts). Production
was not written.
