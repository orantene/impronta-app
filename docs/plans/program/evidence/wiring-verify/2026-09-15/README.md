# Wiring verification — 2026-09-15

Host commit: `a43445d9e` (= `origin/main`), served by `https://staging-qa-journeys.tulala.digital` (A) and `https://staging-qa-journeys-b.tulala.digital` (B), confirmed from the root HTML with the bypass header.
Branch: `work/wiring-verify-run`. Database: isolated `fxlankepwnvelxjrahwk` only, via `pg` / the service client; production never read as a target, never written.
Runner: one Playwright process at a time, `--project=chromium --workers=1 --trace=retain-on-failure`; 3.6 also on `mobile-checkout`; the MSG send-options prototypes also tried on `tablet-pos` (same result).

## Totals

Of 40 controls: **passed 27 · failed-app 12 · failed-spec 0 open (33 specs were stale and were fixed or rewritten, listed below) · failed-fixture 0 (every missing row is now seeded by the spec and removed after) · disabled-by-design 0 as a control verdict (11 refusal halves are recorded that way inside their rows) · blocked-external 1**.

Defects filed: D-133 … D-145 (13 rows in `docs/plans/program/defects.md`).

## Control table

| # | Control | Spec | Verdict | D-id | What was proven / what refused |
|---|---|---|---|---|---|
| 1.1 | Custom amount under the limit | `WIRE-1-custom-amount.spec.ts` | failed-app | D-133, D-134 | under-limit line proven on a product-opened sale; amount 0 cannot be added (Continue stays shut) |
| 1.2 | Custom amount over the limit + manager PIN | `WIRE-1-manager-pin.spec.ts` | failed-app | D-134 | PIN wiring proven on a product-opened sale: wrong PIN refused with no row, right PIN writes pos_approvals and unlocks |
| 1.3 | Staff PIN + custom-amount limit | `WIRE-1-staff-pin-limit.spec.ts` | passed | — | viewer refused at the capability gate (`not_allowed` sentence; contract names no code), hash stored, limit 5000 |
| 1.4 | Lock / unlock / switch operator | `WIRE-1-lock.spec.ts` | passed | — | wrong PIN refused; locked_at / unlocked_at; shift unchanged |
| 1.5 | Link a booking to a sale | `WIRE-1-link-booking.spec.ts` | passed | — | seeded customer+booking; second link disabled-by-design (sheet says which booking); collection writes booking_transactions |
| 1.6 | Tip | `WIRE-1-tip.spec.ts` | passed | — | tip_cents 180, total 1980; after collection no tip door exists (basket gone, display Paid) = disabled-by-design |
| 1.7 | Payment link | `WIRE-1-payment-link.spec.ts` | failed-app | D-135 | link + reservation proven; second link disabled-by-design (panel hides Create and says why); /pay settles the link but never the sale |
| 1.8 | Table move with expected version | `WIRE-1-table-move.spec.ts` | passed | — | visit moved to T5, version +1; stale version refused in words |
| 1.9 | Split / merge / change server | `WIRE-1-split-merge-server.spec.ts` | passed | — | second draft on the visit; server_user_id; merge with a paid partial refused `lines_paid`, nothing moved |
| 1.10 | Class waitlist offer → accept / decline | `WIRE-1-class-waitlist.spec.ts` | passed | — | seeded entries; offer holds a seat; expired accept refused; accept commits the allocation |
| 1.11 | Cash movements + close / hand-over | `WIRE-1-cash-movements.spec.ts` | passed | — | float_add / paid_out / drop rows; close note; expected cash = float + sales + in − out − drops; after close tiles disabled = disabled-by-design |
| 2.1 | New series + Generate sessions | `WIRE-2-series.spec.ts` | passed | — | series row; generate idempotent (0 created, N existed); overlapping room refused |
| 2.2 | Substitute instructor (scope) | `WIRE-2-substitute.spec.ts` | passed | — | Future = exactly the later scheduled sessions, This = one; cancelled session closed at the door with reason; `past` is not in contract §2 |
| 2.3 | Move participant | `WIRE-2-move-participant.spec.ts` | failed-app | D-136 | full target refused `sold_out`; move lands; the new seat stays a 15-min hold |
| 2.4 | Cancel session with scope + paid seats | `WIRE-2-cancel-session.spec.ts` | passed | — | 2 cancelled, pools off, admission void, ticket_refund_intents row, banner; cancelled session closed at the door |
| 2.5 | Cancel appointment (staff) | `WIRE-2-cancel-appointment.spec.ts` | passed | — | cancelled with reason, policy answer; completed booking closed at the door with its sentence |
| 2.6 | Customer self-manage /manage/<token> | `WIRE-2-customer-manage.spec.ts` | failed-app | D-137 | cancel via token proven; used link shows Closed with no action; reschedule always `conflict` |
| 2.7 | Replace talent on a project | `WIRE-2-replace-talent.spec.ts` | passed | — | booking_talent swapped; busy person refused `talent_unavailable` |
| 2.8 | Amendment send / discard | `WIRE-2-amendment.spec.ts` | passed | — | stale conversation version → conflict; fresh send → sent (one active); discard → superseded |
| 2.9 | Milestone amount + file | `WIRE-2-milestone.spec.ts` | passed | — | amount_cents 12000; file_path from the upload |
| 2.10 | Archive / reopen project | `WIRE-2-archive-project.spec.ts` | passed | — | archived with reason, reopened to confirmed; live reopen refused in words |
| 2.11 | Package components + price phases | `WIRE-2-package-phases.spec.ts` | passed | D-138 (normal) | components; duplicate = overlap; end-before-start = overlap; phase stamps on reprice and stays |
| 2.12 | Booking policy overrides | `WIRE-2-booking-policy.spec.ts` | passed | — | row per item; cleared cell clears the column |
| 2.13 | Approval request + role limit | `WIRE-2-approvals.spec.ts` | failed-app | D-139 | role_limits row; inbox decides a seeded request once; nothing raises a request and limits are never consulted |
| 3.1 | Locations & zones, till chip, per-location modes | `WIRE-3-locations.spec.ts` | passed | — | one default; zone added; `has_spaces` in words; modes under default.modes; chip names QA Floor; `last_location` has no door on the card |
| 3.2 | Party waitlist join → notify → seat → leave | `WIRE-3-party-waitlist.spec.ts` | failed-app | D-140 | join, seat (visit on T5), `space_occupied` proven; notify/leave have no door |
| 3.3 | Layout editor + activate | `WIRE-3-layouts.spec.ts` | passed | — | exactly one active; activate swaps; pools untouched; `two_active` disabled-by-design |
| 3.4 | Service periods | `WIRE-3-service-periods.spec.ts` | passed | — | row; overlap refused in the venue engine's words |
| 3.5 | Prep stations + fire by course | `WIRE-3-prep-stations.spec.ts` | passed | — | station; `station_in_use`; Fire starters tickets only course 1 |
| 3.6 | Guest QR browse / add / submit / share / bill | `WIRE-3-guest-qr.spec.ts` | failed-app | D-141 | bill + `visit_closed` proven (chromium + mobile-checkout); /menu and /share are a 500 |
| 3.7 | Seat map + hold timer | `WIRE-3-seat-hold.spec.ts` | passed | — | hold with expiry; second guest `seat_taken`; one live hold |
| 3.8 | Exchange / comp / multi-day / delivery | `WIRE-3-exchange-comp.spec.ts` | failed-app | D-142 | exchange (token_version +1, same night not offered) and print delivery proven; comp cannot write; multi-day not run |
| 3.9 | Ticket page transfer / resend / lookup | `WIRE-3-ticket-page.spec.ts` | failed-app | D-141 | picker purchase and receipt code proven; /ticket/<code> is a 500 |
| 3.10 | Devices + heartbeat; offline outbox replay | `WIRE-3-devices.spec.ts + WIRE-3-devices-outbox.spec.ts` | passed | — | pos_devices + last_seen_at; applied once, replay `already`; provider command `not_replayable`; offline cash queued and settled by Sync |
| 4.1 | Rail row + unread badge in every mode | `WIRE-4-rail-unread.spec.ts` | passed | — | badge = loadMessagingInbox unread rule in all five modes (27) |
| 4.2 | MSG-P1…P8, P11, P12 prototypes | `MSG-P*.spec.ts` | failed-app | D-143 (intermittent), D-144 | P1, P8, P11, P12 pass; P2/P5/P6/P7 families proven only by dispatching the off-screen row |
| 4.3 | From Messages origin | `WIRE-4-from-messages.spec.ts` | passed | — | Held sales, Receipts and the station badge from source_channel |
| 4.4 | Workspace Messages chips | `WIRE-4-workspace-chips.spec.ts` | passed | — | conversation / opportunity chips match the row |
| 4.5 | Reminders cron + delivery retry cron | `WIRE-4-crons.spec.ts` | blocked-external | — | QA deployment has no CRON_SECRET; both routes 503 `not_configured`; gate proven |
| 4.6 | Customer thread /c/t/<token> | `WIRE-4-customer-thread.spec.ts` | failed-app | D-145 | no screen hands out the link; signing secret is server-only; MC20 not implemented |

