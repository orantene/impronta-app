# C20 — Art gallery

Cluster: event  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: events, admissions.

## Missing business behavior

Missing: workshops as classes, private hire, shared room capacity.

## Tasks required

P6-02, P8-01, P2-02

## Completion

- **Basic:** Sells exhibition admission.
- **Complete:** Workshop, hire and admission cannot double-book the room.

Overall status: not started

## Scenarios

### C20-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `event` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Guest buys admission. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Private hire invoiced to organiser. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C20-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C20-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator books a workshop. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C20-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C20-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C20-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Same-evening collision refuses. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C20-REC — Recovery

| Field | Value |
|---|---|
| Steps | Private hire invoiced to organiser. |
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
