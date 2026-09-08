# C05 — Hair salon

Cluster: appointment  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, stylists, add-ons.

## Missing business behavior

Missing: processing phases, wash-station allocation, mid-service changes.

## Tasks required

P7-06, P6-01, P3-04

## Completion

- **Basic:** Books a stylist for a fixed duration.
- **Complete:** Colour service releases the chair during development.

Overall status: not started

## Scenarios

### C05-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `appointment` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a colour. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Approved mid-service change is recorded. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C05-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C05-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator runs phases. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C05-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C05-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C05-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Chair frees during development; wash station held only for its phase. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C05-REC — Recovery

| Field | Value |
|---|---|
| Steps | Approved mid-service change is recorded. |
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
