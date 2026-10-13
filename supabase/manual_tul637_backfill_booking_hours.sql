-- TUL-637 — backfill booking hours for sites created before #2563 / #3265
--
-- NOT a migration. Do not `db:push`. Run by the owner (or Grok with the owner's
-- yes) in the Supabase SQL Editor on PRODUCTION (project pluhdapdnuiulvxmyspd).
-- Idempotent: running it twice changes nothing the second time.
--
-- What went wrong: onboarding used to skip the booking-hours write when it knew
-- no time zone (warning essentials:hours:no_timezone), and some workspaces had
-- the appointments flag switched on by hand with the UTC platform default.
-- The code is fixed going forward (TUL-634); this repairs rows already written.
--
-- Two repairs, each touching only rows that match its criteria:
--   A. Workspace time zone: agencies.settings.appointments.enabled is true but
--      its timezone is null / UTC, while the workspace's hours rows agree on
--      exactly one real zone. Copies that zone. (Prod 2026-10-13: 1 row,
--      qa-fresh-studio-2: workspace UTC, provider hours America/Cancun.)
--   B. Missing hours row: ONLY for the talents the owner lists in the
--      allow-list below. Creates the standard Mon-Sat 9-19 row (the same
--      defaults onboarding writes) in the zone the owner chose. The list is
--      EMPTY on purpose: this never creates bookable slots for a real person
--      by itself. Never lists TAL-93938 (Jorgelina, real site): hard-blocked.
--
-- HOW TO RUN
--   1. Run STEP 1 (read-only) and read the three result sets.
--   2. For repair B, fill the allow-list in STEP 2 (profile code, IANA zone).
--   3. Run STEP 2 as written (it ends in ROLLBACK, so it only shows what it
--      WOULD do: read the RETURNING rows and the verification counts).
--   4. If right, change the final ROLLBACK to COMMIT and run STEP 2 again.
--   5. Verify (STEP 3), then run `cd web && npm run deploy:smoke`.

-- ============================================================================
-- STEP 1 — DRY RUN (read-only)
-- ============================================================================

-- 1a. Repair A candidates: workspace zone to copy from the provider hours.
SELECT a.slug,
       a.settings #>> '{appointments,timezone}'        AS workspace_tz_now,
       min(h.timezone)                                   AS hours_tz_to_copy,
       count(*)                                          AS hours_rows
