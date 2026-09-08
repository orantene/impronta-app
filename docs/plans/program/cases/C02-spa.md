# C02 — Spa

Cluster: appointment  
Representative full browser journey: no — delta over shared engine

## Existing working path

Have: appointments, packages, restricted preferences.

## Missing business behavior

Missing: two therapists plus one room; couples package as a set.

## Tasks required

P6-01, P6-02, P7-06

## Completion

- **Basic:** Books a single therapist.
- **Complete:** Couples massage reserves two therapists and one room together.

Overall status: implementing — C02-CUS last-resource refusal proven (Massage takes Therapist B; Couples set refuses). Successful couples book, OP assign, TAL, DIFF-as-couples-first, and REC compensation not run. Case not verified.

## Scenarios

### C02-CUS — Customer journey

| Field | Value |
|---|---|
| Environment | Fixture tenant for cluster `appointment` |
| Role | Customer / guest |
| Fixture | Minimum catalog, people, spaces, sessions for this case |
| Steps | Customer books a treatment. Through the real website or profile. Refresh and reopen. |
| Expected visible | Journey completes without a dead end. |
| Expected persisted | Matching order/booking/inquiry rows; money and capacity consistent. |
| Negative / recovery | One therapist unavailable — whole set refuses. |
| Automated or manual | Playwright last-resource on qa-journeys |
| Evidence | `qa-evidence/C02-CUS/last-resource.md` |
| Blocks completion | Unauthorized access, duplicate charge/booking, oversell, broken core journey |
| Severity if failed | blocking or high-risk when money/capacity; else normal |
| Disposition | implementing — last-resource refusal proven; successful couples book not run |

### C02-OP — Operator journey

| Field | Value |
|---|---|
| Environment | Same fixture, staff or owner |
| Role | Operator |
| Steps | Operator assigns therapist and room. Workspace or POS. Sign out/in. Reopen the record. |
| Expected visible | Sales/Calendar/Payments show the same record. |
| Expected persisted | Same ids after refresh. |
| Negative / recovery | Unauthorized discount/refund/cash refused server-side. |
| Automated or manual | Playwright operator project (desktop or tablet POS) |
| Evidence | `qa-evidence/C02-OP/` |
| Blocks completion | Broken operator loop, silent overwrite, permission bypass |
| Disposition | not started |

### C02-TAL — Talent workflow

| Field | Value |
|---|---|
| Applies | only if a professional is assigned |
| Steps | Assignment reaches the correct professional. Private customer information stays isolated. |
| Expected persisted | Roster assignment ≠ staff access. |
| Disposition | not applicable until assignment exists |

### C02-DIFF — Difficult combination

| Field | Value |
|---|---|
| Steps | Couples set is atomic. |
| Expected persisted | All committed resources held together; competing request cannot take any. |
| Blocks completion | Partial reserve, leaked hold, oversell |
| Disposition | not started |

### C02-REC — Recovery

| Field | Value |
|---|---|
| Steps | One therapist unavailable — whole set refuses. |
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
