# C36 — Zvika: custom jewelry

Cluster: field  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: inquiries, offerings, deposits, product fulfilment.

## Missing business behavior

Missing: accepted design, agreed changes, balance before release.

## Tasks required

P7-04, P5-08

## Completion

- **Basic:** Quotes a commission.
- **Complete:** Design change repriced; balance collected before pickup.

Overall status: not started

## Scenarios

### C36-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `field` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer approves a design. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Change is versioned. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C36-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C36-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Maker confirms pickup. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C36-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C36-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C36-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Unpaid balance blocks release. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C36-REC — Recovery

| Field | Value |
|---|---|
| Steps | Change is versioned. |
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
