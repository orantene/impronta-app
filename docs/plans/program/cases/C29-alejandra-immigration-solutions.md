# C29 — Alejandra: immigration solutions

Cluster: field  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: inquiries, offers, media documents.

## Missing business behavior

Missing: milestones with payment stages, document request/approval.

## Tasks required

P7-01, P7-04

## Completion

- **Basic:** Quotes and invoices.
- **Complete:** Multi-stage case bills per milestone; outstanding docs visible.

Overall status: not started — engine: quote versions (new inquiry_offers row). Browser journey not run.

## Scenarios

### C29-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Client sends documents. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Refresh keeps status. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C29-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C29-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator requests and approves docs. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C29-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C29-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C29-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Unpaid milestone does not unlock the next. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C29-REC — Recovery

| Field | Value |
|---|---|
| Steps | Refresh keeps status. |
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
