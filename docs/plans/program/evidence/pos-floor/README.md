# pos-floor: the Tables mode of the point of sale, 2026-09-10

Branch `work/pos-floor` off `program/journeys-2026-09` at `76d695a5d`.
Mode id `floor`, switch label **Tables** (es "Mesas", fr "Tables"), reached
from the top-bar switch "Workspace | <mode>" and its menu, at
`/admin/pos?mode=floor`. Database: Supabase branch `fxlankepwnvelxjrahwk`
(qa-journeys). Production was never read from or written to.

## Where it was proven, honestly

**Not on the deployed QA host.** This branch is not pushed (the brief says do
not push), so `staging-qa-journeys.tulala.digital` cannot carry this commit.
The journey ran on a **local dev server of THIS worktree against the SAME QA
database**, the way `prove-counter` and `prove-people-projects` did:

- `npm run dev` on `:3120` with `.env.capacity-isolated.local` exported and
  `TULALA_ALLOW_DEV_SURFACES=1`, behind
  `scripts/local-host-proxy.mjs 3121 qa-journeys.local 3120`, so the app sees
  the registered tenant host and the browser stays on `http://localhost:3121`.
  Dev-server lease: `pos-floor proof: dev :3120 + proxy :3121` (granted by the
  previous run of this task).
- `PLAYWRIGHT_BASE_URL=http://localhost:3121 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/cases/POS-floor-mode.spec.ts --project=chromium --workers=1 --reporter=line --trace=on`
- Same real browser (claiming `Asia/Tokyo`), same fixture sign-in
  (`/api/dev/signin` as the fixture owner), same rows. The only thing that
  differs from the deployed host is which build answers.

## What was resumed

The killed run left twelve uncommitted files: the screen (`floor-client.tsx`,
`floor-screen.tsx`, `floor-copy.ts`), the route branch in `pos/page.tsx`,
`built: true` in `modes.ts`, the catalogue in three languages, the render test,
the journey spec, its DB helper, and the test added to the `test:money` lane.
None of it had been run. Kept whole: all of it. Corrected:

1. **The label.** The brief names the mode "Tables"; the previous run called it
   "Floor" everywhere. Now the switch (`dashboard.pos.counter.mode.floor`), the
   settings card (`dashboard.adminWorkspace.posModes.modes.floor`), the
   screen's title and rail name say Tables / Mesas / Tables, and the rail's
   first row (the room) is Floor / Salón / Salle. `POS_MODE_META.floor.label`
   matches. Only this mode's entries were touched.
2. **The counter-off gate swallowed the floor.** `pos/page.tsx` refused every
   request with "The counter is switched off" whenever the counter was off,
   before it had looked at `?mode=`. A workspace with Tables on and the
   counter off (a host stand with no register) could never open its own mode.
   The gate now lets a request for a BUILT, switched-on sibling mode through
   to the person-and-mode resolution; a request for the counter, or for no
   mode, is refused exactly as before.
3. **The spec tapped a card that was already open.** A card is a toggle (tap
   again to put the sheet away), so `tapTable` on a table whose sheet is
   already showing closed it and then waited for it. Run 1 failed there; the
   helper now leaves an open sheet alone.
4. **The spec assumed the counter was on.** Run 2 found the fixture workspace
   with `modes: ["floor"]` only (this workspace's settings are shared with
   every other proof on this database, and something set it to floor-only
   between runs), so "Open check" landed on the counter-off sentence. The spec
   now switches on BOTH Tables and Counter in Settings, the product's own
   door, before it starts.
5. The `pos-modes-card.tsx` header comment listed `floor` among the unbuilt
   modes; it is not any more.

## The screens, and what a person clicks

| Screen | How a person reaches it |
|---|---|
| Settings › Point of sale › Selling modes: Tables ON | Sidebar Settings, section "Point of sale", the switch named "Tables" (`00-settings-floor-on.png`) |
| The floor (rail row "Floor") | Top bar: the "Workspace / Counter" switch, open the menu, choose "Tables"; lands on `/admin/pos?mode=floor` (`01-floor.png`). Every table as a card: Free, Occupied with party size, elapsed minutes and due-back time, Needs reset with the vacated time, Held with who and when; the check's total in its own currency; the kitchen line. Headline "n of N tables seated · arriving · need reset". Zone note: "Times shown in America/Mexico_City (GMT-6), the venue's clock." |
| Seated parties (rail row) | Rail, "Seated parties": the occupied cards only, longest-seated first (`04-seated-list.png`) |
| A table's sheet | Tap a card (`02-sheet-free-t4.png`). Free/held: guests - / +, "Seat n at T", the join offer when n does not fit, "Mark ready" when it needs a reset. Occupied: kitchen line, "Open check", "Send to kitchen", "Move this party to" (opens the list of tables that fit), "End visit". |
| The check | "Open check" lands on the counter's basket for the SAME order, `?mode=counter&order=<id>` (`06-counter-check-t4.png`) |

