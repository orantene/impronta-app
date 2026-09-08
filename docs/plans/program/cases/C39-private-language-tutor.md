# C39 — Private language tutor

Cluster: class  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, offerings.

## Missing business behavior

Missing: recurring agreements, lesson packages.

## Tasks required

P7-02, P7-04

## Completion

- **Basic:** Books single lessons.
- **Complete:** Ten-lesson package decrements; unused balance refunds under the rule.

Overall status: not started

## Scenarios

### C39-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `class` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Student books a package. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Free lesson is not overdue. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C39-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C39-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Tutor delivers a lesson. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C39-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C39-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C39-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Unused balance refund is effect 1 or 5 as stated. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C39-REC — Recovery

| Field | Value |
|---|---|
| Steps | Free lesson is not overdue. |
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
