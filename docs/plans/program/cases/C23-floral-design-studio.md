# C23 — Floral design studio

Cluster: hybrid  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: inquiries, offerings, sessions.

## Missing business behavior

Missing: commission with accepted design, workshops, delivery.

## Tasks required

P7-04, P7-02, P8-01

## Completion

- **Basic:** Sells workshop places.
- **Complete:** Wedding commission bills deposit and balance against an accepted design.

Overall status: not started

## Scenarios

### C23-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `hybrid` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a workshop. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Design change is versioned. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C23-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C23-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator runs a wedding commission. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C23-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C23-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C23-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Workshops stay independent of the commission. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C23-REC — Recovery

| Field | Value |
|---|---|
| Steps | Design change is versioned. |
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
