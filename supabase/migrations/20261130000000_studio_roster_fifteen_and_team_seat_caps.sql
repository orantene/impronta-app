-- Seat caps — Studio roster 15 (grandfathered), Agency unlimited, and the
-- first real team-seat ladder.
--
-- The 2026 product lineup ratifies:
--   roster (talent) seats: free=5, studio=15, agency=UNLIMITED, network=UNLIMITED
--   team seats:            free=2, studio=3,  agency=UNLIMITED, network=UNLIMITED
--
-- Studio moves DOWN (50 → 15), which is commercially sensitive: no existing
-- customer may be stranded below their current usage. The UPDATE below
-- grandfathers every live Studio tenant to GREATEST(15, current roster
-- count), so a Studio workspace already carrying 22 talent keeps a cap of
-- 22 and simply cannot add a 23rd until they upgrade.
--
-- `agency_talent_roster.status` is CHECK-constrained to
-- ('pending','active','inactive','removed','archived_for_downgrade');
-- everything except 'removed' occupies a seat, which is exactly the
-- predicate `checkRosterSeatAvailability` uses (`.neq("status","removed")`).
--
-- Keep in step with `web/src/lib/saas/plan-seat-caps.ts`,
-- `web/src/lib/access/plan-limits.ts` and the column comment below —
-- `plan-seat-caps.test.ts` fails if they drift.

BEGIN;

-- ─── Roster seats ───────────────────────────────────────────────────────

-- Studio: 15, never below what the tenant already uses.
UPDATE public.agencies a
   SET talent_seat_limit = GREATEST(15, (
         SELECT count(*)
           FROM public.agency_talent_roster r
          WHERE r.tenant_id = a.id
            AND r.status <> 'removed'))
 WHERE a.plan_tier = 'studio';

-- Agency: unlimited (was a hard 200). Widening only — nobody is stranded.
UPDATE public.agencies
   SET talent_seat_limit = NULL
 WHERE plan_tier = 'agency';

-- ORDERING (deliberate): this file is dated 202611xx, NOT a real-clock stamp.
-- Repo migrations are FUTURE-dated, so `date -u +%Y%m%d%H%M%S` sorts EARLY —
-- earlier than 20260907140000_plan_tier_archive.sql, which CREATES
-- plan_tier_caps and re-seeds it. At a real-clock timestamp the UPDATEs below
-- would hit a table that does not exist yet on a fresh replay, and the later
-- seed would overwrite these numbers anyway. Keep this file sorting LAST.

COMMENT ON COLUMN public.agencies.talent_seat_limit IS
  'Talent roster cap for this tenant. NULL = unlimited (Agency, Network). Current defaults: free=5, studio=15, agency=NULL, network=NULL. Studio tenants grandfathered above 15 by 20261130000000_studio_roster_fifteen_and_team_seat_caps.sql keep their higher number.';

-- ─── Display/reference caps ─────────────────────────────────────────────
--
-- plan_tier_caps is a documented reference table (INT NOT NULL), so
-- "unlimited" is spelled 9999 there, matching the existing network row.
-- Only free/studio/agency are touched: the `website` tier is owned by a
-- different change and must not be disturbed here.

UPDATE public.plan_tier_caps
   SET team_seats = 2
 WHERE plan_tier = 'free';

UPDATE public.plan_tier_caps
   SET talent_seats = 15,
       team_seats = 3
 WHERE plan_tier = 'studio';

UPDATE public.plan_tier_caps
   SET talent_seats = 9999,
       team_seats = 9999
 WHERE plan_tier = 'agency';

COMMIT;
