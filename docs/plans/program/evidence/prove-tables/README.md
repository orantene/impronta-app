# prove-tables: the venue journey on the QA host, 2026-09-10

Branch `work/prove-tables` off `program/journeys-2026-09` at `deca2efc8`.
Host: `staging-qa-journeys.tulala.digital`. Database: Supabase branch
`fxlankepwnvelxjrahwk` (qa-journeys). Production was read from never and
written to never.

The deployment every proof below ran on is
`tulala-h08t9e8e4-oran-tenes-projects.vercel.app` (`dpl_` in
`vercel-deploy-5`, meta `prebuiltFrom=deca2efc8+prove-tables-fixes+linux-sharp`):
this worktree's tree, including the fixes listed below, built here and shipped
as a prebuilt deployment. Why it had to be built here and not by Vercel, and
everything that took, is in `host.md`. The kitchen refusal pass at 16:16Z ran
on `ab173715` (the branch's own build after the counter merge) and passed
there too; the floor pass needs the label fix and ran on the prebuilt one.

## What the previous run had found

Its worktree held four untracked files and no evidence: three specs
(`VENUE-table-service`, `VENUE-join-and-refusal`, `VENUE-refusals-in-words`),
a DB helper (`_venue-db.ts`), and two probe specs. No `Prove Tables` admission
existed, so no journey had ever completed. Its probes had run against the
host at 12:28Z to 13:01Z, when the host was serving `d51227f5`, which predates
the tables commit entirely (no `Add a walk-in`, no `Seat party`), so nothing
it saw was the code under test. The specs were sound in intent and wrong in
four places, corrected here rather than started over:

- they navigated off the point of sale by rail; the POS has no rail (its
  chrome replaces the shell), the way out is the identity bar's `Workspace`
  segment;
- they found the kitchen ticket by `House pizza` alone on a board that keeps
  every ticket the venue ever sent; the ticket now names its table and the
  locator uses it;
- `\bNew\b` and friends on `li` text: adjacent spans concatenate in
  `textContent` (`Table T4New`), so the badge is asserted as an element;
- `servedLocales()` read `app_locales` (the platform) when a workspace host
  serves the WORKSPACE's published locales, and it demanded `fr`, which this
  platform cannot serve (below).

## Proven, with a browser, on the host, and in the rows

**VENUE-OP (`web/e2e/cases/VENUE-table-service.spec.ts`, 1 passed, 1.0m,
`gates/playwright-VENUE-table-service.log`).** Signed in as the workspace owner
and walked from the rail:

1. Reservations: `Add a walk-in`, name + party 3, `Add to the book`. The row
   appears, `Arriving` (`screenshots/service/desk-walk-in-on-the-book.png`).
2. `Seat` on that row: T2 (a two-top) is NOT offered, T4 is; tap T4. The row
   reads `Seated` and `T4` (`desk-party-seated.png`). Rows: admission party 3,
   admitted 3, `seated_at` set, `space_id` T4.
3. Spaces: `Times shown in America/Mexico_City (GMT-6), the venue's clock.`;
   T4 `Occupied · Table check · Party of 3` (`floor-t4-occupied.png`).
4. `Open check` on T4 lands on `/admin/pos?order=<the visit's check>`. One
   House pizza, `Charge · $18.00`. Prep destination `Table`, `Send to
   preparation`. Leave by `Workspace`.
5. Preparation: `kitchen · Destination: Table T4 · New · House pizza × 1`
   (`kitchen-ticket-new.png`). `Acknowledge`. Rows: one ticket, revision 1,
   `acknowledged`, `acknowledged_at` set, `destination` table, `visit_id` =
   the visit.
6. Back to Spaces, `Open check` on T4 again (SAME order id), second pizza,
   `Charge · $36.00`, send again. Preparation: the same card now reads
   `Revision 2`, `Amended. Acknowledge again.`, `New`
   (`kitchen-ticket-amended.png`). `Acknowledge`. Rows: still ONE ticket for
   the order, revision 2, `acknowledged`, two revision snapshots (1 line, then
   2 lines).
7. `Open check`, `Charge · $36.00`, `Cash`, `Confirm cash`, `Paid`
   (`check-paid.png`). Spaces: `End visit` on T4. The card reads `Needs reset`,
   not `Occupied`, `vacated 09:58` (`venue-floor-after-close.png`).
8. Rows: visit closed with `closed_at`, party 3, `service_kind` table, on T4;
   order `paid`, 3600, on that visit; ticket revision 2; `needs_reset_at` set;
   the visit's `tenant_id` is the QA workspace. Full rows:
   `sql/10-service-journey-after.sql`.

**The clock.** The browser claimed Asia/Tokyo, Vercel renders in UTC, the
venue is America/Mexico_City. The vacated time on the card (`09:58`) was
compared against the instant in `spaces.needs_reset_at` formatted in the
venue's zone, and the spec also asserts that instant formats to a DIFFERENT
hour in Tokyo (`00:58`) and in UTC (`15:58`), so the assertion could have
failed. Both screens print the zone note. Every time on the desk, floor and
board goes through `lib/spaces/venue-clock.ts`.

**VENUE-JOIN (`VENUE-join-and-refusal.spec.ts`, 1 passed, 50s).** On the
floor, `Seat party` on T2 with 4: refused with the sentence `This party is
larger than the table allows.` (the engine's `party_too_large`, never the
code), and the picker offers `Join with T3` from the T2+T3 combination
(`screenshots/join/floor-refusal-and-join-offer.png`). Tapping it: T2 and T3
both `Occupied`, each `Joined with` the other, `Party of 4`
(`floor-joined-seating.png`). Rows: ONE visit, `space_id` T2,
`joined_space_id` T3, party 4, and ONE order on it
(`sql/20-join-journey-after.sql`). `End visit` on T2: both halves `Needs
reset`; `Mark ready` on T2 clears it.

**VENUE-WORDS (`VENUE-refusals-in-words.spec.ts`, 2 passed, 2.4m).** For each
language the workspace serves (`en`, `es`; the h1 is asserted in that language
first so a silent fallback cannot pass):

- floor: six at a two-top is refused as `This party is larger than the table
  allows.` / `Este grupo es más grande de lo que permite la mesa.`, and the
  red box contains no code (`screenshots/refusals/floor-refusal-{en,es}.png`);
- kitchen: two browser contexts on one counter ticket; station one
  acknowledges, station two taps the `Acknowledge` it is still showing and is
  refused `That ticket is not at a step where this is possible. Reload the
  board.` / `Ese ticket no está en un paso donde esto sea posible. Recarga el
  tablero.` (`kitchen-refusal-{en,es}.png`). Rows: one acknowledgement per
  ticket (`sql/30-refusals-after.sql`).

## Seeded

Nothing this journey was proving was inserted by hand. The floor (T1 to T5,
B1, four symmetric `space_combinations`, four bookings on tables) was already
on the branch database from `seed_journeys_program.sql` at `00ffa4717`,
confirmed by `sql/00-fixture-state-before.sql` before any run. Fixture writes
made by this run are listed at the foot of `sql/30-refusals-after.sql`: two
leftover tickets of aborted attempts cancelled, six tickets of cancelled sales
withdrawn (the defect below, cleaned by hand after fixing it), and an
`app_locales.fr` row inserted then deleted (net none). The specs' own
teardown (`_venue-db.ts`) voids `Prove Tables %` admissions, releases their
allocations, closes open visits on T2/T3/T4, cancels those visits' tickets and
clears `needs_reset_at`, so the fixture is handed back each run.

## What failed on the way, and what was fixed in the application

Each fix has a test that was shown red without it.

1. **The desk could not show a walk-in taken before service opened**
   (`host-stand-data.ts`). The book's span was the service windows (12:00 to
   22:00 venue time); a party added at 10:20 was on the floor, holding its
   table and counted late, and absent from the desk that had just said
   "added". Now the span is the venue's calendar day, widened by a window that
   runs past midnight, decided in `lib/reservations/book.ts::bookSpan` and
   tested in `book.test.ts` (4 tests, including a 23-hour DST day). The desk
   now shows Ana Ruiz on T4 running late, as the floor always did.
