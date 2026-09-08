# C07 — Bar

Cluster: table  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: restaurant path plus events.

## Missing business behavior

Missing: open tabs, bar queue, booth vs admission, performer fees.

## Tasks required

P5-01, P5-04, P7-05, P1-04

## Completion

- **Basic:** Sells drinks as counter sales.
- **Complete:** Tab stays open; booth and gig ticket are separate; performer fee distinct.

Overall status: not started — engine: visits.service_kind table vs tab. Browser journey not run.

## Scenarios

### C07-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `table` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Guest opens a tab. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Promo on drinks does not apply to tickets unless scoped. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C07-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C07-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator collects at close. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C07-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C07-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C07-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Booth booking ≠ event ticket. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C07-REC — Recovery

| Field | Value |
|---|---|
| Steps | Promo on drinks does not apply to tickets unless scoped. |
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
