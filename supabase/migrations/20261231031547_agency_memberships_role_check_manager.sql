-- agency_memberships.role: the CHECK must name the roles the code grants.
--
-- THE DEFECT. `lib/access/roles.ts`, `lib/saas/tenant.ts` and every grant
-- path (`team-management.ts` VALID_ROLES, the People surface's role select)
-- name the third role `manager`. The CHECK constraint built from this
-- repository's migrations still names it `coordinator`: the rename landed in
-- code and on the production database by hand, and no migration ever
-- recorded it. On any database built from these migrations, choosing
-- "Manager" for a person fails with 23514 and the screen can only say "That
-- did not save." Proven on the qa-journeys branch (fxlankepwnvelxjrahwk)
-- from the People surface's role control.
--
-- WHAT THIS DOES. Idempotent, and a no-op where production already stands:
--   1. any legacy `coordinator` row becomes `manager`, the role the code
--      knows by that rank;
--   2. the CHECK is swapped for the list production already enforces
--      (`20260625120000_saas_p56_m0_membership_role_check.sql` extended the
--      list the same way, by drop + add, for the same reason: it is TEXT
--      with a CHECK, not an enum).
--
-- Rollback is the inverse swap; nothing here is destructive.

BEGIN;

UPDATE public.agency_memberships
   SET role = 'manager'
 WHERE role = 'coordinator';

ALTER TABLE public.agency_memberships
  DROP CONSTRAINT IF EXISTS agency_memberships_role_check;

ALTER TABLE public.agency_memberships
  ADD CONSTRAINT agency_memberships_role_check
  CHECK (role = ANY (ARRAY[
    'owner'::text,
    'admin'::text,
    'manager'::text,
    'editor'::text,
    'viewer'::text,
    'hub_moderator'::text,
    'platform_reviewer'::text
  ]));

COMMIT;
