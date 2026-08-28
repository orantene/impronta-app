-- Support Center Round 2 W3.2 / W3.3 — weekly digest history + AI diagnostics.
--
-- support_weekly_digests stores each Monday snapshot (upsert on week_start)
-- in addition to platform_settings.support_weekly_digest (current card).
-- ai_summary is a soft-fail HQ rewrite of a ticket's diagnostics blob.
--
-- NOT APPLIED — integrator must `npm run db:push` before merge.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_weekly_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_weekly_digests IS
  'Historical weekly support digests. Platform-admin SELECT; writes are service-role.';

ALTER TABLE public.support_weekly_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_weekly_digests_select_platform ON public.support_weekly_digests;
CREATE POLICY support_weekly_digests_select_platform ON public.support_weekly_digests
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE ON public.support_weekly_digests FROM authenticated, anon;
GRANT SELECT ON public.support_weekly_digests TO authenticated;

ALTER TABLE public.support_ticket_diagnostics
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

COMMENT ON COLUMN public.support_ticket_diagnostics.ai_summary IS
  'HQ-requested plain-language summary of the diagnostics snapshot. Regenerable.';

COMMIT;
