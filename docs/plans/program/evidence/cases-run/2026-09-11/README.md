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

- `/book` picker caps at 24 by `sort_order`. 42 published offerings have `sort_order=0` (Prove class, POS class, …). Gel manicure=10, Massage=20, Couples massage=30 are off the page.
- Morning class and Last place offerings are **absent** (C09-OP / C09-DIFF).
- No service-role key: owner JWT cannot read `visits` / `capacity_allocations`, cannot INSERT `links` / `orders`.
- Table-group pool / waitlist: 7 parties already waiting; walk-in add refused “The room is full for that turn.”

## Rows left on the fixture workspace

Accepted. Tenant A orders with `created_at >= 2026-09-11T18:40Z` after the C06 rerun:

| source_channel | status | n |
|---|---|---|
| menu | pending_payment | 5 |
| pos | draft | 10 |
| pos | pending_payment | 1 |
| pos | paid | 12 |
| pos | cancelled | 3 |
| reservation | paid | 5 |
| ticket_picker | paid | 4 |
| ticket_picker | cancelled | 2 |
