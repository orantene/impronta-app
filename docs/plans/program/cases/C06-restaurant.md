# C06 — Restaurant [R]

Cluster: table  
Representative full browser journey: yes

## Existing working path

Have: catalog, orders, capacity, reservations, public menu.

## Missing business behavior

Missing: open checks, table QR visit identity, kitchen, cash/shift, split.

## Tasks required

P5-01–P5-06, P3-01, P3-02

## Completion

- **Basic:** Takes a reservation and a public menu order.
- **Complete:** Guest scans table QR; staff fire courses; check moves; bill splits.

Overall status: implementing (open check, visit QR, kitchen). Split settlement not built.

## Scenarios

### C06-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `table` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Guest reserves then orders. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Two operators cannot silently overwrite. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C06-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C06-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator opens the check and fires courses. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C06-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C06-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C06-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | QR cannot expose a previous visit. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C06-REC — Recovery

| Field | Value |
|---|---|
| Steps | Two operators cannot silently overwrite. |
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
