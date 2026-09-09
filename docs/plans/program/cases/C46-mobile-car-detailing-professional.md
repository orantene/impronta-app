# C46 — Mobile car-detailing professional

Cluster: field  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, solo seller.

## Missing business behavior

Missing: service area, address, travel, on-site upsell.

## Tasks required

P7-03, P3-04

## Completion

- **Basic:** Books an appointment.
- **Complete:** On-site upgrade added to the existing order and collected on the spot.

Overall status: not started — engine: service-area + travel buffers. Browser journey not run.

## Scenarios

### C46-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a detail. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Travel buffer held. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C46-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C46-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator adds an upgrade. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C46-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C46-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C46-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | No second booking created. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C46-REC — Recovery

| Field | Value |
|---|---|
| Steps | Travel buffer held. |
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
