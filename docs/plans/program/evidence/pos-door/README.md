# pos-door: the Door mode of the point of sale, 2026-09-10

Branch `work/pos-door` off `program/journeys-2026-09` at `76d695a5d`, with
`program/journeys-2026-09` at `bb482b585` (the Tables mode) merged in before
the finish. Mode id `door`, switch label **Door** (es "Puerta", fr "Porte"),
reached from the top-bar switch "Workspace | <mode>" and its menu, at
`/admin/pos?mode=door`. Database: Supabase branch `fxlankepwnvelxjrahwk`
(qa-journeys). Production was never read from or written to.

## Where it was proven, honestly

**Not on the deployed QA host.** This branch is not pushed (the brief says do
not push), so `staging-qa-journeys.tulala.digital` cannot carry this commit.
The journey ran on a **local dev server of THIS worktree against the SAME QA
database**, the way `pos-floor`, `prove-counter` and `prove-people-projects`
did:

- `npm run dev` on `:3130` with `.env.capacity-isolated.local` exported,
  `TULALA_ALLOW_DEV_SURFACES=1`, and a `GUEST_COOKIE_SECRET` generated for the
  run (the ticket code is an HMAC over the admission id and its token version;
  no local env file carries that secret, so without one every issued ticket
  reads "No code could be signed on this server"). Behind
  `scripts/local-host-proxy.mjs 3131 qa-journeys.local 3130`, so the app sees
  the registered tenant host and the browser stays on `http://localhost:3131`.
  Dev-server lease granted for the run and revoked after it.
- `PLAYWRIGHT_BASE_URL=http://localhost:3131 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 npx playwright test e2e/journeys/pos-door.spec.ts --project=chromium --workers=1 --reporter=line --trace=on`
- Same real browser, same fixture sign-in (`/api/dev/signin` as the fixture
  owner), same rows. The only thing that differs from the deployed host is
  which build answers.

## What was resumed

The killed run left fourteen uncommitted files: the screen (`door-client.tsx`,
`door-copy.ts`, `door-actions.ts`), the loader (`lib/pos/door-tonight.ts`),
the pure model and its test (`lib/pos/door-model.ts`, `.test.ts`), the route
branch in `pos/page.tsx`, `built: true` in `modes.ts`, the catalogue in three
languages (76 keys each, aligned), the journey spec, and a fix to
`lib/pos/hold-capacity.ts` with two tests. None of it had been run: not the
dev server, not the spec, not the typecheck. Kept whole: the design of all of
it. Corrected:

1. **`door-actions.ts` imported `finalizeOrCancel` from `lib/pos/draft`, where
   it does not exist** (it lives in `lib/pos/finalize`). Turbopack refused the
   whole module, so `/admin/pos?mode=counter` and `?mode=door` both rendered a
   build-error overlay (run 2). One import line.
2. **The spec asserted `booking_transactions.amount_cents`**; the column is
   `gross_amount_cents` (run 3 failed on the row read after every screen had
   passed).
3. **The spec looked for the selling-modes card without opening the
   Point of sale section** of Settings (run 1). It now clicks the section the
   way the Tables spec does.
4. **The spec switched on Door only.** The drawer the door's cash lands in is
   opened at the counter, and this fixture workspace's settings are shared with
   every other proof on this database (the Tables run found them changed
   underneath it), so the spec now switches on BOTH Door and Counter through
   the settings card.
5. `door-model.test.ts` was not enrolled in any lane; it is in `test:money`
   beside `hold-capacity.test.ts`.
6. The `pos-modes-card.tsx` header comment listed `door` among the unbuilt
   modes; it now names the flag instead of a list that goes stale.

Not corrected, deliberately: the previous run had already flipped
`built: true`. It stays flipped because the screens now exist and were
walked; the brief's "last thing you do" is satisfied in substance.

### One engine touch outside this mode's files, and why

`lib/pos/hold-capacity.ts` held every session line against the pool keyed
`"default"`. An event's tiers are its offering's variants, each carrying the
`pool_key` it sells against (`ga`, `door`, or here `entry`), and the session's
pools are keyed the same way; there is no `default` pool on an event night.
So every tiered ticket sold through the till was refused as "not selling
places" while its own pool sat open, and the door could not sell a single
ticket through the counter's money path. The line now holds ITS variant's
tier (`tierKeyForLine`); a line with no variant is a class place and keeps the
default key, which is what the counter's class walk-in journey relies on (the
fixture's class lines all carry `variant_id: null`, checked on the QA
database). Two tests: a tiered line holds its tier's pool and not the default;
a tiered line whose session has no pool for that tier refuses rather than
taking the default. The `test:money` lane (which carries the counter's own
hold tests) is green with the change.

