-- Client account P0 foundation (additive).
-- =============================================================================
-- Client Account Plan 4.7 / decisions 8 + 11.
--
--   1. client_profiles gains marketing consent + preferred locale.
--      marketing_opt_in defaults to false (opt-IN, never pre-ticked);
--      marketing_opt_in_at records when consent was last given.
--   2. client_auth_events: an append-only log of client sign-ins (host + method).
--      Writes happen with the service role only; an owner may read their own rows.
--
-- Additive only: no existing column, policy or function changes. Nothing reads
-- the new objects until the CLIENT_ACCOUNT_HOSTS flag turns the surface on.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. client_profiles columns
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.client_profiles') IS NOT NULL THEN
    ALTER TABLE public.client_profiles
      ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS marketing_opt_in_at timestamptz,
      ADD COLUMN IF NOT EXISTS preferred_locale text;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_auth_events
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  host text NOT NULL,
  method text NOT NULL CHECK (method IN ('email_code', 'google', 'password', 'sso')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_auth_events_user_created_idx
  ON public.client_auth_events (user_id, created_at DESC);

ALTER TABLE public.client_auth_events ENABLE ROW LEVEL SECURITY;

-- Owner can read their own rows. There is deliberately NO insert / update /
-- delete policy: with RLS on, that denies anon and authenticated writes; the
-- service role (which bypasses RLS) is the only writer.
DROP POLICY IF EXISTS client_auth_events_select_own ON public.client_auth_events;
CREATE POLICY client_auth_events_select_own ON public.client_auth_events
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Belt and braces: no table privileges for writes or any anon access.
REVOKE ALL ON public.client_auth_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_auth_events FROM authenticated;
GRANT SELECT ON public.client_auth_events TO authenticated;
