-- Reservations — the rail's door, at zero cost to the tenants who will never use it.
--
-- THE PROBLEM. The Reservations rail item must not always-show: a rail full of
-- features a workspace does not use is what WP1 was cleaning up. So it gates on
-- whether the venue actually takes bookings — `venue_service_rules.is_active`.
--
-- But the rail is built in `admin/layout.tsx`, which runs on EVERY workspace
-- page load for EVERY tenant. Dashboards refused to add a blind fetch there and
-- they were right: "it is only one query" is exactly how a hot path acquires
-- five. And the case that decides the design is NOT the restaurant. MOST
-- TENANTS ON THIS PLATFORM HAVE NO VENUE AND NEVER WILL, and a join they can
-- never match is a cost they pay on every page for a feature they do not have.
--
-- THE ANSWER IS TO ADD NO QUERY AT ALL. `loadTenantIdentity` already selects
-- the tenant's own row in the layout's existing fan-out. One more boolean on
-- that row is ZERO extra round trips, and for a tenant with no venue it is a
-- `false` they were already fetching the bytes around.
--
-- WHY A DENORMALISATION IS JUSTIFIED HERE AND NOT GENERALLY. It is a cache for
-- ONE nav item. The source of truth stays `venue_service_rules.is_active`, and
-- the trigger below keeps them in step.
--
-- CRITICAL, AND WRITTEN ON THE COLUMN SO NOBODY LEARNS IT THE HARD WAY:
-- THIS FLAG MUST NEVER GATE ACCESS. It decides whether a link is drawn, nothing
-- else. If it ever drifts from the source, the worst case must remain "a nav
-- item is missing or spurious" and never "somebody could or could not do a
-- thing". Every real check reads `venue_service_rules` directly. A cached
-- boolean used as a permission is a permission that can be stale, and the
-- failure is silent in both directions.
--
-- Rollback: drop the trigger, then the column. Nothing reads it as truth.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS takes_reservations BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.agencies.takes_reservations IS
  'Rail-nav cache: does any venue in this workspace have reservations switched on. Maintained by a trigger on venue_service_rules. DECIDES WHETHER A LINK IS DRAWN AND NOTHING ELSE — never gate access on it. Every real check reads venue_service_rules.is_active directly, because a cached boolean used as a permission is a permission that can be stale, and that failure is silent in both directions.';

-- ─── keeping it true ────────────────────────────────────────────────────────
-- Recompute rather than increment. A workspace can have several venues, so the
-- flag is "any venue is active", and a toggle on one venue cannot be applied as
-- a delta without knowing the others. Recomputing over a handful of rows is
-- cheap and stays correct if a statement touches several at once.

CREATE OR REPLACE FUNCTION public.sync_agency_takes_reservations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
  UPDATE public.agencies a
     SET takes_reservations = EXISTS (
           SELECT 1 FROM public.venue_service_rules r
            WHERE r.tenant_id = v_tenant AND r.is_active
         )
   WHERE a.id = v_tenant;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_agency_takes_reservations()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS venue_service_rules_sync_agency_flag ON public.venue_service_rules;

-- AFTER, and FOR EACH ROW: the recompute reads the table this trigger fires on,
-- so it must run once the row is visible. A BEFORE trigger would compute the
-- flag from the state the write is replacing.
CREATE TRIGGER venue_service_rules_sync_agency_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.venue_service_rules
  FOR EACH ROW EXECUTE FUNCTION public.sync_agency_takes_reservations();

-- Backfill, so the flag is true for anyone already switched on rather than only
-- from the next edit onward.
UPDATE public.agencies a
   SET takes_reservations = EXISTS (
         SELECT 1 FROM public.venue_service_rules r
          WHERE r.tenant_id = a.id AND r.is_active
       )
 WHERE a.takes_reservations IS DISTINCT FROM EXISTS (
         SELECT 1 FROM public.venue_service_rules r
          WHERE r.tenant_id = a.id AND r.is_active
       );

COMMIT;
