# C31 — Chris: private chef [R]

Cluster: field  
Representative full browser journey: yes

## Existing working path

Have: offerings, inquiries, deposits.

## Missing business behavior

Missing: service area, visit address, travel, agreed menu, assistants.

## Tasks required

P7-03, P7-04, P6-01

## Completion

- **Basic:** Takes a booking with a deposit.
- **Complete:** Dinner for twelve records menu, travel, and an assistant.

Overall status: not started — engine: service-area fit (P7-03); travel buffers on holds (P6-03); quote versions (P7-04). Browser journey not run.

## Scenarios

### C31-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a dinner. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Menu is the accepted version. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C31-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C31-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Chef assigns an assistant. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C31-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C31-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C31-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Travel blocks calendar. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C31-REC — Recovery

| Field | Value |
|---|---|
| Steps | Menu is the accepted version. |
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
