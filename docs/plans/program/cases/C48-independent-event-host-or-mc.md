# C48 — Independent event host or MC

Cluster: event  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: as case 38.

## Missing business behavior

Missing: setup and travel, multi-event days.

## Tasks required

P7-05, P6-03, P7-03

## Completion

- **Basic:** Takes a booking.
- **Complete:** Two events in one day refused if travel does not fit.

Overall status: not started — engine: travel buffers; two events in one day. Browser journey not run.

## Scenarios

### C48-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `event` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Organiser books the host. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Second booking that does not fit is refused. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C48-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C48-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Host accepts. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C48-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C48-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C48-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Travel between venues is in the hold. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C48-REC — Recovery

| Field | Value |
|---|---|
| Steps | Second booking that does not fit is refused. |
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
