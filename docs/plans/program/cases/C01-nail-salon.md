# C01 — Nail salon [R]

Cluster: appointment  
Representative full browser journey: yes

## Existing working path

Have: appointments, buffers, deposits, variants, add-ons.

## Missing business behavior

Missing: technician and station reserved together; bridal group as one booking.

## Tasks required

P2-01, P3-04, P6-01, P6-02

## Completion

- **Basic:** Books a technician and takes a deposit.
- **Complete:** Bridal group of four holds four technicians and four stations atomically.

Overall status: not started

## Scenarios

### C01-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `appointment` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a nail service and pays a deposit. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Deposit paid but hold expired — compensation, no silent paid-no-seat. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C01-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C01-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator sees the booking on Today and collects the balance. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C01-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C01-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C01-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Four-person bridal party holds all paired resources; competing booking cannot take any. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C01-REC — Recovery

| Field | Value |
|---|---|
| Steps | Deposit paid but hold expired — compensation, no silent paid-no-seat. |
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