## The screens, and what a person clicks

| Screen | How a person reaches it |
|---|---|
| Settings > Point of sale > Selling modes: Door ON | Sidebar Settings, section "Point of sale", the switch named "Door" (`01-settings-door-on.png`). |
| Tonight's events (rail row "Gate", nothing chosen yet) | Top bar: the "Workspace / <mode>" switch, open the menu, choose "Door"; lands on `/admin/pos?mode=door` with no sidebar (`02-door-gate-sessions.png`). Every event session that has not ended and starts within two weeks, filed under "Tonight" (running now, or starting on the venue's calendar day) or "Coming up", each with date and time on the venue's clock and "n in · n expected · n capacity" (or "no capacity set"). The header says whose clock: "Times are on the venue's clock (America/Mexico_City)." |
| The gate | Tap an event. Its name, night and counts; the scan field ("Scan or type a ticket code") with an "Admit" button 56px tall; the verdict box; the guest list with a search field ("Name, email or the start of a ticket id") and a tap-to-admit "Admit" / "Admit n" per row not yet in; the walk-up panel on the right (`05-gate-admitted.png`). "Change event" goes back to the list. |
| The verdict | Type or scan a code and press Admit, or tap Admit on a row. One sentence, green only on admitted: "In. Welcome." (`05`), "Already admitted. 1 of 1 came in on this ticket earlier." (`06-gate-already-admitted.png`), "Not a valid ticket. The code does not check out." (`07-gate-forged.png`). Wrong night carries the ticket's own date: "Wrong night. This ticket is for Fri 12 Sep." Refunded, cancelled, re-issued, unknown, too many, misconfigured and engine failure each have their own sentence; the last two read as the venue's problem, not the guest's. |
| Walk-up: sell and admit (right panel of the gate) | Choose the ticket tier (price beside it; a tier with no seats tonight is listed but disabled and says so), optionally a name, email, phone; "Open the sale" creates the draft; the counter's own CollectSheet appears with cash live and card / link / pass each saying "Only cash is taken at this door"; "Take cash and admit" collects and admits (`08-gate-walkup-admitted.png`). The issued ticket shows its code, "Admitted at the gate: In", and the receipt link. "Next guest" clears the panel. |
| Box office (rail row) | Rail, "Box office": the same events on the left, the sale panel on the right with "Take cash" instead of "Take cash and admit"; the holder walks away with a code to present at the gate (`03-box-office-sale-open.png`, `04-box-office-issued.png`). |

Scan-out: the design has none and the engine has no scan-out; the guest list
says so in a sentence rather than showing a control that does nothing.

## Proven, with a browser, in the rows (run 4, 5 passed, 2.8 min, `gates/playwright-pos-door.run4.log`, EXIT=0)

Rows after: `sql/10-after-journey.json` (read with `sql/read-rows.mjs` from
`web/` with the isolated env exported; the same queries as SQL are at the
bottom). Night: event `382a7981…` "Door night 1789071294985", session
`9f2bd1fc…` starting 2026-09-10 21:00Z = 15:00 CST, tier "Entry" $20
(variant `25eef750…`, pool_key `entry`), pool `e5af62e3…` of 5.

1. **Nothing hand-inserted.** The settings card wrote `modes` with `door`
   (read back from `agencies.settings`); the Events page created the event
   and its priced tier; the Sessions view's "Schedule a night" form created
   the session and its pool of 5; the counter's Shifts screen has drawer
   `ad377f08…` open.
2. **Box office: a paid ticket, issued with its code.** Top bar > Door > Box
   office > the night > tier Entry > "Open the sale" ("$20.00", cash tab) >
   "Take cash". The panel shows "Ticket issued", a code beginning `adm1.`,
   and a receipt link `/r/<code>`. Rows: order `f412ee31…` paid, 2000 USD,
   `source_channel pos`, `source_page door`, receipt code set; transaction
   paid, provider `manual`, `gross_amount_cents 2000`, `metadata.paid_via cash`,
   `metadata.shift_id ad377f08…` (the open drawer); admission `e60e0794…`
   named "Door holder 1789071294985", `admitted_count 0`, minted off the order
   line (`order_line_id` set, `variant_id` = the Entry tier); allocation
   committed, 1 unit, on pool `e5af62e3…` with that line's id.
