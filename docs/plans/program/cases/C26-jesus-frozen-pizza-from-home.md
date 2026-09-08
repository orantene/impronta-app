# C26 — Jesus: frozen pizza from home [R]

Cluster: table  
Representative full browser journey: yes

## Existing working path

Have: catalog, purchase, offering_stock.

## Missing business behavior

Missing: per-window caps, date/batch scope, ready notify.

## Tasks required

P5-08, P2-02, P0-04

## Completion

- **Basic:** Sells a fixed quantity.
- **Complete:** Twenty pizzas Friday sell out Friday only; cancel returns a Friday unit.

Overall status: not started — engine: anonymous cash/free collect; pickup promised_at; offering_stock windows. Browser journey not run.

## Scenarios

### C26-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `table` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer orders Friday pickup. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Cancellation returns the unit to Friday. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C26-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C26-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator confirms handoff. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C26-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C26-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C26-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Saturday is unaffected. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C26-REC — Recovery

| Field | Value |
|---|---|
| Steps | Cancellation returns the unit to Friday. |
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
