# Product journey coverage matrix

Columns: staff entry → configuration → availability/eligibility → price review → shared payment state → issued record → fulfilment → later lookup/change → customer screen → talent screen → tests. Cells name a v3.2 screen code, an existing module (path), or a task ID from `execution-plan.md`. "shared M" = the shared payment states M01–M12 with the product as context (amount, record and return named in the product screen).

Distinctions applied throughout: new sale ≠ collecting a balance; buyer ≠ attendee/participant/beneficiary; payment ≠ booking confirmation ≠ attendance/fulfilment; buying a benefit ≠ redeeming it; linking records ≠ merging ownership or balances.

| Product / variation | Staff entry | Configure | Availability / eligibility | Price review | Payment (shared) | Issued record | Fulfilment | Lookup / change | Customer | Talent | Tests (scenario IDs) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Counter item (retail/food) | C03 register; C23 scan | C04/C05 options, C12 line | stock on tile; C18 sold-out-on-charge | C03 totals, C13 discount | M01–M03 cash; M05–M08 card → `lib/pos/collection.ts` (PR) | order `orders`/`order_lines` (`lib/orders/complete-order.ts`) | T26 prep; C25 pickup handoff | M14–M15 receipts; M16 refund | D01–D08 display; C24 toast | — | P01–P12, P39–P48, C06-OP |
| Held / resumed sale | C16 hold; C01 resume | — | C17 expired hold | — | — | draft `orders` (PR `lib/pos/draft.ts`) | — | C21 Orders | — | — | P06, P08 |
| Website pickup order | C21 Orders → C25 | (web) | — | paid online | none (paid) | existing order | C25, C26 handoff | M14 | Q03-style tracking (web) | — | P36, P46–P47, C26-OP |
| Guest table QR order | T21 accept | Q02 options | Q02 stock | Q05 bill; Q06 share | Q05/Q06 pay at table (task POS-4.7) or T09 → shared M | lines on the visit check (PR `visits`) | T26 | T09 | Q01–Q05 | — | P37, S54, W14, R29, C06-CUS |
| Appointment · new booking | A01 (from Customers/POS); B04 walk-in | A01 services+extras; A02 people/place | A03 times with reasons; `lib/scheduling/public-slots.ts`; `reserve_resource_set` (PR) | A05 total/deposit/policy | A05 deposit → shared M | `agency_bookings` + `talent_holds`; A06 | B01 completion; B02 extras | B01, M14; A09 reschedule; A10 cancel | A07 | A08 | A01–A24, C01-CUS/OP, C05, C02 |
| Appointment · collect balance | B01 → Collect | B02 add extra (time re-checked) | B02 | B01 summary | shared M (context: booking balance) | one receivable (`booking-shell.ts` PR) | B01 done | M15 receipt; M16 refund | A07 | A08 | P25, A47–A48 |
| Mobile / field service | F01 jobs; A01 (quote branch) | A02 address/travel; F02 | travel buffers (task POS-5.9); F09 | F04 extra acceptance | F05 collect or recorded balance → shared M | booking + travel block; F07 occurrences | F03 work; F05 | F06 problems | A07 | F01–F08 | A19–A20, C03, C30–C33, C41, C43, C46 |
| Class drop-in | C19 session picker; K01 | K01 participants, equipment | session capacity `sessions` pool; K02 waitlist | K01 | shared M | registration (`sessions` + admission) | B05 check-in | B05/B06; K05 cancel | K04 (pass) / A07-style | A08 | A25–A31, A37–A43, C09 |
| Pass purchase | K03 | beneficiary | — | K03 | shared M | credit entitlement (task POS-5.2: no schema today) | — | K04 wallet; K07 offer | K04 | — | C13–C16, C39 (`drawdown_lesson_package` PR) |
| Pass redemption | C20 at sale; B05 check-in | — | eligibility/credits K04 | C20 new total | none / partial | credit reserved → consumed on attendance | B05 | K05 restore | K04 | — | A32–A36, C29 |
| Course / series | K06 | dates all required | all dates available | course price | shared M | enrollments ×4 | B05 per date | K06 | K04 | A08 | A29, A58 |
| Membership | P04 | billing schedule | — | P04 | shared M (first period) | agreement (task POS-5.3: no schema) | eligibility at booking | P09 pause/cancel/renewal failed | K04 | — | A34–A35, C16 |
| Reservation · new | R01 | party/time/prefs/deposit | R01 panel; R02 alternatives; `lib/reservations/availability.ts` | R01 | R01 deposit → shared M | reservation + allocation; R03 | T05 seat → T09 → T23/T24 | T05–T24; R05 amend | R04 | — | S13–S49, C06 |
| Space / court / equipment unit | S01 availability; S02 | S02 duration, combinations, accessibility | S01 buffers, blocks; S05 | S02 price components | S02 → shared M | allocation; S03 | S04 arrive/start/extend/move/release; S05 reset | S03, S04 | (task: portal view) | — | S13–S26, S37–S39, N26 |
| Rental / custody | S06 | condition, due-back | — | fee + refundable deposit (hold) | shared M + provider hold | custody record | S06 return, deduction/release | S06 | (task) | — | new rows (POS-10.3) |
| Multi-seller basket | C03 | — | — | M32 | sequential checkouts | two orders | — | — | — | — | C04 (catalog), P21 |
| Minimum spend / prepaid menu | R01 | booth terms | — | T25/T26 | shared M | reservation with terms | T25/T26 at close | — | R04 | — | S45, C11 |
| Event ticket · presale | E01 → E02 | E02 types/qty; E03 seats; E04 attendees; E14 multi-day | phase, window, limit, pool, hold E05 | E04 total | shared M (context: event, tickets) | admissions (`lib/events/mint-on-paid.ts`); E06 / E07; E15 delivery | G01–G07 gate | E09 lookup; E10–E11 change (dependents re-validated); E13 name; M16 refund | E08 ticket; E13 | — | X01–X84 subset, C12-CUS/OP/DIFF |
| Event ticket · door tonight | G06 box office | G06 | tonight’s pool (shared) | G06 | shared M | admissions | G02 admit | E09 | E08 | — | P28–P30, C12-DIFF |
| Table package (event) | E03 | table + 4 entries + meals | T-pool + admission pool | E03 | shared M | allocation + admissions | G02 admit; T21/T09 benefit redemption (task POS-6.5) | M16 component refund | E08 | — | X-table rows, S50, P31–P32 |
| Comp admission | E12 | reason, allocation | sponsor allocation | $0 comp | none | admission (comp) | G02 | E09 | E08 | — | X comp rows |
| Hybrid package | P01 | required/optional, beneficiary | each component; P02 | P01 allocation | shared M | package + child records P03 | per component | P06 refund | portal (task) | — | C09–C12 (catalog), C24 |
| Gift card | P05 | recipient | — | P05 | shared M | stored value (task POS-5.4: no schema) | P07 redeem at Collect; P08 exhausted | — | — | — | new scenarios (POS-5.4) |
| Agency milestone | O01 due → collect | O06 amendment | accepted version | O01 | shared M (client work) | collection allocated to milestone (`inquiry_offers` on main) | O03 project | O02 links; O06 | O05 | O04 | C17–C20, C08 |
| Refund (any) | M14/M15 → M16 | components + policy | — | M16 effects | provider `lib/payments/refunds.ts`, `refund-execute-lines.ts` | refund record; M17–M19 | access/benefit effects | M14 | notice | — | P49–P52, C23–C24, X62–X66 |
| Cash drawer | M21 open | M22 movements/handover | — | — | — | `pos_shifts` (PR) | M23 close | — | — | — | P54–P56 |
| Issues / recovery | M24 | M25 detail | — | — | M06/M12/M26 | — | — | — | — | — | P14, P16, P18, P60–P64 |

POS-inapplicable scenarios (destination elsewhere): see `tracker.md` §2 for the per-family split (POS-applicable vs workspace/website/portal). They stay in the 404 register with those destinations.
