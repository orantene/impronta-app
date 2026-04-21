-- Marketing signups capture (public /get-started landing form).
--
-- Captures pre-onboarding leads from marketing.local/get-started. The
-- form collects audience (operator/agency/organization), contact, a
-- wanted subdomain, roster size, and best-effort UTM/referrer context.
--
-- Trust model
--   - Writes go through the server action, which uses the service-role
--     key. Anon key never touches this table — RLS is enabled with no
--     policies so only service_role (and superuser) can read/write.
--   - No PII (IP, user agent) is stored raw — IP is hashed with a
--     signup-scoped salt for coarse abuse correlation only.
--
-- What this is NOT
--   - Not an auth/user identity. Signups are a separate workflow from
--     Supabase auth accounts. A lead becomes a user when the operator
--     completes onboarding; the two are joined at that time (not here).
--   - Not a subdomain reservation. `subdomain_wanted` is a preference
--     only — the real registration happens in `agency_domains` after
--     the founder confirms and provisions the tenant.
--
-- Idempotent via IF NOT EXISTS. Additive.

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.saas_marketing_signups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact
  email             TEXT NOT NULL,
  name              TEXT NOT NULL,

  -- Segmentation (form inputs)
  audience          TEXT NOT NULL
                      CHECK (audience IN ('operator','agency','organization')),
  roster_size       TEXT NOT NULL
                      CHECK (roster_size IN ('1-5','6-20','21-50','50+')),
  tier_interest     TEXT
                      CHECK (tier_interest IS NULL
                             OR tier_interest IN ('free','agency','network')),

  -- Subdomain preference (not a reservation — see header comment)
  subdomain_wanted  TEXT
                      CHECK (subdomain_wanted IS NULL
                             OR subdomain_wanted ~ '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$'),

  -- Lifecycle
  status            TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','contacted','onboarded','archived','spam')),

  -- Attribution (best-effort; any field may be NULL)
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_term          TEXT,
  utm_content       TEXT,
  referrer          TEXT,
  source_page       TEXT,

  -- Abuse correlation — hashed, not raw
  ip_hash           TEXT,
  user_agent        TEXT,

  notes             TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.saas_marketing_signups IS
  'Marketing-funnel leads captured from the /get-started landing form. '
  'Service-role-only — anon has no policies; founders/admins read via '
  'service role (future admin UI) or SQL.';

COMMENT ON COLUMN public.saas_marketing_signups.subdomain_wanted IS
  'Sanitized subdomain preference (a-z 0-9 hyphen, 1..32 chars, must start '
  'and end with alphanumeric). NULL when the lead did not pick one. Uniqueness '
  'is only enforced against agency_domains at provisioning time.';

COMMENT ON COLUMN public.saas_marketing_signups.ip_hash IS
  'SHA-256(ip + server salt), truncated to 32 chars. Stores a stable-per-IP '
  'token for abuse correlation without retaining a reversible address.';

-- ---------------------------------------------------------------------------
-- Indexes — report-oriented only.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS saas_marketing_signups_created_at_idx
  ON public.saas_marketing_signups (created_at DESC);

CREATE INDEX IF NOT EXISTS saas_marketing_signups_email_lower_idx
  ON public.saas_marketing_signups (lower(email));

CREATE INDEX IF NOT EXISTS saas_marketing_signups_audience_idx
  ON public.saas_marketing_signups (audience);

CREATE INDEX IF NOT EXISTS saas_marketing_signups_status_idx
  ON public.saas_marketing_signups (status);

-- ---------------------------------------------------------------------------
-- updated_at trigger — keeps the column honest without app-side plumbing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.saas_marketing_signups_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saas_marketing_signups_updated_at_trg
  ON public.saas_marketing_signups;

CREATE TRIGGER saas_marketing_signups_updated_at_trg
  BEFORE UPDATE ON public.saas_marketing_signups
  FOR EACH ROW
  EXECUTE FUNCTION public.saas_marketing_signups_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — enabled with no policies. Service role bypasses RLS; anon/auth
-- users have no access. The only write path is the server action using
-- the service role key.
-- ---------------------------------------------------------------------------

ALTER TABLE public.saas_marketing_signups ENABLE ROW LEVEL SECURITY;

COMMIT;
