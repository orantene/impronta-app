# C10 — Photography studio

Cluster: agency  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: offerings, packages, inquiries, deposits.

## Missing business behavior

Missing: multi-resource reserve, overtime approval, proposal versions.

## Tasks required

P6-01, P7-01, P7-04

## Completion

- **Basic:** Books a headshot.
- **Complete:** Shoot reserves photographer, assistant and studio together.

Overall status: not started — engine: reserveResourceSet photographer + assistant + studio. Browser journey not run.

## Scenarios

### C10-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `agency` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a shoot. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | One resource missing refuses the set. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C10-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C10-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator assigns crew and room. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C10-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C10-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | yes if the case has an assigned professional |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not started |

### C10-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Overtime needs explicit approval. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C10-REC — Recovery

| Field | Value |
|---|---|
| Steps | One resource missing refuses the set. |
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
