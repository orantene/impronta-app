# Wiring verification suite — prompt for Cursor

Paste everything below the line into a Cursor agent opened in `/Users/oranpersonal/Desktop/impronta-app`. **Start only when the integrator says the wiring is on `main`** (Package 3 wiring PR and the Messages seams PR merged); until then the suite would test code that is not deployed. When finished, paste the closing report back to the integrator verbatim.

---

You are the wiring verifier for Tulala. Three engine packages and the Messages feature were built and then wired into the point-of-sale and workspace screens. Your job: prove every wired control end to end, in a real browser, on the deployed QA host, with the database as ground truth, and file exactly what is broken. You do not fix application code in this lane; you fix stale selectors and write specs.

## Setup

```bash
git fetch origin
git worktree add /private/tmp/wiring-verify -b work/wiring-verify origin/main
web/scripts/setup-worktree.sh /private/tmp/wiring-verify
cp /private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/wt-candidate/web/.env.capacity-isolated.local /private/tmp/wiring-verify/web/.env.capacity-isolated.local
chmod 600 /private/tmp/wiring-verify/web/.env.capacity-isolated.local
cd /private/tmp/wiring-verify/web
export VERCEL_AUTOMATION_BYPASS_SECRET=$(cat /private/tmp/claude-505/-Users-oranpersonal-Desktop-impronta-app/e30ce090-ce88-474f-861f-a6f78cb4f718/scratchpad/bypass.secret)
set -a; . ./.env.capacity-isolated.local; set +a
```
Never print or commit any secret. Never touch `/Users/oranpersonal/Desktop/impronta-app` directly.

## The host and the database

- Workspace A `https://staging-qa-journeys.tulala.digital`, workspace B `https://staging-qa-journeys-b.tulala.digital`; both serve branch `program/journeys-2026-09`, which the integrator force-pushes to the current `main` before you start. Confirm the served commit equals `git rev-parse --short origin/main` (root HTML with the bypass header; `sentry-release` marker). If not, stop and say so.
- Database: isolated Supabase branch `fxlankepwnvelxjrahwk`, fixture tenant `33333333-3333-4333-8333-333333333333` (owner `qa-journeys-owner@impronta.test`, a manager `33330001-0000-4000-8000-000000000001`), tenant B `…3334`. Production `pluhdapdnuiulvxmyspd` is never read as a target and never written. Ground truth queries go through `pg` from `web/node_modules` with the isolated `DATABASE_URL` (see `web/e2e/cases/_money-db.ts` for the helper pattern; page `in()` lists by 100 ids).
- Every request carries `x-vercel-protection-bypass` (Playwright config sends it); never request the bypass cookie.
- Run one spec at a time: `PLAYWRIGHT_BASE_URL=https://staging-qa-journeys.tulala.digital JOURNEYS_B_ORIGIN=https://staging-qa-journeys-b.tulala.digital PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 JOURNEYS_FIXTURE_READY=1 npx playwright test e2e/cases/<spec> --project=chromium --workers=1 --reporter=line --trace=retain-on-failure` (add `--project=tablet-pos` for POS specs, `--project=mobile-checkout` for phone specs). Switch every POS mode on for the fixture at the start (see `POS-platform-switch.spec.ts` / `_harness.ts`).

## What to verify

Write one spec per row under `web/e2e/cases/WIRE-<pkg>-<control>.spec.ts` (reuse an existing spec only when it already covers the row end to end; list which). Each spec: the door a person uses (rail row / button / sheet named in the boards), the action, the screen's own confirmation, then a SQL ground-truth assertion, then the refusal path (do the thing that must be refused and assert the sentence the screen shows, in English, and that no row changed). Contracts with action names, inputs and refusal codes: `docs/plans/program/engine/pos-money.md`, `scheduling.md`, `venue.md`, `messaging.md`. Never weaken or skip an assertion; a control that is disabled on purpose must show its reason sentence and is recorded as `disabled-by-design`, not as a failure.

