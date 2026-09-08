# C34 — Evy Solutions: provisional profile

Cluster: agency  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: claim flow, provisional profiles, roster invite.

## Missing business behavior

Missing: what a provisional profile may sell before claim.

## Tasks required

P7-01, P2-02

## Completion

- **Basic:** Provisional profile exists and is discoverable.
- **Complete:** Cannot take money or publish terms until claimed; claim keeps history.

Overall status: not started — engine: unclaimed_seller refusal with EN/ES copy. Browser journey not run.

## Scenarios

### C34-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `agency` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Visitor sees the profile. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | History survives claim. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C34-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C34-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Owner claims it. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C34-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C34-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C34-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Pre-claim checkout is refused. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C34-REC — Recovery

| Field | Value |
|---|---|
| Steps | History survives claim. |
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
