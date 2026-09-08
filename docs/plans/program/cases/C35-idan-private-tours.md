# C35 — Idan: private tours

Cluster: field  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: sessions, capacity, offerings.

## Missing business behavior

Missing: departure, meeting point, manifest, vehicle cap, attendance.

## Tasks required

P7-05, P6-02, P6-04

## Completion

- **Basic:** Sells places on a dated tour.
- **Complete:** Manifest; ninth passenger refused; attendance at meeting point.

Overall status: not started

## Scenarios

### C35-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer buys a place. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | No-show does not free a sold place unless released. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C35-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C35-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Guide marks attendance. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C35-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C35-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C35-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Vehicle cap is the pool. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C35-REC — Recovery

| Field | Value |
|---|---|
| Steps | No-show does not free a sold place unless released. |
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
