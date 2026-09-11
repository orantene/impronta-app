# fidelity-wire-scheduling: Package 2 wired into the workspace screens, and the customer's own booking page

**Group.** The screens Engine Package 2 (`docs/plans/program/engine/scheduling.md`)
unblocks outside the files other builders held on 2026-09-11: Projects
(W46 · W47 · W48 · W50, verdicts updated in `../fidelity-projects/README.md`),
Catalog (PackageEditor and W03's price phases, P06's share on the refund
desk, verdicts in `../fidelity-catalog/README.md`), Settings (W24 overrides,
W56 limits and approval inbox, verdicts in `../fidelity-money/README.md`),
and the customer self-manage page for A07 / R04 / R05 / A10, recorded here.
The Appointments & Classes page controls (Generate sessions, New series,
Substitute instructor, Move participant, Cancel session with scope) belong
to `fid-polish2`; the exact wiring is written in
`docs/plans/program/engine/scheduling-appts-wiring.md` and was not applied.

**Branch.** `work/wire-scheduling` off `program/fidelity`. Nothing pushed;
production never read or written; `npm run db:push` never run. Every write
in the live frames went to the isolated `qa-journeys` database and was
deleted afterwards (one milestone with its amount and file, one price
phase, one package with two components); the run log lists each id.
Local `next dev` on port 3230 behind `host-proxy-ws.mjs` on 3231 presenting
`qa-journeys.local`, signed in through `/api/dev/signin` as the fixture
owner. `GUEST_COOKIE_SECRET` is not in the isolated env, so the manage
page's frames were taken with a throwaway secret exported to that dev
server only (never written to any env file or committed); the tokens in the
run log verify only against it.

**Every action is imported from `web/src/lib/server-actions/scheduling-engine.ts`**
(never re-exported through POS actions) and every engine reason reads as
`dashboard.scheduling.engine.refusal.<reason>` in en / es / fr through
`schedulingEngineSentence` (`lib/scheduling/engine-refusals.ts`). Added
this pass, because the actions return them and no sentence existed:
`not_allowed`, `not_reschedulable`, `slot_taken`.

## Per board (this folder)

| Board | Verdict | What differs and why |
|---|---|---|
| A07_CustomerManage (`live.png`, `live-es.png`, `live-refused.png`, 390x844) | partially | `/manage/<token>` on the storefront (its header, its tokens, three languages): the workspace's name, `Your booking`, the status pill, the title, the when line on the booking's clock, Paid · At the visit · Free cancellation until (the deadline the engine will apply: `booking_policy_overrides` cancel-free hours through `resolveCancellationWindow`), `Reschedule` · `Cancel` · `Add to calendar` (an `.ics`), the rule sentence. The token allows ONE action (D-POS-80): the other button is disabled with the sentence that says which link to ask for. A bad, expired or other-tenant token reads `This link is not valid anymore.` and nothing else (`live-refused.png`). Differs: the board's `Deposit paid` pill and the `Colour history form` card have no reader (deposits are read as paid transactions on the order; intake forms are D-POS-58); the fixture booking has nothing paid, so Paid reads `Nothing yet`. |
| A10_Cancel (`live.png`) | partially | The cancel confirmation on the same page: `Cancel this booking?`, `Policy` with the deadline, what comes back (the amount the policy leaves, or that nothing was paid), `Reason`, `Keep the booking`, `Cancel booking · $X`; `cancelBookingByManageToken` under one operation key; `not_cancellable`, `policy_keeps`, `conflict`, `token_invalid` as sentences; on success the card says what comes back and the refund path pays (never inline). Differs: the board is the till's own cancel (staff, with the chair release and the reminder lines); the customer sees the policy and the money only. Not pressed in the frame. |
| R04_CustomerManage | partially | Same page: a table reservation with a manage token draws as A07 (party size is not on `agency_bookings`, so `Table for 6` reads as the booking's title). `Change party or time` is the reschedule token's `Reschedule`; `Pre-order the birthday cake` has no reader. `live.png` is the A07 frame. |
| R05_Amend | not wired | The amend screen is the till's (Tables mode, owned by wire-pos-money). The customer's half of it, moving the time, is the page's Reschedule (`rescheduleBookingByManageToken`: the existing `reschedule_booking_set` with the customer's expected window as the lock; `slot_taken`, `not_reschedulable`, `conflict` as sentences). Changing the party size has no writer on a booking set and is not drawn. No live frame: the reschedule form was not opened on the fixture (it would move a real fixture booking). |

## Not wired (each a disabled control with a one-sentence reason in en, es and fr)

The action a manage token does not carry (`This link can cancel the
booking; ask for a new link to move it.`) · a milestone's title or date edit
· a price phase's `Remove` (D-POS-76) · package dependencies, manual amounts
and the guest preview (D-POS-53) · the Appointments page's five controls
(wiring doc, fid-polish2's files).

## Engine findings (not this pass's to fix, except the first)

1. `cancelBookingSet` selected `agency_bookings.offering_id`, a column that
   does not exist: every real cancel answered `unavailable` (42703) while the
   mocked unit test stayed green. Fixed here in `lib/scheduling/cancel-booking.ts`
   (the offering is on the order's lines, the path `rescheduleBooking` already
   reads); found by the manage page on the isolated database.
2. `project_replace_talent` leaves `talent_name_snapshot` as the outgoing
   person (D-POS-81): the W48 row reads the old name after a replacement.
3. `livePhasePrice` compares ISO strings; Postgres returns `+00:00` and the
   browser `Z`, and a string compare disagrees at the boundary. The screen's
   `phaseState` compares instants; the engine's reader was not changed.

## Playwright (one spec at a time, `--workers=1`, on the local dev server behind the proxy)

- `POS-projects-collect-a-balance.spec.ts`: **1 passed (2.6m), exit 0**
  (`runs/pw-POS-projects-collect-a-balance.txt`). Covers the project record
  and its milestones through the POS Projects destination.
- `SELL-catalog-events-spaces-discounts.spec.ts`: **exit 1, three runs**,
  every time in step 3 (Spaces, `/admin/spaces` to `/admin/tables`), the
  step this group did not touch: run 1 the cold compile of `/admin/tables`
  (52s) past the 120s test budget; run 2 its first compile (60s) past the
  5s identity assertion; run 3 the warm redirect (6.2s + 7.7s at load
  average 6) past the same 5s assertion. Step 1, the Catalog page this pass
  changed (Price phases card, Package composition), passed on every run;
  step 2 (Events) too. The same timing finding is recorded by fid-catalog
  (`../fidelity-catalog/runs/pw-SELL-full-run3-spaces-step-timeout.txt`).
  Not re-run a fourth time into what stopped the last three.
- `MONEY-manager-reads-the-money.spec.ts` and `POS-platform-switch.spec.ts`:
  not run; a grep of both specs finds none of the selectors or copy this
  pass changed (the refund form's `data-orders-refund-outcome`, the
  payments tabs and the platform switch are untouched).

## Gates (private lane, real exit codes) — see `gates.txt`
