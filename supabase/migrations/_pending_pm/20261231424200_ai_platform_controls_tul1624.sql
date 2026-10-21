-- TUL-1624 · The platform tenant's AI ceilings. Public AI (search, inquiry drafting, transcription, the front-door
-- assistant) is now billed to the WORKSPACE whose host the request came in on; only true platform traffic (the
-- tulala.digital front door, onboarding with no workspace yet) stays on this row. It is raised so one busy site can never
-- switch AI off everywhere: 300 requests/minute, 50,000 requests/month, and a 20,000 cent (USD 200) monthly spend cap (PM
-- money decision; to be revisited with real usage data). GREATEST: never lowers a value an operator raised.
-- HELD in _pending_pm. Additive.
--
-- ROLLBACK: UPDATE public.ai_tenant_controls SET max_requests_per_minute = 30, max_requests_per_month = 1500, monthly_spend_cap_cents = 2500
--           WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

BEGIN;

UPDATE public.ai_tenant_controls
SET
  max_requests_per_minute = GREATEST(COALESCE(max_requests_per_minute, 0), 300),
  max_requests_per_month = GREATEST(COALESCE(max_requests_per_month, 0), 50000),
  monthly_spend_cap_cents = GREATEST(COALESCE(monthly_spend_cap_cents, 0), 20000),
  updated_at = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

COMMIT;