Setup spec `WIRE-0-enable-modes.spec.ts` (not one of the 40): passed, every POS mode on for the fixture.

## Defects filed (one line each; full rows in defects.md)

- D-133 · "Add to sale" on the Custom amount sheet does nothing while the draft underneath is still starting (no refusal, sheet stays filled).
- D-134 · The first custom line on a sale started under the sheet lands in the database and then vanishes from the counter (refresh drops `?order=`; the approval dialog's Approve goes inert the same way).
- D-135 · A payment link marked paid never collects the sale (`orders` stays `draft`, no `booking_transactions`; Stripe ends in the same function).
- D-136 · Move participant leaves the new seat as a 15-minute hold that is never committed; the reaper frees it under a valid admission.
- D-137 · A customer can never reschedule from `/manage/<token>`: `expectedEndsAt` is never sent and the SQL stale-screen guard reads it as a conflict.
- D-138 (normal) · A live price phase never prices a counter sale by itself; only a reprice (Discount sheet) stamps it.
- D-139 · Role limits are written but never enforced (`assertRoleLimit` has no caller) and nothing raises an approval request.
- D-140 (normal) · Notify and Leave have no door on the Tables waiting list (a party row opens Seat straight away).
- D-141 · `/visit/<token>/menu`, `/visit/<token>/share` and `/ticket/<code>` are a 500 for every visit and every valid ticket (a function prop handed to a client component).
- D-142 · Comp never issues a ticket: the $0 paid order violates `orders_identified_before_payment`.
- D-143 (normal, intermittent) · Replying from the "Needs reply" inbox can close the thread ("No conversations yet.").
- D-144 (normal) · The thread's Actions menu overflows the top of the screen; Send options cannot be reached at 1280×720 nor on the iPad project.
- D-145 (normal) · No screen hands a customer their `/c/t/<token>` link: the pay page reads `orders.inquiry_id` that Messages never sets, and the shell drops the new-conversation token.

## Specs added or edited

Edited (harness): `_harness.ts` (`awaitHydrated` after every sign-in: a click before React attached its handlers only focused the element), `_wire.ts` (`clickSettingsNav`, `clickUntil`, `openPersonPinBox`, the real `latestCustomLine`, `readStaffPinHashes`, venue sentences, the reply helper writes then lets each prototype assert its screen), `_wire-seed.ts` (`seedBookingWithBalance`, `seedClassWaitlist`, `seedSeries`, `seedSeriesMove` on its own series, `seedEventNight(daysOut, hour)`, `seedVisit` on a free table).

Rewritten or repaired, one control each: `WIRE-0`, `WIRE-1-staff-pin-limit`, `WIRE-1-custom-amount` (+ a slow-path test), `WIRE-1-manager-pin` (+ a product-first test), `WIRE-1-link-booking`, `WIRE-1-tip`, `WIRE-1-payment-link`, `WIRE-1-table-move`, `WIRE-1-split-merge-server`, `WIRE-1-class-waitlist`, `WIRE-1-cash-movements`, `WIRE-2-series`, `WIRE-2-substitute`, `WIRE-2-move-participant` (+ seat ground truth), `WIRE-2-cancel-session`, `WIRE-2-cancel-appointment`, `WIRE-2-customer-manage`, `WIRE-2-amendment`, `WIRE-2-milestone`, `WIRE-2-archive-project` (+ reopen), `WIRE-2-package-phases`, `WIRE-2-booking-policy`, `WIRE-2-approvals`, `WIRE-3-locations`, `WIRE-3-party-waitlist`, `WIRE-3-layouts`, `WIRE-3-service-periods`, `WIRE-3-prep-stations`, `WIRE-3-guest-qr`, `WIRE-3-exchange-comp` (split: comp / exchange+delivery), `WIRE-3-ticket-page`, `WIRE-3-devices`, `WIRE-4-rail-unread`, `WIRE-4-from-messages`, `WIRE-4-crons` (+ the gate test), `WIRE-4-customer-thread`, `MSG-P1`, `MSG-P2`, `MSG-P5`, `MSG-P6`, `MSG-P7`, `MSG-P12`.
Untouched and passing as written: `WIRE-1-lock`, `WIRE-2-replace-talent`, `WIRE-3-seat-hold`, `WIRE-3-devices-outbox`, `WIRE-4-workspace-chips`, `MSG-P8`, `MSG-P11`.

Nothing was skipped, fixmed or inverted. Where a refusal has no door, the spec asserts the closed door and its sentence and the row that did not change.

## Observations (not defects)

- Cash drawer offers `float_add` ("Add cash"), `paid_out`, `drop`; the engine also accepts `paid_in`, which has no tile. Expected cash is the same.
- A 14-day single-weekday series generated 1 session on Generate, not 2; the nightly materialiser may own the rest.
- `order_lines.course_seq` has no editor on the counter; 3.5 stamps it as fixture state before Fire starters.
- No `resource` card family exists in `CARD_KINDS`; a room rides the service card (`MSG-P5` asserts that).
- Send-options families depend on the POS mode (`familiesForMode`): counter → menu options; classes → service card, professional times, class card; door → tickets card; projects → service card, offer review.

## Fixture rows left

- Held counter drafts from every counter run (`orders.status='draft'`, ~37 today) and the paid sales the specs collected (1.5, 1.6, 1.9, 3.10) with their `booking_transactions` and shell bookings; customer `wire-link-1789538008851@impronta.test` (its collected sale references it).
- Two open payment links from 1.7 and 3.6 (`payment_links`, plus one `paid` link on a still-`draft` order — D-135's evidence).
- `inquiry_messages` replies `WIRE-P1 …` / `WIRE-P12 …` (11 rows) and the offer-event messages the 2.8 send wrote on inquiry `07199f51…`; the two projects' accepted v3 offers were restored by hand after the r4 cleanup failed (the sent v5 blocked it; the spec's cleanup now handles that order).
- The milestone upload's `inquiry_attachments` row and storage object (2.9).
- T1's real check (`visits` on T1, open since 09-11) was merged into T4 by 1.9 r4 before the spec was fixed; its order is `cancelled`.
- `capacity_allocations` in `hold` from 1.10 / 2.3 runs (the reaper's job); sessions, series, bookings, layouts, periods, stations, zones, devices, waitlist entries, role limits and policy overrides the specs seeded were all removed.

## Could not run

- 4.5 state moves: `CRON_SECRET` is not configured on the QA deployment (503 `not_configured` for any caller).
- 4.6 page: `/c/t/<token>` cannot be reached from any screen (D-145) and the token's secret is server-only.
- 3.8 multi-day (E14): a series purchase across nights needs the public checkout on an event series; not driven in this run.
- Traces: the Playwright `trace.zip` archives embed the bypass header and session cookies, so `traces/<spec>.<run>/` keeps each failure's final frame only; the full archives stayed on the runner.

## Logs

`logs/<spec>.<project>.<run>.log`, one file per run, exit code on the last line. Failure frames under `traces/`.
