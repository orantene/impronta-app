-- Guest + unconfigured-tenant AI share the default controls row.
-- Unauthenticated marketing chat must not depend on a hand-edited cap.
-- COALESCE keeps any already-set numbers; hard_stop is required for the
-- spend cap to actually fire (ai-usage-gate.ts).

UPDATE public.ai_tenant_controls
SET
  monthly_spend_cap_cents = COALESCE(monthly_spend_cap_cents, 2500),
  max_requests_per_minute = COALESCE(max_requests_per_minute, 30),
  max_requests_per_month = COALESCE(max_requests_per_month, 1500),
  hard_stop_on_cap = true,
  updated_at = now()
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
