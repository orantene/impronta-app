# C27 — Laura: social media agency [R]

Cluster: agency  
Representative full browser journey: yes

## Existing working path

Have: inquiries, offers, bookings, recurring billing primitives.

## Missing business behavior

Missing: deliverables, approvals, milestones, ad budget ≠ fees.

## Tasks required

P7-01, P7-02

## Completion

- **Basic:** Converts inquiry to retainer.
- **Complete:** Client approves a deliverable; revisions limited; ad funds distinct.

Overall status: not started

## Scenarios

### C27-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `agency` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Client accepts a retainer. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Ad spend is not a service fee. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C27-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C27-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator tracks deliverables. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C27-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C27-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C27-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Revision over limit is chargeable. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C27-REC — Recovery

| Field | Value |
|---|---|
| Steps | Ad spend is not a service fee. |
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
