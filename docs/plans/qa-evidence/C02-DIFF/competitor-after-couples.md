# C02-DIFF — couples set booked, competing Massage cannot take that window

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T20:50Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C02-spa.spec.ts -g "C02-DIFF" --project=chromium`

## Result

Guest A on `/book` selected Couples massage and the **last** listed slot (Sun Sep 20, 6:15 PM Mexico City = 23:15–00:00 UTC) so leftover first-slot Massage / second-slot Couples holds from C02-CUS do not collide. Confirm → `$0` `in_person` → paid instant book. Therapist A, Therapist B, and Room A held together on that window.

Guest B selected Massage. The same wall-clock slot was **absent** from the Massage picker (Therapist B is already held). No Massage customer, order, or hold was written. Live hold counts on that start stayed 1 / 1. The couples set ids were unchanged. Staff Sales listed `instant_book` and did not mark it overdue.

This is the inverse of last-resource (Massage-then-Couples-refuses). Last-resource still showed the Couples slot (Therapist A free) and refused on confirm. Here the competitor never reached confirm because the taken therapist is Massage’s primary.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 13.6s |
| Guest A customer | `f08a74f3-0760-49c0-808f-caceb633a3e8` |
| Guest A order | `392a6091-b052-4cd8-b0c2-4425abd1caf6` — paid / 0 / `instant_book` |
| Guest A line | Couples massage `5da8a724-0370-4d97-b85a-657a1ef5ee00` |
| Therapist A hold | `314b4196-200a-4170-9e5e-f3e8c65e25f3` — Couples massage, 23:15–00:00 UTC |
| Therapist B hold | `8f6f45f2-02d8-4b58-a5f4-ace0509383c5` — Couples therapist, same window |
| Room A allocation | `cab372fa-ebf7-4623-8472-a8c23c12a138` — 1 unit, state `hold`, pool `33330020-…0003` |
| Guest B customer / order / hold | none — slot not offered |
| booking_transactions | none — zero-total, no fabricated charge |
| agency_bookings | none for this order — holds + allocation are the set |

Holds carry a ~15 minute `expires_at` (900s TTL), same as other instant-book proofs on this fixture. Counts were asserted while live.

## Not claimed

Not C02-OP assign (Calendar “New booking” logs a job; it does not pick therapist + room). Not C02-TAL. Not C02-REC compensation. Not a confirm-time refusal for Massage (the picker hid the slot). Not C02 complete. Case count stays **0 / 48**.
