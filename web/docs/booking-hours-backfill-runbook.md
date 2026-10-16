# Booking hours backfill (TUL-634 / TUL-637)

**Why:** onboarding used to skip the booking-hours write when no time zone was known (`essentials:hours:no_timezone`), so some sites had no slots. TUL-634 fixes new sign-ups (country time zone fallback for CO, AR, ES, CH, GB, MX, plus a dashboard nudge "Set your time zone to take bookings" on Today). TUL-637 repairs rows written before that.

**Script:** `supabase/manual_tul637_backfill_booking_hours.sql`. It is not a migration (no `db:push`). The owner runs it in the Supabase SQL Editor on production.

**Prod snapshot 2026-10-13 (read-only):** 10 published sites and 30 draft sites have no hours row. The 10 published are seeded demo-style profiles (TAL-93004 to 93008, TAL-93109 to 93114), so they stay off the allow-list by default. 1 workspace (`qa-fresh-studio-2`) has appointments on with a UTC zone while its provider hours are `America/Cancun`; repair A fixes it. `TAL-93947` and `qa-fresh-20261004-*` are draft QA sites with no hours (expected before publishing).

**Steps:** run STEP 1 (read-only) and read it. Fill the allow-list in STEP 2 only for talents who should be bookable. Run STEP 2 (it ends in `ROLLBACK`), read the output, change `ROLLBACK` to `COMMIT`, run again. Verify with STEP 3, then `cd web && npm run deploy:smoke`.

**Never:** list `TAL-93938` (the script aborts), run it on a non-production database by mistake, or add real people to the allow-list without their consent to take bookings.
