# C25 — Sushi restaurant with takeaway

Cluster: table  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: catalog, purchase, capacity, public menu.

## Missing business behavior

Missing: pickup windows, lead time, ready notify, handoff.

## Tasks required

P5-02, P5-03, P5-08

## Completion

- **Basic:** Accepts a paid online order.
- **Complete:** Customer picks a window; kitchen prepares; notify; handoff confirmed.

Overall status: not started — engine: pickup destination + promised_at on prep ticket; ready/handoff. Browser journey not run.

## Scenarios

### C25-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `table` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer orders takeaway. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Payment ≠ preparation status. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C25-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C25-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator marks ready and hands off. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C25-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C25-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C25-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Sold-out item refused by name. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C25-REC — Recovery

| Field | Value |
|---|---|
| Steps | Payment ≠ preparation status. |
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