### Package 1 — POS money & operator
| # | Control (boards) | Door | Ground truth | Refusal to prove |
|---|---|---|---|---|
| 1.1 | Custom amount line under the limit (POSCustomAmount) | Counter › Custom amount tile | `order_lines.kind='custom'`, amount, `needsApproval=false` | amount 0 → refused |
| 1.2 | Custom amount over the limit + manager PIN (POSManagerApproval) | same, then approval sheet | line locked, then `pos_approvals` row after the right PIN | wrong PIN → `pin_invalid` sentence, no row |
| 1.3 | Set staff PIN (People › Access) and workspace custom-amount limit (Settings › Roles & limits) | those cards | `agencies.settings.people.pins[user]` hashed, `settings.pos.approval.custom_amount_limit_cents` | non-manager cannot set a PIN |
| 1.4 | Lock till / unlock / switch operator (POSLock) | cashier chip › Lock, then PIN | `pos_device_sessions` row locked_at/unlocked_at/operator_user_id; open shift unchanged | wrong PIN refused |
| 1.5 | Link a booking to a sale (POSLinkBooking, B03) | basket › Booking | `order_lines.booking_id/booking_kind`; on payment the booking's balance settles | link twice → `already_linked` |
| 1.6 | Tip (basket row + customer display D02/D03) | display tip buttons or basket Tip | `orders.tip_cents`; total = subtotal − discount + tax + tip | tip after collection → `already_collected` |
| 1.7 | Payment link (POSPaymentLink, MW08) | Collect › Link | `payment_links` row open + `order_collection_reservations` reserved; `/pay/<code>` opens (mock provider) and settles → paid | second link over outstanding → `exceeds_outstanding` |
| 1.8 | Table move with expected version (T13) | Tables › table › Move | `visits.space_id` changed, version +1 | stale version → `conflict` sentence |
| 1.9 | Split check (T18), merge checks (T16), change server (T17) | Tables › check menu | new draft order on the same visit / lines merged / `visits.server_user_id` | merge a paid check → `lines_paid` |
| 1.10 | Class waitlist offer → accept / decline with hold timer (Front desk) | Front desk › Waitlist | `waitlist_offers` row, allocation on accept, released on decline/expiry | accept expired → `expired` |
| 1.11 | Cash movements + close note / hand-over (POSCashMovements, POSCashClose) | Cash › Paid in/out/Drop, Close drawer | `pos_shift_movements` rows; `pos_shifts.close_note/handed_over_to`; expected cash = float + cash sales + paid in − paid out − drops | movement on a closed shift refused |

### Package 2 — scheduling & projects
| # | Control | Door | Ground truth | Refusal |
|---|---|---|---|---|
| 2.1 | New series + Generate sessions (W40/W10) | Appointments › Series | `session_series` row; sessions generated once, idempotent on a second run (same count) | overlapping room → `overlapping_room` |
| 2.2 | Substitute instructor with scope this/future/series (W39 panel) | Sessions › row › Substitute | instructor changed on exactly the scoped sessions | past session → `past` |
| 2.3 | Move participant (W39) | Sessions › panel › Move participant | admission moved, seat released on the old pool, taken on the new | full target → `sold_out` |
| 2.4 | Cancel session with scope + paid seats banner | Sessions › panel › Cancel | sessions cancelled, admissions cancelled, refund intents opened for paid seats | already cancelled → `already_cancelled` |
| 2.5 | Cancel appointment (staff) with policy | Appointments › row › Cancel | booking cancelled, allocations released, refundable amount per policy | non-cancellable → `not_reschedulable` |
| 2.6 | Customer self-manage page (A07/A10/R04): reschedule and cancel own booking | `/manage/<token>` from the confirmation email/link | booking moved / cancelled; token single-use | reused token → refused |
| 2.7 | Replace talent on a project (W48) | Project › Team › Replace | `booking_talent` row swapped, holds moved | unavailable talent → `talent_unavailable` |
| 2.8 | Amendment send / discard (W46) | Project › Agreement | new offer version sent / draft discarded; one active offer | send with stale version → `conflict` |
| 2.9 | Milestone amount + file upload (W47) | Project › Milestones | `booking_deliverables.amount_cents`, `file_path` | — |
| 2.10 | Archive / reopen project (W50) | Project › Close | status transitions with reason | reopen a live project → refused |
| 2.11 | Package components + price phases (P01–P03, W03/E02) | Catalog › item › Package composition, Pricing › phases | `offering_components`, `offering_price_phases`; a line priced in a phase keeps its phase id after reprice | overlapping phases refused |
| 2.12 | Booking policy overrides per offering (W24) | Settings › Booking policies | `booking_policy_overrides` row; deposit/cancel paths read it | — |
| 2.13 | Approval request + role limit (W56/W22) | Settings › Roles & limits; a discount over the limit | `role_limits` row; `approval_requests` row created, decided | decide twice → refused |