3. **Gate: the code admits once.** Top bar > Door > the night; counts read
   "1 expected", the holder is on the guest list "Not yet". Type the code,
   Admit: "In. Welcome.", counts "1 in", the row reads "In · 14:16 CST"
   (`05-gate-admitted.png`).
4. **A second scan is refused as already admitted.** Same code again:
   "Already admitted. 1 of 1 came in on this ticket earlier." (`06`). Rows:
   `admitted_count 1`, not 2; `seated_at` set once.
5. **Nonsense is not a ticket.** `not-a-ticket-<stamp>`: "Not a valid ticket.
   The code does not check out." (`07`). No row changed.
6. **A walk-up pays cash at the door and walks in.** Gate panel > tier Entry
   > name > "Open the sale" > "Take cash and admit": "In. Welcome.", counts
   "2 in · 2 expected · 5 capacity", the list shows both "In" with times on
   the venue's clock (`08`). Rows: second order `aa855cbe…` paid 2000 through
   the SAME drawer, second transaction paid/manual/cash/shift `ad377f08…`,
   admission `e8d59f12…` "Door walk-up 1789071294985" `admitted_count 1`,
   `door_amount_cents null` (the money is on the order, not a note on the
   admission), second committed allocation; two committed units on the tier's
   pool, one per order line.
7. **Every refusal is a sentence.** Every verdict box read during the run was
   asserted not to contain any engine word
   (`already_admitted|unknown_admission|token_superseded|not_valid|bad_signature|engine_error|not_draft|no_contact|conflict|wrong_tenant`).
8. **The clock is the venue's.** `[data-door-zone]` is
   `America/Mexico_City`; the night scheduled at 15:00 on the venue's clock
   prints "15:00 CST"; admitted times print with "CST".

## Proven without a browser (`door-model.test.ts`, 6 tests, in `test:money`)

- `venueClock` prints the venue's clock and names the zone (10:10Z is 04:10
  CST; 01:30Z on the 13th is still the evening of the 12th at the venue), and
  refuses (null) on a bad instant or an unknown zone rather than printing the
  machine's time.
- `splitTonight` files a running session and a same-venue-day session under
  tonight, a session that starts after the venue's midnight under later, drops
  ended ones, and orders by start.
- `doorVerdict` goes green on `admitted` only; `already_in`, `superseded`,
  `wrong_session` (dated when the ticket has a night), `not_valid`
  (refunded vs cancelled), `forged`, `unknown_ticket` are each their own
  refused key; `too_many`, `door_misconfigured`, `engine_error` are warn, never
  the holder's fault. **Shown red on purpose**: `already_in` pointed at tone
  `in` fails test 5 (`gates/door-model-broken-on-purpose.log`, exit 1), then
  restored (6/6).
- `matchesGuest` finds by name, email or ticket-id prefix; an empty query keeps
  every row.
- `hold-capacity.test.ts`: the two tier tests above.

## Reused, not forked

- Admitting: a scan goes to Sessions' `scanAdmission`, a tap to Events'
  `admitAtDoor` (`admin/_door-actions.ts`), both landing on `check_in` under
  the row lock; `doorVerdict` maps `DoorOutcome` and nothing in this mode
  decides admission. The guest list and counts are `loadDoor` / `doorCounts`;
  the tiers are `loadDoorTiers`.
- Money: `createDraftOrder` + `addLine` (context `door`, so
  `orders.source_page` says where), `startCollection` with the counter's own
  derived idempotency key (`posCollectionKey`), `mintAdmissionsForPaidOrder`
  as the paid hook, `finalizeOrCancel` on cancel. Not `sellAtDoor`, which
  records door money on the admission with no order, transaction or drawer.
- Chrome: `PosFrame`, `CollectSheet`, `PosRefusalBanner`, `refusalFromResult`,
  the POS token classes; the rail's rows are `POS_MODE_META.door.destinations`.

## Not proven, and what was seen but not fixed (outside this mode's files)

- **French in a browser**: the platform serves en/es only; the French
  catalogue is aligned key-for-key (`verify:ui-messages` and the i18n lane are
  green) but no French screen was rendered.
