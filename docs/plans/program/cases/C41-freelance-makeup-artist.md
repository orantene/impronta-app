# C41 — Freelance makeup artist

Cluster: appointment  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: solo seller, offerings, deposits.

## Missing business behavior

Missing: travel, call times, multi-person on-location.

## Tasks required

P6-03, P7-03, P6-01

## Completion

- **Basic:** Books a single session.
- **Complete:** Bridal party of five is one on-location slot with travel and one price.

Overall status: not started — engine: independent appointments. Browser journey not run.

## Scenarios

### C41-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `appointment` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a party. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | One price on one order. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C41-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C41-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Artist travels. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C41-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C41-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C41-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Travel buffer held. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C41-REC — Recovery

| Field | Value |
|---|---|
| Steps | One price on one order. |
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
