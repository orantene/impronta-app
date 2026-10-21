-- TUL-1463: a client saves a SERVICE (heart on a service quick view / service page),
-- the service twin of client_favorites (which is talent-only: talent_profile_id is NOT NULL
-- and part of its primary key, so it cannot hold a service without a contract change to
-- every favourites reader).
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge.
-- New table only, no existing table touched, no backfill. The app fails closed until it
-- exists: a read returns an empty Saved list, a save returns "unavailable" (42P01 is caught).
--
-- Access: service-role only from the app (the server authorizes first: client_user_id is the
-- session user, the service must be visible on THIS site's tenant). RLS is on and mirrors
-- client_favorites (a client sees and changes only their own rows) so a future direct read
-- through the client's session cannot reach another client's saves. anon has no grants.
--
-- Rollback (only if empty): DROP TABLE public.client_favorite_services;

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_favorite_services (
  client_user_id UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  offering_id    UUID        NOT NULL REFERENCES public.talent_offerings (id) ON DELETE CASCADE,
  -- The tenant whose site the service was saved on (from the offering row, never the request).
  tenant_id      UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_user_id, offering_id)
);

CREATE INDEX IF NOT EXISTS idx_client_favorite_services_user_tenant
  ON public.client_favorite_services (client_user_id, tenant_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_favorite_services_offering
  ON public.client_favorite_services (offering_id);

COMMENT ON TABLE public.client_favorite_services IS
  'TUL-1463: per-client saved services (heart). Service twin of client_favorites (talent). One row per (client, service).';

ALTER TABLE public.client_favorite_services ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_favorite_services FROM anon;

DROP POLICY IF EXISTS client_favorite_services_own_read ON public.client_favorite_services;
CREATE POLICY client_favorite_services_own_read
  ON public.client_favorite_services FOR SELECT TO authenticated
  USING (client_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS client_favorite_services_own_insert ON public.client_favorite_services;
CREATE POLICY client_favorite_services_own_insert
  ON public.client_favorite_services FOR INSERT TO authenticated
  WITH CHECK (client_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS client_favorite_services_own_delete ON public.client_favorite_services;
CREATE POLICY client_favorite_services_own_delete
  ON public.client_favorite_services FOR DELETE TO authenticated
  USING (client_user_id = (SELECT auth.uid()));

COMMIT;