FROM public.agencies a
JOIN public.talent_booking_hours h ON h.tenant_id = a.id
WHERE a.settings #>> '{appointments,enabled}' = 'true'
  AND coalesce(nullif(a.settings #>> '{appointments,timezone}', ''), 'UTC') = 'UTC'
GROUP BY a.id, a.slug, a.settings
HAVING count(DISTINCT h.timezone) = 1 AND min(h.timezone) <> 'UTC';

-- 1b. Repair B universe: published sites with no hours row (review, do not act).
--     Prod 2026-10-13: 10 rows, all seeded profiles TAL-93004..93008 and
--     TAL-93109..93114 (created 2026-09-28/29). They are demo-style personas:
--     leave them off the allow-list unless the owner decides otherwise.
SELECT tp.profile_code, ts.site_slug, ts.status, ts.accepting_bookings,
       (tp.home_city_text IS NOT NULL AND tp.home_city_text <> '') AS has_city,
       (SELECT count(*) FROM public.agency_talent_roster r
         WHERE r.talent_profile_id = tp.id AND r.status IN ('active','pending')) AS roster_rows
FROM public.talent_profiles tp
JOIN public.talent_sites ts ON ts.talent_profile_id = tp.id
LEFT JOIN public.talent_booking_hours h ON h.talent_profile_id = tp.id
WHERE tp.deleted_at IS NULL AND h.talent_profile_id IS NULL AND ts.status = 'published'
ORDER BY tp.profile_code;

-- 1c. Counts by state (draft sites with no hours are expected pre-publish).
SELECT ts.status, (h.talent_profile_id IS NOT NULL) AS has_hours, count(*)
FROM public.talent_profiles tp
JOIN public.talent_sites ts ON ts.talent_profile_id = tp.id
LEFT JOIN public.talent_booking_hours h ON h.talent_profile_id = tp.id
WHERE tp.deleted_at IS NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- ============================================================================
-- STEP 2 — APPLY (inside a transaction; ends in ROLLBACK until you edit it)
-- ============================================================================
BEGIN;

-- Allow-list for repair B. Add rows like ('TAL-12345', 'America/Bogota').
-- Leave empty to run repair A only.
CREATE TEMP TABLE _tul637_allow (profile_code text PRIMARY KEY, timezone text NOT NULL) ON COMMIT DROP;
-- INSERT INTO _tul637_allow VALUES ('TAL-00000', 'America/Mexico_City');

-- Guards: unknown zone names and the real Jorgelina site abort the run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _tul637_allow a
             WHERE NOT EXISTS (SELECT 1 FROM pg_timezone_names n WHERE n.name = a.timezone)) THEN
    RAISE EXCEPTION 'TUL-637: allow-list has a time zone that is not an IANA name';
  END IF;
  IF EXISTS (SELECT 1 FROM _tul637_allow WHERE profile_code = 'TAL-93938') THEN
    RAISE EXCEPTION 'TUL-637: TAL-93938 is a real site and must never be listed';
  END IF;
END $$;

-- Repair A: copy the one agreed provider zone into the workspace appointments setting.
WITH target AS (
  SELECT a.id, min(h.timezone) AS tz
  FROM public.agencies a
  JOIN public.talent_booking_hours h ON h.tenant_id = a.id
  WHERE a.settings #>> '{appointments,enabled}' = 'true'
    AND jsonb_typeof(a.settings -> 'appointments') = 'object'
    AND coalesce(nullif(a.settings #>> '{appointments,timezone}', ''), 'UTC') = 'UTC'
  GROUP BY a.id
  HAVING count(DISTINCT h.timezone) = 1 AND min(h.timezone) <> 'UTC'
)
UPDATE public.agencies a
SET settings = jsonb_set(a.settings, '{appointments,timezone}', to_jsonb(t.tz), true)
FROM target t
WHERE a.id = t.id
RETURNING a.slug, a.settings #>> '{appointments,timezone}' AS workspace_tz_after;

-- Repair B: Mon-Sat 9-19 hours for allow-listed talents that have no row.
-- Workspace = creator agency, else the single active/pending roster tenant
-- (ambiguous or missing workspace: skipped, never guessed).
WITH todo AS (
  SELECT tp.id AS talent_profile_id, al.timezone,
         coalesce(
           tp.created_by_agency_id,
           (SELECT CASE WHEN count(DISTINCT r.tenant_id) = 1 THEN min(r.tenant_id::text)::uuid END
              FROM public.agency_talent_roster r
             WHERE r.talent_profile_id = tp.id AND r.status IN ('active','pending'))
         ) AS tenant_id
  FROM _tul637_allow al
  JOIN public.talent_profiles tp ON tp.profile_code = al.profile_code AND tp.deleted_at IS NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.talent_booking_hours h WHERE h.talent_profile_id = tp.id)
)
INSERT INTO public.talent_booking_hours
  (talent_profile_id, tenant_id, timezone, weekly, exceptions,
   slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days, updated_at)
SELECT talent_profile_id, tenant_id, timezone,
       '{"0":[],"1":[{"startMin":540,"endMin":1140}],"2":[{"startMin":540,"endMin":1140}],"3":[{"startMin":540,"endMin":1140}],"4":[{"startMin":540,"endMin":1140}],"5":[{"startMin":540,"endMin":1140}],"6":[{"startMin":540,"endMin":1140}]}'::jsonb,
       '[]'::jsonb, 30, 0, 0, 60, 60, now()
FROM todo
WHERE tenant_id IS NOT NULL
ON CONFLICT (talent_profile_id) DO NOTHING
RETURNING talent_profile_id, tenant_id, timezone;

-- Verification inside the transaction: allow-listed talents still without a row
-- (expect only ones skipped for a missing/ambiguous workspace).
SELECT al.profile_code
FROM _tul637_allow al
JOIN public.talent_profiles tp ON tp.profile_code = al.profile_code
WHERE NOT EXISTS (SELECT 1 FROM public.talent_booking_hours h WHERE h.talent_profile_id = tp.id);

ROLLBACK;  -- change to COMMIT once the output above is what you expect

-- ============================================================================
-- STEP 3 — VERIFY after COMMIT (read-only)
-- ============================================================================
-- Re-run STEP 1a: it must return no rows. Re-run 1b: only talents the owner
-- chose to leave without hours remain. Then, for a repaired talent, open the
-- public booking page and confirm slots appear in the expected local time.
