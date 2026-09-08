# C11 — Beach club

Cluster: table  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: reservations, events, orders.

## Missing business behavior

Missing: cabana context, queues, spending credit vs minimum.

## Tasks required

P5-01, P5-04, P5-07, P6-02

## Completion

- **Basic:** Reserves a cabana and sells tickets.
- **Complete:** Minimum consumed by orders; remaining credit visible.

Overall status: not started — engine: visit occupancy + remaining min spend display. Browser journey not run.

## Scenarios

### C11-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `table` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Guest reserves a cabana. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Event ticket is a separate record. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C11-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C11-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Staff sell food against the cabana. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C11-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C11-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C11-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Credit never goes negative silently. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C11-REC — Recovery

| Field | Value |
|---|---|
| Steps | Event ticket is a separate record. |
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
