# C28 — Eyelash business with five workers

Cluster: appointment  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: roster, appointments.

## Missing business behavior

Missing: five workers sharing three stations.

## Tasks required

P6-01, P6-02

## Completion

- **Basic:** Books any of five technicians.
- **Complete:** Fourth simultaneous booking refused for lack of a station.

Overall status: not started

## Scenarios

### C28-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `appointment` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books lashes. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Technician-only availability is not enough. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C28-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C28-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator assigns technician and station. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C28-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C28-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C28-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Station is the constraint. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C28-REC — Recovery

| Field | Value |
|---|---|
| Steps | Technician-only availability is not enough. |
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
