# Wiring verification — 2026-09-12

Host commit: `898c211aa` (`program/journeys-2026-09` = `origin/main`).
Branch: `cursor/wiring-verify-9091`.
Database: isolated `fxlankepwnvelxjrahwk` only. Production was not read as a target and not written.

## Verdicts

Could not run the browser suite in this VM: isolated env file and `VERCEL_AUTOMATION_BYPASS_SECRET` are absent. Specs are written; they are not green.

One attempted run of `WIRE-0-enable-modes.spec.ts` against `https://staging-qa-journeys.tulala.digital` without the bypass header: `/api/dev/signin` answered Vercel SSO `302 Redirecting...` instead of the app's `307`. Log: `logs/WIRE-0-enable-modes.chromium.log`.

| # | Control | Spec | Verdict |
|---|---|---|---|
| 1.1 | Custom amount under limit | `WIRE-1-custom-amount.spec.ts` | could-not-run |
| 1.2 | Custom amount over limit + PIN | `WIRE-1-manager-pin.spec.ts` | could-not-run |
| 1.3 | Staff PIN + custom-amount limit | `WIRE-1-staff-pin-limit.spec.ts` | could-not-run |
| 1.4 | Lock / unlock / switch operator | `WIRE-1-lock.spec.ts` | could-not-run |
| 1.5 | Link booking | `WIRE-1-link-booking.spec.ts` | could-not-run |
| 1.6 | Tip | `WIRE-1-tip.spec.ts` (+ `pos-customer-display.spec.ts` happy path) | could-not-run |
| 1.7 | Payment link | `WIRE-1-payment-link.spec.ts` | could-not-run |
| 1.8 | Table move | `WIRE-1-table-move.spec.ts` | could-not-run |
| 1.9 | Split / merge / change server | `WIRE-1-split-merge-server.spec.ts` | could-not-run |
| 1.10 | Class waitlist offer | `WIRE-1-class-waitlist.spec.ts` | could-not-run |
| 1.11 | Cash movements + close | `WIRE-1-cash-movements.spec.ts` | could-not-run |
| 2.1 | New series + Generate sessions | `WIRE-2-series.spec.ts` | could-not-run (source: door still `ActionButton` with reason; expect `disabled-by-design`) |
| 2.2 | Substitute instructor | `WIRE-2-substitute.spec.ts` | could-not-run |
| 2.3 | Move participant | `WIRE-2-move-participant.spec.ts` | could-not-run |
| 2.4 | Cancel session | `WIRE-2-cancel-session.spec.ts` | could-not-run |
| 2.5 | Cancel appointment | `WIRE-2-cancel-appointment.spec.ts` | could-not-run |
| 2.6 | Customer `/manage/<token>` | `WIRE-2-customer-manage.spec.ts` | could-not-run |
| 2.7 | Replace talent | `WIRE-2-replace-talent.spec.ts` | could-not-run |
| 2.8 | Amendment send / discard | `WIRE-2-amendment.spec.ts` | could-not-run |
| 2.9 | Milestone amount + file | `WIRE-2-milestone.spec.ts` | could-not-run |
| 2.10 | Archive / reopen | `WIRE-2-archive-project.spec.ts` | could-not-run |
| 2.11 | Package + price phases | `WIRE-2-package-phases.spec.ts` | could-not-run |
| 2.12 | Booking policy overrides | `WIRE-2-booking-policy.spec.ts` | could-not-run |
| 2.13 | Approval + role limit | `WIRE-2-approvals.spec.ts` | could-not-run |
| 3.1 | Locations & zones | `WIRE-3-locations.spec.ts` | could-not-run |
| 3.2 | Party waitlist | `WIRE-3-party-waitlist.spec.ts` | could-not-run |
| 3.3 | Layout editor | `WIRE-3-layouts.spec.ts` | could-not-run |
| 3.4 | Service periods | `WIRE-3-service-periods.spec.ts` | could-not-run |
| 3.5 | Prep stations + fire | `WIRE-3-prep-stations.spec.ts` | could-not-run |
| 3.6 | Guest QR | `WIRE-3-guest-qr.spec.ts` | could-not-run |
| 3.7 | Seat hold | `WIRE-3-seat-hold.spec.ts` | could-not-run |
| 3.8 | Exchange / comp / delivery | `WIRE-3-exchange-comp.spec.ts` | could-not-run |
| 3.9 | Ticket page | `WIRE-3-ticket-page.spec.ts` | could-not-run |
| 3.10 | Devices + outbox | `WIRE-3-devices.spec.ts` | could-not-run |
| 4.1 | Rail unread | `WIRE-4-rail-unread.spec.ts` | could-not-run |
| 4.2 | MSG-P1…P8, P11, P12 | existing `MSG-P*.spec.ts` + inbox SQL | could-not-run |
| 4.3 | From Messages origin | `WIRE-4-from-messages.spec.ts` | could-not-run |
| 4.4 | Workspace chips | `WIRE-4-workspace-chips.spec.ts` | could-not-run |
| 4.5 | Reminders / delivery cron | `WIRE-4-crons.spec.ts` | could-not-run (`CRON_SECRET` also unset) |
| 4.6 | `/c/t/<token>` | `WIRE-4-customer-thread.spec.ts` | could-not-run |

Setup spec: `WIRE-0-enable-modes.spec.ts` (not one of the 40).

## Defects filed

None. No browser assertion ran, so no `failed-app` D-id.

## Specs added or edited

Added: `_wire.ts`, `WIRE-0-enable-modes.spec.ts`, `WIRE-1-*` (11), `WIRE-2-*` (13), `WIRE-3-*` (10), `WIRE-4-*` (5).
Edited: `MSG-P1`, `P2`, `P5`, `P6`, `P7`, `P8`, `P11`, `P12` (inbox SQL).

## Fixture rows left

None from this lane (no browser writes).

## Could not run

Browser suite · isolated env / `VERCEL_AUTOMATION_BYPASS_SECRET` unavailable in this Cloud Agent. Re-run on a machine that can load `web/.env.capacity-isolated.local` as the prompt specifies.
