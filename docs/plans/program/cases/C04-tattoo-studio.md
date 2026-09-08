# C04 — Tattoo studio

Cluster: custom  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: inquiry-offer-booking, deposits, media.

## Missing business behavior

Missing: accepted quote version, multi-session series.

## Tasks required

P7-04, P6-01

## Completion

- **Basic:** Quotes and takes a deposit.
- **Complete:** Four-session piece is one agreement with per-session deposits.

Overall status: not started

## Scenarios

### C04-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `custom` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer sends a brief and accepts a quote. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Agreed change reprices without rewriting the original quote. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C04-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C04-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator records the accepted version. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C04-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C04-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C04-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Sessions share one reference. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C04-REC — Recovery

| Field | Value |
|---|---|
| Steps | Agreed change reprices without rewriting the original quote. |
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
