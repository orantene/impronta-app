-- Materialized demand score for the directory's "Recommended" sort.
--
-- Today the score is computed live per request and only re-orders the cards
-- ALREADY on the loaded page, so a talent with strong demand sitting on page 3
-- can never climb to page 1. Persisting the score lets the sort run in the
-- database, making "Recommended" demand-true across the whole roster.
--
-- Scope is (tenant, talent): engagement earned on one agency's directory must
-- not rank a talent on another agency's — the same isolation rule the pricing
-- cascade follows.
--
-- Refreshed by /api/cron/refresh-demand-scores. The table being empty or stale
-- is harmless: the directory falls back to page-local smoothing, which is
-- exactly today's behavior.
CREATE TABLE IF NOT EXISTS public.talent_demand_scores (
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  -- Weighted 30-day engagement: profile opens count more than gallery peeks.
  score NUMERIC NOT NULL DEFAULT 0 CHECK (score >= 0),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, talent_profile_id)
);

-- The directory reads "top scores for this tenant", so lead with tenant_id.
CREATE INDEX IF NOT EXISTS idx_talent_demand_scores_tenant_score
  ON public.talent_demand_scores (tenant_id, score DESC);

ALTER TABLE public.talent_demand_scores ENABLE ROW LEVEL SECURITY;

-- Staff may inspect their own tenant's scores. The PUBLIC directory reads this
-- with the service-role client (same pattern as pricing defaults + the
-- analytics read), because an anon visitor has no tenant membership.
DROP POLICY IF EXISTS talent_demand_scores_staff ON public.talent_demand_scores;
CREATE POLICY talent_demand_scores_staff ON public.talent_demand_scores
  FOR SELECT USING (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.talent_demand_scores IS
  'Weighted 30-day engagement per (tenant, talent) powering the directory Recommended sort. Refreshed nightly by /api/cron/refresh-demand-scores; empty = fall back to page-local smoothing.';
