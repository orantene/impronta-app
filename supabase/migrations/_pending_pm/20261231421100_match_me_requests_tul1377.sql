-- TUL-1377: "Match me with a professional". A client describes a job; up to 5 matching
-- professionals are offered it; the first to accept wins; after 2 hours it widens.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge.
-- New tables only, no existing table touched, no backfill. Service-role access only: RLS is on
-- with NO policies and anon/authenticated have no grants (all reads and writes go through the
-- server, which authorizes first).
--
-- Rollback (only if empty): DROP TABLE public.match_request_recipients; DROP TABLE public.match_requests;

BEGIN;

CREATE TABLE IF NOT EXISTS public.match_requests (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  client_user_id     UUID        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  description        TEXT        NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000),
  zone               TEXT,
  status             TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'cancelled')),
  winner_talent_id   UUID        REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  round              INTEGER     NOT NULL DEFAULT 1,
  round_started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.match_request_recipients (
  request_id         UUID        NOT NULL REFERENCES public.match_requests (id) ON DELETE CASCADE,
  talent_profile_id  UUID        NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  round              INTEGER     NOT NULL DEFAULT 1,
  status             TEXT        NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'closed')),
  offered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, talent_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_match_requests_tenant_open
  ON public.match_requests (tenant_id, round_started_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_match_recipients_talent_offered
  ON public.match_request_recipients (talent_profile_id, offered_at DESC);

ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_request_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_requests FROM anon, authenticated;
REVOKE ALL ON public.match_request_recipients FROM anon, authenticated;

COMMENT ON TABLE public.match_requests IS
  'TUL-1377 match-me jobs. Server-only (service role). status open|accepted|cancelled; winner set by a conditional update so the first accept wins.';

COMMIT;