The floor re-reads itself once a minute so elapsed times keep moving.

## Proven, with a browser, in the rows (run 3, 1 passed, 2.2 min, `gates/playwright-POS-floor-mode.run3.log`, EXIT=0)

Rows before: `sql/00-before.json`. Rows after: `sql/10-after-journey.json`
(read with `sql/read-rows.mjs` from `web/` with the isolated env exported; the
same queries as SQL are at the bottom of this file).

1. **Seat a walk-in of 2 on T4.** Card goes Occupied, "Party of 2", "Nothing
   sent to the kitchen yet" (`03-t4-seated.png`). Rows: visit
   `580b909e…` open on T4, party 2, service_kind table; its check (order) exists.
2. **The kitchen refuses an empty check, in words.** "Send to kitchen" on T4:
   "Put something on the check before sending it to the kitchen. Open the
   check to add items." (`05-refusal-kitchen-empty.png`). Rows: zero tickets
   for the order.
3. **Open check = the counter on the same order.** URL carries
   `mode=counter&order=<that order>`; one House pizza, "Charge · $18.00"
   (`06-counter-check-t4.png`). Back on the floor the card reads "Check $18.00".
4. **Send to the kitchen.** Notice "Sent to the kitchen as ticket revision 1.";
   card reads "Kitchen: sent, not yet acknowledged (revision 1)"
   (`07-sent-to-kitchen.png`). Rows: one `preparation_tickets` row for the
   order, status queued, revision 1, destination table, visit_id = the visit.
5. **Move the party to T5.** "Move this party to" › T5. T5 Occupied, party of
   2; T4 Free + Needs reset (`08-moved-to-t5.png`). Rows: the SAME visit id now
   has space_id T5, still open; T4 `needs_reset_at` set; the order still points
   at the visit.
6. **The engine refuses to end a visit with an unpaid check.** "End visit" on
   T5: "Collect or cancel the check before resetting the table."
   (`09-refusal-outstanding.png`). Rows: visit still open.
7. **Collect at the counter, end the visit.** Cash, Paid
   (`10-check-paid.png`); order `13831392…` paid, 1800 USD. "End visit" on T5:
   Free, Needs reset, "vacated HH:MM" (`11-t5-ended-needs-reset.png`). Rows:
   visit closed with closed_at; `spaces.needs_reset_at` set on T5.
8. **The clock.** The browser was Tokyo, the server UTC; the card's vacated
   time was compared against `needs_reset_at` formatted in
   America/Mexico_City and matched.
9. **Mark ready.** "Mark ready" on T5 and on T4: the badge goes; rows:
   `needs_reset_at` null on both (`12-t5-ready.png`).
10. **Four at a two-top, refused in words, and the join it offers.** T2 with
    guests 4: "Seat 4 at T2" answers "This party is larger than the table
    allows." and the sheet offers "Seat 4 across T2 + T3"
    (`13-refusal-party-too-large-join-offer.png`). Taking it: T2 and T3 both
    Occupied, "joined with T3" / "joined with T2", "Party of 4", the headline
    counts the pair once (`14-joined-t2-t3.png`). Rows: visit `8001d396…` on
    T2 with joined_space_id T3, party 4; no visit of its own on T3.
11. **End the joined visit** ($0 check closes): both halves Needs reset, then
    Mark ready (`15-joined-ended.png`). Rows: that visit closed.

Every refusal above was asserted as the sentence and asserted NOT to contain
an identifier. The spec's own teardown hands the four proof tables back
(`_floor-db.ts::releaseFloorProof`).

## Proven without a browser (`floor-client.render.test.tsx`, 7 tests, in `test:money`)

