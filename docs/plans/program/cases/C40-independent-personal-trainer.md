# C40 — Independent personal trainer

Cluster: class  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, solo seller.

## Missing business behavior

Missing: recurring, packages, class+appointment mix.

## Tasks required

P7-02, P2-02, P6-04

## Completion

- **Basic:** Books one-to-one sessions.
- **Complete:** Weekly agreement plus a group class draw from the correct arrangement.

Overall status: not started — engine: lesson packages + attendance drawdown. Browser journey not run.

## Scenarios

### C40-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `class` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Client books both. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Capabilities stay separate. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C40-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C40-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Trainer marks attendance. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C40-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C40-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C40-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Class does not consume a 1:1 credit unless configured. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C40-REC — Recovery

| Field | Value |
|---|---|
| Steps | Capabilities stay separate. |
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
