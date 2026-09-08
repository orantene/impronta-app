# C08 — Modelling or talent agency [R]

Cluster: agency  
Representative full browser journey: yes

## Existing working path

Have: inquiries, offers, bookings, commission, multi-talent, roster.

## Missing business behavior

Missing: Sales defaulting to Bookings, deliverable/usage terms, call sheets.

## Tasks required

P2-04, P7-01

## Completion

- **Basic:** Inquiry to booking with commission.
- **Complete:** Three-model shoot books all three atomically; fees and margin separate.

Overall status: not started

## Scenarios

### C08-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `agency` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Client inquires and accepts an offer. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Quoted act is not public. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C08-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C08-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator assigns models. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C08-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C08-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C08-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Usage terms on the booking. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C08-REC — Recovery

| Field | Value |
|---|---|
| Steps | Quoted act is not public. |
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