2. **Every free and held card opened the move picker**
   (`tables-client.tsx`): `moveFor === table.visitId` read `null === null`.
   Its buttons would have sent a move for a visit that does not exist.
   Render test: `restaurant-screens.render.test.ts` ("a table nobody has
   tapped does not open the move picker").
3. **`Party size` was not bound to its field** (`tables-client.tsx`): the
   spinbutton had no accessible name. `htmlFor`/`id` per table.
4. **A ticket did not say which table** (`lib/preparation/tickets.ts`,
   `prep-client.tsx`): two pizza tickets both read `Destination: Table`.
   `PrepTicketView.tableCode` is resolved through the visit (both halves of a
   join, `T2 + T3`) and the card prints `Destination: Table T4`. Render test in
   three languages.
5. **A crashed action left the screen dead** (desk, floor, board clients):
   `setBusy(false)` sat after the `await`, so a server action that threw
   (seen: HTTP 500) greyed the control for good and said nothing. Each `run`
   now catches, says the generic sentence (`unavailable`, in the reader's
   language) and gives the control back.
6. **Cancelling a sale left its ticket on the kitchen board**
   (`lib/pos/finalize.ts`): `cancelTicket` existed and was called from
   nowhere; six acknowledged pizza tickets for six cancelled sales were on the
   board. `finalizeOrCancel` now withdraws the order's active ticket after the
   sale is cancelled (best-effort, logged). Test in
   `commands-collection.test.ts`. This file belongs to the counter slice; the
   defect was found and is only visible from the kitchen board, which is why
   it is fixed here rather than reported.

## Not proven, and why

- **French, in a browser.** `PLATFORM_LOCALES` is `["en","es"]`
  (`web/src/lib/site-admin/locales.ts`) and
  `agency_business_identity_supported_locales_platform_allowed` is a CHECK
  constraint on the same set, and the owner retired French on 2026-08-16. A
  workspace cannot publish `fr`, so no tenant host can serve it; putting it in
  front of a browser would mean widening that constraint. The French
  sentences ship in `messages/fr.json` for every refusal both screens can
  produce and are proven through the screens' own render functions in
  `restaurant-screens.render.test.ts` (three languages, every code), not by
  a browser.
- **The Vercel build of the branch tip.** Three builds of `deca2efc8` never
  finished (`BUILD_EXCEEDED_MAXIMUM_TIME`, 45 min each, stopping at the
  compile banner) while the same commit builds in 3m37s on GitHub's runner
  and in 65s here. The branch's next commit (`ab173715`, after the counter
  merge) built on Vercel in 6 minutes, so whatever it was is not reproducible
  by me and is recorded in `host.md`, not diagnosed.