- Every code the engine, the tables actions and the kitchen send can return
  (21 of them) is a sentence in en, es and fr through the same `floorCopy` +
  `refusalText` the screen calls; an unknown code reads as the generic
  sentence. Shown red by pointing `kitchen_empty` at its own code (1 fail),
  then restored.
- The kitchen send's two answer shapes (`reason` from the engine, `error`
  from the route guard, an English sentence when the session is gone) all land
  on a code with a sentence.
- The headline counts a joined pair once and every table as a table.
- The screen renders in all three languages with no raw catalogue key, every
  state named, the rail's two rows, the workspace name, the zone note.
- Every time is the venue's wall clock (Mexico City), never the process's.
- The check total prints in the check's own currency; the kitchen line says
  the step and revision.
- The door: `built: true`, the route branches on `mode === "floor"`, the client
  calls the engine's own actions and opens the check at
  `?mode=counter&order=`; no hex colour literal.

## Not proven, and defects seen but not fixed (outside this mode's files)

- **French in a browser**: the platform serves en/es only (see prove-tables);
  French is proven through the render test.
- **The deployed host**: see above; nothing here has run on Vercel.
- **The top-bar pill misnames the mode on a typed URL.** `PosModeSwitch`
  (`components/admin/shell/internal/page-modules/PosModeSwitch.tsx`) shows
  the DEVICE's remembered mode, not the mode in the URL: with both modes on
  and `?mode=floor` typed straight in, the pill reads "Counter"
  (`13-refusal-party-too-large-join-offer.png`, top bar) while the screen is
  Tables. Choosing Tables through the menu writes the device mode and the
  pill is right. The switch is the shell's, shared by every mode; reported,
  not touched.
- **"Open check" needs the counter on.** The check IS the counter's basket, so
  a workspace with Tables on and Counter off gets the counter-off sentence
  from "Open check". Right by construction (there is no second basket), but
  the floor could hide the button in that case; not done.
- **A held table's sheet seats the reservation** (`admissionId` is passed) but
  the fixture had no held tables tonight, so `reservationWarning` and the
  seat-a-reservation path are covered by the render test's copy only.
- **The fixture workspace's settings were changed underneath the run** between
  run 1 and run 2 (`modes` went to `["floor"]`); by whom is not known. The
  spec now sets what it needs. A proof on a shared workspace must not assume
  its settings.
- **T1** carries someone else's stale open visit (735 min, $0). Not this
  run's; left alone.

## Traces

`test-results/**/trace.zip` records every request header including the
session cookie, so it is not in this folder; it is in the session scratchpad
(`pos-floor-traces/POS-floor-mode.run3.trace.zip`). Runs 1 and 2 (the two
spec faults above) are kept beside it (`pos-floor-run1-results`,
`pos-floor-run2-results`).

## Gates (exit codes from the commands themselves, logs in `gates/`)

| command | exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.pos-floor.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.pos-floor.tickets npm run typecheck` | 0 (`typecheck.log`, verdict `TSC PASS` at 19:54:18Z) |
| `npm run lint` | 0 (`lint.log`) |
| `npm run test:money` | 0 (949 tests, 948 pass, 1 pre-existing skip; `test-money.log`) |
| `npx tsx --test floor-client.render.test.tsx` alone | 0 (7/7); 1 (1 fail) with the sentence rule broken on purpose |
| `npx playwright test e2e/cases/POS-floor-mode.spec.ts …` run 1 | 1 (spec fault 3) |
| run 2 | 1 (spec fault 4) |
| run 3 | 0 (1 passed, 2.2 min) |

## The rows, as SQL (what `read-rows.mjs` reads)

```sql
-- tenant 33333333-3333-4333-8333-333333333333 (QA Journeys), branch fxlankepwnvelxjrahwk
select id, code, name, party_min, party_max, needs_reset_at
  from spaces where tenant_id = :t order by code;
select id, space_id, joined_space_id, status, party_size, service_kind, opened_at, closed_at, version
  from visits where tenant_id = :t order by opened_at desc limit 8;
select id, status, total_cents, currency, visit_id, updated_at
  from orders where tenant_id = :t and visit_id is not null order by updated_at desc limit 6;
select id, order_id, visit_id, destination, status, revision, submitted_at
  from preparation_tickets where tenant_id = :t order by submitted_at desc limit 6;
select settings->'pos' from agencies where id = :t;
```
