# C03 — Independent massage therapist

Cluster: mobile  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: solo workspace, talent owner_kind.

## Missing business behavior

Missing: service areas vs rooms, travel buffers, cross-workspace privacy.

## Tasks required

P6-03, P6-05, P7-03

## Completion

- **Basic:** Takes a mobile booking.
- **Complete:** Home visit blocks matching studio slot; spa cannot see private clients.

Overall status: not started

## Scenarios

### C03-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `mobile` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a home visit. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Spa staff cannot read her private list. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C03-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C03-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Talent confirms and travels. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C03-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C03-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C03-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Studio slot blocked for the travel window. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C03-REC — Recovery

| Field | Value |
|---|---|
| Steps | Spa staff cannot read her private list. |
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