- **The counter gives no sign a ticket was sent.** `Send to preparation`
  greys and comes back; nothing on the screen says "sent". The specs wait on
  the control. Not fixed: it is the counter's screen, and not a refusal.
- **Tickets outlive their visit.** Closing a paid visit leaves its
  acknowledged ticket on the board until the kitchen marks it ready and
  handed off. That is arguably the kitchen's workflow, not a defect; the
  spec teardown cancels its own.
- **CI on `deca2efc8`** is red on `phase1-i18n` (18 newly dead catalog keys
  in `admin.people.*` and `dashboard.pos.*`), outside this slice; noted, not
  touched.

## Traces

The Playwright traces of all four passes record every request header, which
includes the automation bypass secret and the session cookie, so they are not
in this folder. They are kept in the session scratchpad
(`prove-tables-traces/*.trace.zip`) for the reviewer of this run.

## Gates (exit codes from the commands themselves, logs in `gates/`)

| command | exit |
|---|---|
| `npm run typecheck` (own lane) | 0 |
| `npm run lint` | 0 |
| `npm run test:reservations` | 0 (143/143) |
| `npm run test:money` (carries the render, ticket and cancel tests touched here) | 0 (932 pass, 1 pre-existing skip) |
| `npx playwright test e2e/cases/VENUE-table-service.spec.ts --project=chromium` | 0 |
| `npx playwright test e2e/cases/VENUE-join-and-refusal.spec.ts --project=chromium` | 0 |
| `npx playwright test e2e/cases/VENUE-refusals-in-words.spec.ts --project=chromium` | 0 |
