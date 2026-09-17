# Final case run — 2026-09-17

**Host.** `https://staging-qa-journeys.tulala.digital` (workspace A) and
`https://staging-qa-journeys-b.tulala.digital` (B), serving `140f003be`
(= `origin/main` at the time of the run, the merge of #2041). Everything in
this folder was produced against that one commit.

**Database.** Supabase branch `qa-journeys` (`fxlankepwnvelxjrahwk`) only.
Production (`pluhdapdnuiulvxmyspd`) was not written. `npm run db:push` was
not run. No bare `tsc`; the edited specs were linted (`eslint`) only.

**Runner.** One Playwright process at a time, `--workers=1`, project
`chromium` (no spec in this suite declares another project), bypass header
from the local secret file, isolated env from `web/.env.capacity-isolated.local`.
Per spec: `logs/<spec>.chromium.<suffix>.log`; `final` is the full 112-spec
run, `r2`…`r5` the reruns after each spec fix. Traces of the failures that
back a filed defect are under `traces/<spec>.<suffix>/` (the other failures'
traces, 250 MB of stale-selector runs, were kept out of the repo; the logs
carry every assertion and its call log). The kept zips were rewritten with the bypass secret and the isolated env values replaced by `<redacted>`; the wiring-verify zips already on `main` were not (see the program README, "still owed").

## Spec-level counts (112 specs)

| Class | `final` run | After triage, spec fixes and reruns |
|---|---|---|
| passed | 90 | **104** |
| failed-app | — | **8** (C06, C08, C09, POS-counter-cash-sale, VENUE-table-service, WIRE-2-approvals, WIRE-2-cancel-session, WIRE-3-exchange-comp) |
| failed-fixture | — | 0 left (three were fixture drifts, cleared: the expired seeded sessions, the door unit the r3 pass committed, the first-sign-in 401 which the harness now retries once) |
| failed-spec | — | 0 left (18 specs had stale selectors; all rewritten to the current screens, none weakened) |
| blocked-external | — | 0 |
| failed (unclassified) | 22 | 0 |

Of the 22 `final` failures: 12 were stale selectors only (now passing), 1
was a fixture drift plus stale selectors (C12, now passing), 1 was a one-off
render race (WIRE-1-cash-movements, green unchanged), 5 had a stale
selector or a fixture collision in front of a real defect (C08, C09,
POS-counter-cash-sale, VENUE-table-service, WIRE-3-exchange-comp), 3 were
real defects from the first assertion (C06, WIRE-2-approvals,
WIRE-2-cancel-session). Test-level: the eight failed-app specs still carry
13 passing tests between them; the CS role grid in `scenario-matrix.md`
records each role separately.

## Per-spec table (the 22 that failed in `final`; the other 90 passed in `final` and were not rerun)

| Spec | Project | Result | Run | Class | Note |
|---|---|---|---|---|---|
| C01-nail-salon | chromium | passed 3/3 | r2 | failed-spec → passed | Sales prints words, not enums (`Instant book`, `Unpaid · Awaiting payment`): the raw values live on `data-sales-channel`, `data-state`, `data-sales-due`. |
| C02-spa | chromium | passed 5/5 | r3 | failed-spec → passed | Same Sales word (final); then C02-DIFF booked the LAST slot, which C02-CUS last-resource had just blocked with therapist B's massage, and was refused "That resource is not free." (r2). DIFF now takes the third slot. |
| C06-restaurant | chromium | 3 passed / 3 failed | r2 | **failed-app D-169** | `/` (page-less tenant, Look fallback) carries no `menu_board` / `reserve_table`: `House pizza` and `Reserve a table` never render. Smoke, walk-in cash and OP smoke pass. |
| C07-bar | chromium | passed 4/4 | r3 | failed-spec → passed | Polish 6 floor: `Occupied` + `Bar tab` / `Table check` pills (was `tab · occupied`), `Seat party` → `Party size` → `Seat here` (was `open visit`), `End visit` (was `close visit`); the guest bill's total is `Total` + `$18.00` (was `Total: 1800 USD`). |
| C08-modelling-or-talent-agency | chromium | 6 passed / 1 failed | r5 | **failed-app D-174** (+ failed-spec, D-173) | The staff opened the customer's inquiry: the inbox row is the contact's name and two "Cora Cuevas · shortlist empty" rows are indistinguishable; the send test now files its contact as "Cora Cuevas C08OP<stamp>". Then the claimed contact's first dev sign-in answered 401 (D-173, harness retries once). With both fixed, Approve & lock answers `no_client_participant` (D-174). Inquiry, assign, send and talent accept pass. |
| C09-yoga-or-fitness-studio | chromium | 3 passed / 2 failed | r3 | **failed-app D-169** (+ failed-fixture) | The seeded Morning class had expired (fixture, sessions moved forward); the counter tile now says "Pick session" and opens a chooser (spec re-expressed); C09-OP passes. C09-CUS and C09-DIFF need the storefront `session_picker`, which the page-less home no longer carries. |
| C12-event-venue | chromium | passed 5/5 | r5 | failed-fixture + failed-spec → passed | QA Night was in the past ("No night is on sale yet"); after the session refresh the ticket picker v2 CTA reads "Hold my seats, pay at the door" (was "At the door"), the events-door verdict "Admitted. In. Welcome." (was "In"); r4 hit "That night just sold out at that ticket" because the r3 DIFF pass committed the night's one door unit (released on the isolated branch). |
| MONEY-manager-reads-the-money | chromium | passed 1/1 | r2 | failed-spec → passed | After a discard the basket showed `[data-pos-hold]` for the moment the router took to settle (D-155 timing) and it was gone before the tap; the helper now gives the empty surface that moment. |
| PERM-cross-workspace | chromium | passed 5/5 | r2 | failed-spec → passed | A second `goto` of B's till raced the counter's own `?mode=counter` rewrite: `net::ERR_ABORTED`. The sign-in already lands there; the spec waits for the settled address. |
| POS-counter-cash-sale | chromium | 0 passed / 1 failed / 3 did not run | r3 | **failed-app D-171** | Switch group is "Back office or point of sale" and the POS half carries the current mode (fixed). Then Open drawer after the top-bar switch throws the page to `/admin` and writes no shift (r2, r3). The three refusal tests are serial and did not run. |
| POS-platform-switch | chromium | passed 1/1 | r3 | failed-spec → passed | The switch's first half reads "Back office" (was "Workspace"); after the reload the settings nav was tapped before hydration (r2), now knocked until the card is there. |
| POS-projects-collect-a-balance | chromium | passed 1/1 | r2 | failed-spec → passed | Switch group name. |
| SELL-catalog-events-spaces-discounts | chromium | passed 1/1 | r3 | failed-spec → passed | Catalog, Events and Spaces lists render a hidden phone row (`catalog-row-phone`) before the desktop row; `.first()` landed on the hidden one. Visible-row filter. |
| VENUE-refusals-in-words | chromium | passed 2/2 | r2 | failed-spec → passed | The second locale pass tapped the tile before React owned it (no `?order=`); `counterAddItem` waits for the handler. |
| VENUE-table-service | chromium | 0 passed / 1 failed | r3 | **failed-app D-172** | Switch words and the Waiting row (`button[data-floor-waiting]`, polish 6) fixed; the walk-in lands on the Waiting list, Seat now → T4 works, and the Seated tile reads "Walk-in": the party's name never reaches the table (no admission is written). |
| WIRE-1-cash-movements | chromium | passed 1/1 | r2 | passed (flaky once) | `final`: the third movement (`drop`) was in `pos_shift_movements` but its row did not render within 20 s (three writes in 4 s, a `router.refresh()` race). Unchanged spec, r2 green. |
| WIRE-1-lock | chromium | passed 1/1 | r2 | failed-spec → passed | `ORDER BY locked_at DESC` put an unlocked row's NULL first; the read now takes the newest lock. |
| WIRE-1-staff-pin-limit | chromium | passed 1/1 | r2 | failed-spec → passed | Save is disabled while the field equals the stored limit and a previous run leaves $50.00; the step moves the limit to $60.00 first, then back, and reads both back. |
| WIRE-2-approvals | chromium | 0 passed / 1 failed | r2 | **failed-app D-170** | The code is refused "That code cannot be applied to this sale" (`discountNeedsCustomer`): the buyer named on the sale is attached only at collection. D-139's over-limit request is unreachable from the screen. |
| WIRE-2-cancel-session | chromium | 0 passed / 1 failed | r2 | **failed-app D-168** | "This could not be completed. Try again.": `session_cancel` inserts a `ticket_refund_intents` row with reason `session_cancelled`, which the CHECK no longer allows. |
| WIRE-3-exchange-comp | chromium | 1 passed / 1 failed | r4 | **failed-app D-168** (+ failed-spec) | E12 comp: the seeded nights shared the fixture night's day and the Dates button picked QA Night (r2, r3); nights moved to days 4 and 5, button scoped to the event's Dates group; comp passes (r4). E11 exchange to a cheaper night: refund intent `admission_exchange` refused by the same CHECK. |
| WIRE-4-customer-thread | chromium | passed 1/1 | r2 | failed-spec → passed | A plain `text` message is drawn as a card (`data-card-kind="text"`) and the comparison set, built from payload-carrying messages only, refused it; the set is now every message the customer may see. |

## D-ids filed this run

| ID | Spec | One sentence |
|---|---|---|
| D-168 | WIRE-2-cancel-session, WIRE-3-exchange-comp (E11) | `20261231244000_events_refund_settings` re-created `ticket_refund_intents_reason_check` without `session_cancelled` and `admission_exchange`; cancelling a session with a paid seat and exchanging to a cheaper night both fail; production carries the same CHECK. |
| D-169 | C06-CUS ×3, C09-CUS, C09-DIFF | A page-less tenant's Look fallback (#1989) renders its home without its type's components (no menu board, no reserve-table block, no class picker). |
| D-170 | WIRE-2-approvals | A promo code can never be applied on a counter sale before it is charged: the named buyer is attached only at collection and reprice refuses a code without `orders.customer_id`. |
| D-171 | POS-counter-cash-sale | After entering the counter from the top-bar switch, Open drawer throws the operator back to the Overview and no shift is written. |
| D-172 | VENUE-table-service | Seating a waiting party from the Live Floor opens a nameless walk-in: no admission carries the party's name, size or `seated_at`. |
| D-173 | C08-CUS accept (harness) | The first `/api/dev/signin` for a brand-new `@impronta.test` user answers 401; the second is a 307. The harness retries that one answer once. |
| D-174 | C08-CUS accept | The claimed client's account-less seat keeps `user_id` NULL, so Approve & lock answers `no_client_participant` (and the dialog prints the raw code). |

Ids follow `defects.md` (last was D-167). Note: the LUMINA tracker on
`origin/docs/lumina-tracker-round2` numbers its own rows D-165…D-169, which
collide with this ledger; the rows above are the `defects.md` ones.

## Spec edits (no assertion weakened, nothing skipped or inverted)

- `web/e2e/cases/_harness.ts` — `signInJourneysStaff` retries the D-173 first-sign-in 401 once, for `@impronta.test` e-mails only.
- `C01-nail-salon.spec.ts` — Sales row read from `[data-sales-channel='instant_book']`, `[data-sales-due='owed']`, `[data-state='pending_payment']`.
- `C02-spa.spec.ts` — the three Sales channel checks read `data-sales-channel`; C02-DIFF takes the third slot instead of the last.
- `C07-bar.spec.ts` — floor words of polish 6 (Occupied + Bar tab / Table check, Seat party → Seat here, End visit); the guest bill's total row.
- `C08-modelling-or-talent-agency.spec.ts` — C08-OP send files its contact as "Cora Cuevas C08OP<stamp>" and opens the row by that reference.
- `C09-yoga-or-fitness-studio.spec.ts` — the class tile's session chooser (C09-OP picks Morning class, C09-DIFF picks Last place class in the dialog).
- `C12-event-venue.spec.ts` — "Hold my seats, pay at the door" CTA (twice); the events-door verdict "Admitted. In. Welcome.".
- `MONEY-manager-reads-the-money.spec.ts` — `counterNextSale` gives the empty surface 8 s after a discard before parking what is still there.
- `PERM-cross-workspace.spec.ts` — no second `goto` of B's till; waits for the settled `?…order=` address.
- `POS-counter-cash-sale.spec.ts`, `POS-projects-collect-a-balance.spec.ts`, `VENUE-table-service.spec.ts` — switch group `(back office|workspace) or point of sale`, first half `back office`; the POS half by `/^pos\b/`.
- `POS-platform-switch.spec.ts` — `Back office` half; `clickSettingsNav` after the reload.
- `SELL-catalog-events-spaces-discounts.spec.ts` — `.filter({ visible: true })` on the catalog, events and spaces rows.
- `VENUE-refusals-in-words.spec.ts` — `counterAddItem` for the pizza on every locale pass.
- `VENUE-table-service.spec.ts` — the waiting party row is `button[data-floor-waiting]`.
- `WIRE-1-lock.spec.ts` — the newest LOCK (`locked_at IS NOT NULL`, `nullsFirst: false`).
- `WIRE-1-staff-pin-limit.spec.ts` — moves the limit to $60.00 first when $50.00 is already stored, reads both back.
- `WIRE-3-exchange-comp.spec.ts` — nights seeded at days 4 and 5; the Dates button scoped to the event's `Dates` group.
- `WIRE-4-customer-thread.spec.ts` — the card-kind set is every non-internal, non-deleted message of the conversation.

## Fixture actions (isolated branch only)

- The three seeded sessions were moved forward per the seed's own intervals (`Morning class` now + 1 d, `Last place class` + 1 d 4 h, `QA Night` + 2 d; `ends_at` likewise), because the seed's `ON CONFLICT` for the two classes does not move `starts_at` and all three had expired on 2026-09-12/13. Before the next run more than a day away, do it again or fix the seed.
- The `door` allocation `9481a8ea…` on QA Night's `door` pool (1 unit), committed by the r3 pass of C12-DIFF, was released so the journey could run again (r5).
- The custom-amount limit is left at $50.00 (the spec's own final state), the fixture owner's PIN as the spec sets it.

## Rows the run leaves on the fixture (tenant `33333333-3333-4333-8333-333333333333`, created 2026-09-17)

orders 73 · order_lines 66 · customers 45 · inquiries 24 · inquiry_messages 59 · visits 16 · admissions 11 · talent_holds 11 · capacity_allocations 17 · agency_bookings 26 · preparation_tickets 6 · pos_shifts 2 (closed) · pos_shift_movements 6 · pos_device_sessions 2 · party_waitlist 2 · payment_links 2 · tenant_promo_codes 1 (WIRE-2.13's, left because its `finally` runs after the assertion that failed). Each spec cleans what it can; a fixture re-seed is still owed after the program's last run.

## Known drifts confirmed on this host (for the next runner)

- The Sales table prints words: channel, state and due are words with the raw values on `data-*` attributes.
- Lists on Catalog, Events and Spaces render a hidden phone row before the desktop row.
- The top-bar switch is "Back office | POS · <mode>", group label "Back office or point of sale"; with more than one mode on, the POS half opens the mode menu.
- The floor card says `Occupied` and, beside it, `Bar tab` or `Table check`; a party is seated with `Seat party → Party size → Seat here`; a visit ends with `End visit`.
- A class tile with more than one upcoming session says "Pick session" and opens a chooser.
- The ticket picker's pay-at-door CTA is "Hold my seats, pay at the door"; the `door_offered` sentence on a night reads "Paying at the door is available closer to the night." even when the door IS offered (copy, cosmetic).
- The events door's verdict is the sentence "Admitted. In. Welcome."; the lookup row reads "In · HH:MM".
