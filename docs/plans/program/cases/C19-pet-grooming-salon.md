# C19 — Pet grooming salon

Cluster: hybrid  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, sessions, events.

## Missing business behavior

Missing: three capabilities; event alongside appointments.

## Tasks required

P2-02, P8-01, P6-01

## Completion

- **Basic:** Books grooming.
- **Complete:** Saturday event does not block grooming in another room.

Overall status: not started

## Scenarios

### C19-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `hybrid` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a groom. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Event admission ≠ appointment. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C19-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C19-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator runs an adoption event. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C19-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C19-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C19-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Rooms stay independent. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C19-REC — Recovery

| Field | Value |
|---|---|
| Steps | Event admission ≠ appointment. |
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
