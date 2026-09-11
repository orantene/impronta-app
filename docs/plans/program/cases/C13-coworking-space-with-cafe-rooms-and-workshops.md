# C13 — Coworking space with cafe, rooms and workshops [R]

Cluster: hybrid  
Representative full browser journey: yes

## Existing working path

Have: reservations, spaces, sessions, catalog.

## Missing business behavior

Missing: three capabilities in one workspace with separate availability.

## Tasks required

P2-02, P8-01, P5-01, P6-02

## Completion

- **Basic:** Books a meeting room.
- **Complete:** Cafe sale, room booking and workshop coexist without sharing capacity wrongly.

Overall status: not started — engine: hybrid combinations keep cafe / room / workshop pools distinct. Browser journey not run.

## Scenarios

### C13-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `hybrid` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a room. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | Hidden module is not reachable by URL. |
| Automated or manual | Playwright when fixture exists; until then not started |
| Evidence | `qa-evidence/C13-CUS/` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | not started |

### C13-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator sells a coffee. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C13-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C13-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C13-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Workshop place does not consume a room booking. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C13-REC — Recovery

| Field | Value |
|---|---|
| Steps | Hidden module is not reachable by URL. |
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
