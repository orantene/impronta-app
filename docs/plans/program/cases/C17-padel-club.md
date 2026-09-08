# C17 — Padel club

Cluster: hybrid  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: reservations, sessions, catalog.

## Missing business behavior

Missing: court booking, tournament series, cafe counter.

## Tasks required

P6-02, P8-01, P5-01

## Completion

- **Basic:** Books a court.
- **Complete:** Tournament reserves all courts; cafe keeps selling.

Overall status: not started

## Scenarios

### C17-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `hybrid` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a court. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Tournament window blocks courts only. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C17-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C17-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator sells a drink. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C17-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C17-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C17-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Cafe does not consume court capacity. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C17-REC — Recovery

| Field | Value |
|---|---|
| Steps | Tournament window blocks courts only. |
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