- **The deployed host**: see above; nothing here has run on Vercel.
- **Wrong night, refunded, re-issued, too many** were not produced in the
  browser (the night had one session and no refund); their sentences are
  proven through `doorVerdict` and the catalogue only.
- **A party ticket** (`admits_per_unit > 1`) was not sold; the Entry tier
  admits one. The "Admit n" row button and "In. n of m through the door."
  sentence are covered by the model test only.
- **The top-bar pill misnames the mode on a typed URL** (reported by pos-floor;
  still true): `PosModeSwitch` shows the device's remembered mode. Choosing
  Door through the menu writes it and the pill is right (`05`, top bar reads
  "Door"). The switch is the shell's; not touched.
- **The counter must be on for the door's cash.** `startCollection` in cash
  stamps the open `pos_shifts` row; a workspace with Door on and Counter off
  has no Shifts screen to open a drawer from. Right by construction (one
  drawer), but the door could say so; not done.
- **The dev-only identity banner** sits mid-page in the full-page
  screenshots (`08`); a capture artifact, not the screen.
- The run left one event ("Door night 1789071294985"), its session and pool,
  two orders and two admissions on the shared fixture workspace, the way the
  "Prove class" events from prove-appointments were left. Nothing was deleted.

## Traces

`test-results/**/trace.zip` records every request header including the
session cookie, so it is not in this folder; runs 1 to 4 are in the session
scratchpad (`pos-door-logs/run{1,2,3,4}-results`).

## Gates (exit codes from the commands themselves, logs in `gates/`)

| command | exit |
|---|---|
| `TSC_QUEUE_LOCK=/tmp/tulala-tsc.pos-door.lock TSC_QUEUE_TICKETS=/tmp/tulala-tsc.pos-door.tickets npm run typecheck` | 0 (`typecheck.log`; verdict file `/tmp/tulala-tsc.c4174c3d.last` = this checkout's key, `TSC PASS` at 20:21:33Z) |
| `npm run lint` | 0 (`lint.log`) |
| `npm run test:money` | 0 (957 tests, 956 pass, 1 pre-existing skip; `test-money.log`) |
| `npm run test:size-ratchet` | 0 (173/173; hex literals, primary button colour, suppressions; `test-size-ratchet.log`) |
| `npm run test:phase1-i18n` | 0 (20/20; `test-phase1-i18n.log`) |
| `node scripts/check-server-actions.mjs` / `check-ui-messages.mjs` / `check-untracked-imports.mjs` | 0 / 0 / 0 |
| `npx tsx --test src/lib/pos/door-model.test.ts` with the green-only rule broken | 1 (1 fail, on purpose; `door-model-broken-on-purpose.log`) |
| `npx playwright test e2e/journeys/pos-door.spec.ts …` run 1 | 1 (spec fault 3) |
| run 2 | 1 (defect 1: the import) |
| run 3 | 1 (spec fault 2, after all four screens passed) |
| run 4 | 0 (5 passed, 2.8 min) |

Typecheck and lint ran once each, after the browser proof, with no dev server
running (the run that built this mode was killed by machine overload).

## The rows, as SQL (what `read-rows.mjs` reads)

```sql
-- tenant 33333333-3333-4333-8333-333333333333 (QA Journeys), branch fxlankepwnvelxjrahwk
select timezone, settings->'pos' from agencies where id = :t;
select id, title, status, offering_id from events where tenant_id = :t and title = 'Door night 1789071294985';
select id, label, pool_key, amount_cents, admits_per_unit from talent_offering_variants where offering_id = :offering;
select id, title, status, starts_at, ends_at from sessions where tenant_id = :t and event_id = :event;
select id, pool_key, units_total, is_active from capacity_pools where subject_kind = 'session_tier' and subject_id = :session;
select id, order_line_id, holder_name, party_size, admitted_count, status, seated_at, no_show_at, token_version, door_amount_cents
  from admissions where tenant_id = :t and session_id = :session order by created_at;
select id, order_id, label, units, unit_cents, variant_id, session_id from order_lines where id in (:line_ids);
select id, status, total_cents, currency, source_channel, source_page, receipt_code, version from orders where id in (:order_ids);
select id, order_id, status, provider, gross_amount_cents, net_amount_cents, currency, metadata, paid_at
  from booking_transactions where order_id in (:order_ids);
select id, pool_id, state, units, order_line_id from capacity_allocations where pool_id = :pool;
select id, status, opened_at from pos_shifts where tenant_id = :t and status = 'open';
```
