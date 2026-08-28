-- Support Center M8 — learning loop.
--
-- Insights + fix-links (platform-admin SELECT only). Writes are service-role.
-- Rollup view is security_invoker so it inherits table RLS.
-- Weekly digest snapshot lives on the platform_settings singleton so the HQ
-- Insights page can render the last cron summary without a new table.
--
-- Rollback: DROP VIEW public.support_insights_rollup;
-- DROP TABLE public.support_ticket_fix_links, public.support_ticket_insights;
-- ALTER TABLE public.platform_settings DROP COLUMN support_weekly_digest;

BEGIN;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS support_weekly_digest JSONB;

COMMENT ON COLUMN public.platform_settings.support_weekly_digest IS
  'Last support.weekly_digest cron snapshot: {weekStart, summary, suggestedFixes, generatedAt}.';

CREATE TABLE IF NOT EXISTS public.support_ticket_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  root_cause TEXT,
  product_area TEXT,
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  resolution_kind TEXT CHECK (resolution_kind IN (
    'ai_self_serve','human_resolved','no_response','unresolved'
  )),
  is_feature_request BOOLEAN NOT NULL DEFAULT FALSE,
  is_bug_report BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  model TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_insights_confirmed_idx
  ON public.support_ticket_insights (confirmed_at)
  WHERE confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_ticket_insights_area_idx
  ON public.support_ticket_insights (product_area, created_at DESC);

COMMENT ON TABLE public.support_ticket_insights IS
  'AI-suggested ticket insights. Confirmed rows (confirmed_at) feed support AI retrieval.';

CREATE TABLE IF NOT EXISTS public.support_ticket_fix_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('commit','pr','release','doc')),
  url TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_fix_links_ticket_idx
  ON public.support_ticket_fix_links (ticket_id, created_at DESC);

COMMENT ON TABLE public.support_ticket_fix_links IS
  'Shipped-from-support links (commit/PR/release/doc) shown on HQ Insights.';

CREATE OR REPLACE VIEW public.support_insights_rollup
WITH (security_invoker = true) AS
SELECT
  date_trunc('week', created_at) AS week,
  product_area,
  count(*)::int AS ticket_count,
  count(*) FILTER (WHERE resolution_kind = 'ai_self_serve')::int AS ai_resolved,
  count(*) FILTER (WHERE is_bug_report)::int AS bug_reports,
  count(*) FILTER (WHERE is_feature_request)::int AS feature_requests,
  count(*) FILTER (WHERE sentiment = 'negative')::int AS negative
FROM public.support_ticket_insights
GROUP BY 1, 2;

COMMENT ON VIEW public.support_insights_rollup IS
  'Weekly rollup of support insights. security_invoker: platform-admin SELECT only.';

ALTER TABLE public.support_ticket_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_fix_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_insights_select_platform ON public.support_ticket_insights;
CREATE POLICY support_insights_select_platform ON public.support_ticket_insights
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS support_fix_links_select_platform ON public.support_ticket_fix_links;
CREATE POLICY support_fix_links_select_platform ON public.support_ticket_fix_links
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_insights FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_fix_links FROM authenticated, anon;
GRANT SELECT ON public.support_ticket_insights TO authenticated;
GRANT SELECT ON public.support_ticket_fix_links TO authenticated;
GRANT SELECT ON public.support_insights_rollup TO authenticated;

COMMIT;
