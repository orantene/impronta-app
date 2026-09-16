# Wiring verification — rerun of the failed rows after #1993 (2026-09-16)

Host `https://staging-qa-journeys.tulala.digital` serving `134590cd4` (= `origin/main`, PR #1993 "Fix the twelve defects the wiring verification found"), isolated database `fxlankepwnvelxjrahwk`, one Playwright process, `--workers=1`. Migrations `20261231240000_admission_comp_identity` and `20261231241000_session_move_commits_seat` applied to the isolated branch and to production before the merge. Logs per spec in `logs/`, traces of failures in `traces/`.

## Counts (22 specs)

| Result | Specs |
|---|---|
| passed (17) | WIRE-0-enable-modes, WIRE-1-custom-amount (1.1), WIRE-1-manager-pin (1.2), WIRE-1-payment-link (1.7), WIRE-2-move-participant (2.3), WIRE-2-customer-manage (2.6), WIRE-2-package-phases (2.11), WIRE-2-approvals (2.13), WIRE-3-party-waitlist (3.2), WIRE-4-crons (4.5), MSG-P1, MSG-P2, MSG-P5, MSG-P6, MSG-P7, MSG-P11, MSG-P12 |
| failed-app (3) | WIRE-3-guest-qr (3.6 → D-149), WIRE-3-exchange-comp (3.8 → D-146), WIRE-4-customer-thread (4.6 → D-150) |
| failed-spec, door step (1) | WIRE-3-ticket-page (3.9): after four spec fixes (label collision → D-148, empty live regions, 60 s lookup budget) the whole public page passes; the final door step cannot find the seeded night on the Door landing (`[data-door-session]`); to be re-verified after the LUMINA session's door PR |
| not runnable on the host (1) | MSG-boards-preview: `/c/t/preview` is gated `NODE_ENV !== "production"` |

Defects D-133 … D-140 are closed by this run; D-141 is closed for the page render (`/visit/<token>/menu`, `/share`, `/ticket/<code>` all serve) with the next step of each flow now measured. New: D-146 (comp payee), D-147 (`capacity_pool_committed_peak` grant, seen in the runtime log of every Event Day load), D-148 (lookup label), D-149 (pay-my-share actor `""`), D-150 (D-145 not closed on the host).

## Spec edits in this rerun (no assertion weakened)

- `_wire-seed.ts` `seedVisit`: the seeded visit now carries `opened_by` (the fixture owner), as a visit the floor opens does; `guestVisitAddLine` refuses a visit nobody opened.
- `WIRE-3-guest-qr.spec.ts`: adds a priced item (the fixture's `$0.00` offerings sort first and a `$0.00` share is unpayable by design).
- `WIRE-3-ticket-page.spec.ts`: transfer e-mail scoped to the first "New holder email" (D-148); resend and lookup answers read from the live region with words (the page keeps empty ones mounted); lookup answers given 60 s. Runs r1–r6 in `logs/`.

## Rows the run leaves on the fixture

Orders, visits, payment links, bookings, admissions and messages created by the specs on tenant `33333333-3333-4333-8333-333333333333` (each spec cleans what it can; a fixture re-seed is scheduled after the program's last run).
