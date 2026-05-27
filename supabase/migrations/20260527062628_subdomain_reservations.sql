-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Subdomain TTL reservations for /get-started signup funnel        ║
-- ║                                                                    ║
-- ║  Problem: two leads can race for the same subdomain. Both see     ║
-- ║  "foo is available" during the form check; whoever provisions     ║
-- ║  first wins; the loser hits a conflict after they've completed    ║
-- ║  Stripe Checkout. Bad UX, lost revenue.                            ║
-- ║                                                                    ║
-- ║  Fix: when a lead is created with subdomain_wanted=X, insert a    ║
-- ║  reservation row with a 15-minute TTL. Subsequent availability    ║
-- ║  checks treat active reservations as "pending" (distinct from     ║
-- ║  hard-taken or system-reserved). The provisioner deletes the      ║
-- ║  reservation on successful workspace creation. Expired rows are   ║
-- ║  ignored on read (lazy cleanup); a periodic cron can prune.       ║
-- ║                                                                    ║
-- ║  TTL = 15 minutes — long enough for Stripe Checkout (typically    ║
-- ║  5-10 min including 3DS), short enough that abandoned signups     ║
-- ║  don't squat indefinitely.                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝

BEGIN;

CREATE TABLE IF NOT EXISTS public.saas_subdomain_reservations (
  -- Slug is the natural key — only one active reservation per slug at a time.
  -- Lowercase, normalized through the same WORKSPACE_SLUG_REGEX the form uses.
  slug          TEXT PRIMARY KEY,
  -- The lead that holds this reservation. Cascade on lead delete (already
  -- the lead's lifecycle owns this reservation).
  lead_id       UUID NOT NULL REFERENCES public.saas_marketing_signups(id) ON DELETE CASCADE,
  reserved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

-- Cleanup query index — supports DELETE WHERE expires_at < now() (periodic cron) and
-- the lazy-cleanup WHERE expires_at > now() filter inside the availability check.
CREATE INDEX IF NOT EXISTS saas_subdomain_reservations_expires_at_idx
  ON public.saas_subdomain_reservations (expires_at);

-- Lookups by lead — when the provisioner deletes the reservation after
-- successfully creating the workspace, it joins on lead_id.
CREATE INDEX IF NOT EXISTS saas_subdomain_reservations_lead_id_idx
  ON public.saas_subdomain_reservations (lead_id);

COMMENT ON TABLE public.saas_subdomain_reservations IS
  'Short-lived holds (15-min TTL) on requested subdomains so two get-started leads cannot race for the same slug. Released on successful provision (workspace-signup.server.ts) or by lazy expiry on read.';

COMMENT ON COLUMN public.saas_subdomain_reservations.slug IS
  'Lowercase normalized slug — same format the form enforces (WORKSPACE_SLUG_REGEX).';

COMMENT ON COLUMN public.saas_subdomain_reservations.expires_at IS
  'Reservation expires 15 minutes after creation. Rows past this are ignored by isRequestedLinkTaken and may be pruned by a periodic cron.';

-- ─── Row-Level Security ────────────────────────────────────────────────────
-- This table is touched only by server actions running with the service role.
-- No public, anon, or authenticated policies are needed; RLS is enabled with
-- no policies so non-service-role access is denied by default.

ALTER TABLE public.saas_subdomain_reservations ENABLE ROW LEVEL SECURITY;

COMMIT;
