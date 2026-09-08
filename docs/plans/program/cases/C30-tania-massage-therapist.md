# C30 — Tania: massage therapist

Cluster: mobile  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: as case 3.

## Missing business behavior

Missing: as case 3 plus recurring agreements.

## Tasks required

P6-03, P7-02, P7-03

## Completion

- **Basic:** Takes bookings at one location.
- **Complete:** Weekly recurring client generates dated occurrences that can move independently.

Overall status: not started

## Scenarios

### C30-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `mobile` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a weekly slot. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Privacy vs spa workspace. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C30-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C30-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Talent moves one occurrence. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C30-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C30-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C30-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Agreement survives a skipped week. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C30-REC — Recovery

| Field | Value |
|---|---|
| Steps | Privacy vs spa workspace. |
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
