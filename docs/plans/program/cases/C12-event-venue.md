# C12 — Event venue [R]

Cluster: event  
Representative full browser journey: yes

## Existing working path

Have: events, tiers, admissions, door, space hire.

## Missing business behavior

Missing: private-hire quoting, performer fees, layout-aware capacity.

## Tasks required

P1-04, P1-05, P6-02, P7-05, P2-04

## Completion

- **Basic:** Sells tickets to a public event.
- **Complete:** Private hire invoiced to organiser; performer paid; second layout cannot invent capacity.

Overall status: not started — engine: admissions mint on paid + promo identity on POS reprice. qa-journeys now has `events` + `sessions.event_id` + ticket variant columns (MCP DDL, not git). No fixture event or ticket_picker mount. Browser journey not run.

## Scenarios

### C12-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `event` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Guest buys a ticket (promo optional). Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Paid with no seat compensates. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C12-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C12-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator checks in at the door. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C12-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C12-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C12-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Pay-at-door hold settled at the door. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C12-REC — Recovery

| Field | Value |
|---|---|
| Steps | Paid with no seat compensates. |
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
