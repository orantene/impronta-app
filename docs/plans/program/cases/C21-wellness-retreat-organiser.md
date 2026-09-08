# C21 — Wellness retreat organiser

Cluster: hybrid  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: sessions, appointments, packages.

## Missing business behavior

Missing: multi-day package, optional add-ons, partial cancel.

## Tasks required

P7-04, P8-01, P6-01

## Completion

- **Basic:** Sells a retreat place.
- **Complete:** Add massage day two; cancel day three refunds only that component.

Overall status: not started — engine: hybrid component cancel. Browser journey not run.

## Scenarios

### C21-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `hybrid` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer buys a retreat. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Add-on has its own availability. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C21-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C21-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator adds a treatment. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C21-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C21-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C21-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Component refund leaves the rest. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C21-REC — Recovery

| Field | Value |
|---|---|
| Steps | Add-on has its own availability. |
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
