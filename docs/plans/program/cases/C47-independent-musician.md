# C47 — Independent musician

Cluster: event  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: as case 38.

## Missing business behavior

Missing: as 38 plus selling tickets at someone else's venue.

## Tasks required

P7-05, P6-03, P1-04

## Completion

- **Basic:** Takes a booking.
- **Complete:** Sells tickets to a gig at a venue he does not own without claiming its capacity.

Overall status: not started — engine: performer fee distinct from admission. Browser journey not run.

## Scenarios

### C47-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `event` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Fan buys a ticket. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Promo applies to his tickets only. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C47-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C47-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Musician settles at the door if offered. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C47-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C47-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C47-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Venue capacity stays the venue's. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C47-REC — Recovery

| Field | Value |
|---|---|
| Steps | Promo applies to his tickets only. |
| Expected persisted | Compensation or release matches L55. No duplicate refund. Staff can see pending/failed/done. |
| Disposition | not started |

## Score

| Scenario | Passed | Failed | Blocked |
|---|---|---|---|
| CUS | | | |
| OP | | | |
| TAL | | | |
| DIFF | | | |
| REC | | | |
