# Rows written on the isolated database for the live frames, and deleted after

Tenant `33333333-3333-4333-8333-333333333333` (qa-journeys), 2026-09-11.

| Frame | Row | Id | Deleted |
|---|---|---|---|
| W47 milestones | `booking_deliverables` (Final edits, amount 50000, on booking `3f4aef11-6cd1-40f4-b4ce-1648158c8001`) | `0cb31195-c945-47c9-91b7-9ef3a90e4071` | yes |
| W47 upload | `inquiry_attachments` + storage object `inquiry-files/…/6c347193-…-final-edits-brief.txt` | `a9ad6d24-c6b3-473e-9409-9616ea15d125` | yes (row and object) |
| W03 price phases | `offering_price_phases` (Early bird, $15, on House pizza) | `9895e9c1-aaa5-4935-9f12-8baed300a771` | yes |
| PackageEditor | `talent_offerings` (Birthday party, package, $42) + 2 `offering_components` | `7a7c3595-8773-410f-b4b7-c9372523fe31`; `e0f1af70-…`, `6823e8e5-…` | yes |
| W24 / W56 | none written (the cells were not blurred with a value) | | |
| A07 / A10 | none written (Cancel opened, not confirmed); the token was minted with a throwaway `GUEST_COOKIE_SECRET` exported to the dev server only | booking `92f0154a-36ed-4733-be02-30e1178a1365` (Massage, later `7e84e519-…` Gel manicure on the retake) | |

Final sweep: `booking_policy_overrides` 0 rows, `role_limits` 0 rows for the tenant.
