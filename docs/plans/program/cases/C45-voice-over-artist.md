# C45 — Voice-over artist

Cluster: field  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: inquiries, offers, media delivery.

## Missing business behavior

Missing: usage terms, revision rounds, delivery acceptance.

## Tasks required

P7-01, P7-04

## Completion

- **Basic:** Quotes and delivers.
- **Complete:** Usage recorded; re-record beyond rounds is chargeable.

Overall status: not started

## Scenarios

### C45-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Client books a VO. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Extra re-record is a new charge. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C45-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C45-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Artist delivers audio. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C45-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C45-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C45-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Usage scope on the booking. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C45-REC — Recovery

| Field | Value |
|---|---|
| Steps | Extra re-record is a new charge. |
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
