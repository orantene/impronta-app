# C09 — Yoga or fitness studio [R]

Cluster: class  
Representative full browser journey: yes

## Existing working path

Have: session series, materialiser, tier pools, capacity.

## Missing business behavior

Missing: registrations in Sales, attendance ≠ payment, walk-in from POS.

## Tasks required

P2-04, P3-05, P6-04

## Completion

- **Basic:** Publishes a recurring class and sells places.
- **Complete:** Walk-in buys at the door against the same pool; free place is not overdue.

Overall status: implementing — C09-CUS website register and C09-OP walk-in complimentary place proven ($0 paid, not overdue). Attendance, recurring publish, and sold-out door not run. Case not verified.

## Scenarios

### C09-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `class` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer registers for a class. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | DST collision is visible to the operator. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C09-CUS/class-register.md` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | implementing — storefront session_picker Morning class proven; attendance not run |

### C09-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator marks attendance. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C09-OP/walk-in-class.md` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | implementing — POS walk-in complimentary Morning class proven; attendance not run |

### C09-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C09-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Walk-in consumes the same pool. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C09-REC — Recovery

| Field | Value |
|---|---|
| Steps | DST collision is visible to the operator. |
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
