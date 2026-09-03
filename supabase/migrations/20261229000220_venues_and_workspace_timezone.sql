-- Spaces & Seating S1a — the venue, and a workspace that knows what time it is.
--
-- WHY THIS EXISTS
-- Until now the platform has had no idea where or when a workspace is. There is
-- no venue entity of any kind, and `agencies` carries neither an address nor a
-- timezone. Every time-of-day decision therefore starts from one of two places:
-- `settings->'appointments'->>'timezone'` (a per-feature setting doing a
-- workspace's job) or the literal string 'UTC'. The day-of reminder cron runs
-- `0 8 * * *` in UTC for everybody on earth.
--
-- A venue is the physical thing a business operates out of: an address, a
-- timezone, opening hours. It is the root of the spaces tree that rooms,
-- tables, seats and layouts hang off in later slices, and it is the answer to
-- "what time is 8am for this workspace" today. Four other areas (Appointments,
-- Reservations, Events, Menu) read it, which is why it ships first and alone.
--
-- WHY THE TIMEZONE IS ON BOTH `agencies` AND `venues`
-- Not duplication. `agencies.timezone` is the workspace default a new venue
-- inherits and the answer when a workspace has no venue in play. `venues.timezone`
-- is the operational truth for anything happening AT a place, and a workspace
-- with two venues in two zones is in the Riviera Maya plan. The read order is
-- venue, then workspace, then the legacy appointments setting, then UTC, and it
-- lives in exactly one function: resolveTenantTimezone() in lib/spaces/venues.ts.
-- A second read path is a bug.
--
-- WHY NOT A CHECK CONSTRAINT ON THE ZONE
-- A valid IANA zone is a row in pg_timezone_names, and a CHECK cannot run a
-- subquery. Validation is isValidIanaTimeZone() at every write, and the read
-- ladder skips anything that does not parse rather than trusting the column.
--
-- NAMING
-- Not `locations` (a city gazetteer already owns that name). Not `sites`
-- (the website builder owns that word).
--
-- Rollback: DROP TABLE public.venues; ALTER TABLE public.agencies DROP COLUMN timezone.
-- Nothing else references either yet.

BEGIN;

-- ─── 1. the workspace default ───────────────────────────────────────────────

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.agencies.timezone IS
  'IANA zone: the workspace default a venue inherits, and the fallback when no venue is in play. Read through resolveTenantTimezone(), never directly.';

-- ─── 2. venues ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.venues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  name             TEXT NOT NULL,
  slug             TEXT,

  -- Address, kept as discrete fields rather than one blob: a map link, a
  -- receipt, a schema.org LocalBusiness block and a Places lookup each want a
  -- different subset, and none of them can take a formatted string apart again.
  address_line1    TEXT,
  address_line2    TEXT,
  city             TEXT,
  region           TEXT,
  postal_code      TEXT,
  country_code     TEXT,
  google_place_id  TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,

  timezone         TEXT NOT NULL DEFAULT 'UTC',

  -- Opening hours and closed days: when the BUILDING is open. Service windows
  -- (dinner 19:00 to 23:00, 90 minute turns) are a reservation policy and are
  -- NOT stored here; they belong to the Reservations area and point at a venue.
  hours            JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_default       BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'closed')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.venues IS
  'Spaces & Seating S1: a physical place a workspace operates from. Root of the spaces tree; source of operational timezone. One default per tenant.';

-- Exactly one default per tenant, enforced by the database rather than by the
-- code that happens to write it. A partial unique index, so non-default venues
-- are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_one_default_per_tenant
  ON public.venues (tenant_id) WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_venues_tenant ON public.venues (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_slug_per_tenant
  ON public.venues (tenant_id, lower(slug)) WHERE slug IS NOT NULL;

-- ─── 3. updated_at ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.venues_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venues_touch_updated_at ON public.venues;
CREATE TRIGGER trg_venues_touch_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_touch_updated_at();

-- ─── 4. backfill ────────────────────────────────────────────────────────────
-- Every existing workspace gets its timezone lifted out of the appointments
-- setting (where a few of them already recorded it) and one default venue.
-- A workspace with no venue would make every later slice conditional on
-- "does a venue exist", which is the kind of branch that rots.
--
-- pg_timezone_names is the only honest validator available in SQL, and it is
-- the same list Intl.DateTimeFormat accepts.

UPDATE public.agencies a
   SET timezone = s.tz
  FROM (
    SELECT id, settings->'appointments'->>'timezone' AS tz
      FROM public.agencies
     WHERE settings->'appointments'->>'timezone' IS NOT NULL
  ) s
 WHERE a.id = s.id
   AND s.tz IN (SELECT name FROM pg_timezone_names);

INSERT INTO public.venues (tenant_id, name, timezone, is_default)
SELECT a.id,
       COALESCE(NULLIF(btrim(a.display_name), ''), 'Main venue'),
       a.timezone,
       true
  FROM public.agencies a
 WHERE NOT EXISTS (
         SELECT 1 FROM public.venues v WHERE v.tenant_id = a.id AND v.is_default
       );

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────
-- Staff read their own workspace's venues. Every write goes through the server
-- with the service role, as with the rest of the operational schema. There is
-- deliberately no anon policy: a public site renders its venue through a
-- server component that already has the row, not by querying it from a browser.

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venues_select_staff ON public.venues;
CREATE POLICY venues_select_staff ON public.venues
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON TABLE public.venues TO authenticated;
GRANT ALL    ON TABLE public.venues TO service_role;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and PUBLIC is a separate grant from
-- any role grant: REVOKE ... FROM anon alone leaves it reachable. FROM PUBLIC is
-- the operative statement. (Recorded incident: revoke-from-anon is a no-op.)
REVOKE ALL ON FUNCTION public.venues_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
