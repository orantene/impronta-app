-- TUL-320 · Exact per-talent AI spend, summed in SQL.
--
-- PROBLEM: the per-talent monthly spend checks (booking assistant cap in turn.server.ts, hub talent sub-cap in
-- hub-talent-subcap.ts) loaded up to 5000 cms_ai_usage_log rows and summed them in JavaScript. Past 5000 successful rows
-- in a month the total silently undercounted, so the cap could be exceeded.
--
-- RULE (unchanged, mirrors sumUsageRowsSpendCents / sumBookingAssistantSpendCents): each successful row whose
-- context_jsonb.cost_usd is a number > 0 counts max(1, round(cost_usd * 100)) cents; every other row counts 0.
--
-- SECURITY: SECURITY INVOKER (no elevated rights) and EXECUTE for service_role only, like increment_ai_usage_monthly.
-- Callers are server code using the service-role client; RLS on cms_ai_usage_log still applies to anyone else.
-- Idempotent (CREATE OR REPLACE). ROLLBACK: DROP FUNCTION public.ai_talent_spend_cents(text, timestamptz, uuid, text);

CREATE OR REPLACE FUNCTION public.ai_talent_spend_cents(
  p_talent_profile_id text,
  p_since timestamptz,
  p_tenant_id uuid DEFAULT NULL,
  p_feature text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(GREATEST(1, ROUND((l.context_jsonb ->> 'cost_usd')::numeric * 100))), 0)::bigint
  FROM public.cms_ai_usage_log l
  WHERE l.ok = true
    AND l.created_at >= p_since
    AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
    AND l.context_jsonb @> (
      jsonb_build_object('talent_profile_id', p_talent_profile_id)
      || CASE WHEN p_feature IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('feature', p_feature) END
    )
    AND jsonb_typeof(l.context_jsonb -> 'cost_usd') = 'number'
    AND (l.context_jsonb ->> 'cost_usd')::numeric > 0;
$$;

REVOKE ALL ON FUNCTION public.ai_talent_spend_cents(text, timestamptz, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_talent_spend_cents(text, timestamptz, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_talent_spend_cents(text, timestamptz, uuid, text) TO service_role;