### Package 3 — venue, events, guest, devices
| # | Control | Door | Ground truth | Refusal |
|---|---|---|---|---|
| 3.1 | Locations & zones (W23), till location chip, per-location modes | Settings › Locations | `venue_locations` (one default per tenant), `venue_location_zones`; `settings.pos.locations.<slug>.modes` | delete zone with spaces → `has_spaces`; delete last location → `last_location` |
| 3.2 | Party waitlist join → notify → seat → leave (T08, MW17) | Tables › Waiting list | `party_waitlist` states; seat opens a `visits` row on the chosen table | seat on an occupied table → `space_occupied` |
| 3.3 | Layout editor + activate (W13, R06) | Settings › Venue › Layouts | `space_layouts` exactly one active per location; capacity unchanged (pools) | second active → `two_active` |
| 3.4 | Service periods (W14) | Settings › Venue › Service periods | `service_periods`; reservation slots follow the period | overlap → `overlap` |
| 3.5 | Prep stations + fire by course (W15, T26) | Settings › Prep stations; Tables check › Fire course | `prep_stations`, `order_lines.course_seq`, `preparation_tickets` only for that course | delete station in use → `station_in_use` |
| 3.6 | Guest QR: browse, add, submit, substitute accept, pay my share, bill (Q02–Q07) | `/visit/<token>/…` on a phone | guest draft order with `source_channel='guest_qr'`, prep ticket, `payment_links` for the share, `already_paid` on the last share | closed visit → `visit_closed` |
| 3.7 | Seat map + hold timer (E03, E05, W17) | Event › Venue seats; public checkout | `admission_holds` with expiry, released by the reaper | two holds on one seat → `seat_taken` |
| 3.8 | Exchange (E11), comp (E12), multi-day (E14), delivery (E15) | Door › Change; Event Day › Comp; CreateEvent › series | exchange bumps `admissions.token_version` (old code refused at the gate); comp = zero-priced order + admission (+ approval when limits say); one order across nights; `admissions.delivery` written | same night → `same_session`; sms → `channel_unavailable` |
| 3.9 | Ticket page: transfer, resend, lookup (E08–E10) | `/ticket/<code>` | new code valid, old `superseded` at the gate; resend email logged | wrong lookup → `not_found`, then `too_many_attempts` |
| 3.10 | Devices + heartbeat + defaults; offline outbox replay (POSDevices, POSConnection, POSCounterOffline, W20) | Settings › POS › Devices; Connection › Sync | `pos_devices` row + `last_seen_at`; `pos_outbox` rows applied once (replay twice → one apply) | provider command → `not_replayable` |

### Messages (seams + prototypes)
| # | Control | Door | Ground truth |
|---|---|---|---|
| 4.1 | Rail row + unread badge in every mode (MS01) | each POS mode's rail | unread count = `inquiry_message_reads` gap |
| 4.2 | MSG-P1 … P8, P11, P12 prototype specs | as written | their own DB assertions; run all eight |
| 4.3 | "From Messages" origin on Orders/Receipts/kitchen ticket | Orders desk, Receipts, station | `orders.source_channel='messages'` rendered |
| 4.4 | Workspace Messages chips (conversation / opportunity / record) | `/admin/messages` | states from `inquiries.conversation_state`, `opportunity_state`, `conversation_records` |
| 4.5 | Reminders cron + delivery retry cron | trigger the cron routes with `CRON_SECRET` | `scheduled_messages` state, `message_delivery` attempts |
| 4.6 | Customer thread `/c/t/<token>` cards + visitor continuation code (MC01–MC14, MC20) | phone | card states in `inquiry_messages.card_payload.state` |

## Classify and file

`passed` · `failed-app` (real defect: add a row to `docs/plans/program/defects.md` with the next free D-id, the assertion, the trace path, and the contract line it violates) · `failed-spec` (your selector; fix and rerun once) · `failed-fixture` (say exactly which row is missing) · `disabled-by-design` (sentence shown, recorded, not a failure) · `blocked-external` (Stripe / Mercado Pago / WhatsApp / SMS keys).

Rerun each failure once. Never skip, `fixme`, or invert a test to make it pass. Fixture rows you leave are accepted; list them.

## Write

`docs/plans/program/evidence/wiring-verify/<date>/`: per-spec log, traces/screenshots of failures, `README.md` with the table above filled with verdicts, the D-ids filed, the specs you added or edited, and the host commit. Update `docs/plans/program/scenario-matrix.md` with a new "Wiring" section (one row per control). Commit on `work/wiring-verify`, push, open a PR to `main` titled "qa: wiring verification <date>" (ready, not merged).

## Closing report (paste back verbatim)

```
WIRING VERIFICATION REPORT
PR: #<n> (ready, not merged) · branch work/wiring-verify · host commit <sha>
Totals: passed <n> · failed-app <n> · failed-spec <n> (fixed) · failed-fixture <n> · disabled-by-design <n> · blocked-external <n>  of 40 controls
Package 1: <row# → verdict, …>
Package 2: <…>
Package 3: <…>
Messages: <…>; prototypes MSG-P1 <pass/fail> P2 _ P5 _ P6 _ P7 _ P8 _ P11 _ P12 _
Defects filed: D-<n> <one line each>
Specs added/edited: <list>
Fixture rows left: <ids or none>
Could not run: <what · why>
```
