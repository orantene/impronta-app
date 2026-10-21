-- TUL-1737: a paid workspace downgrade is applied by Stripe at the END of the period the customer already paid for.
-- The owner's keep-list (which talent stay visible) is stored with the pending change so the webhook that actually drops
-- the tier can archive the overflow then. Shape (written by commitPlanDowngrade, consumed + cleared by the webhook):
--   { "target_tier": "studio", "keep_ids": ["<uuid>", ...], "archive_event_id": "<uuid>", "requested_by": "<uuid>", "requested_at": "<iso>" }
-- Additive and nullable. Not applied by the agent: the PM applies it with the batch.
ALTER TABLE public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS pending_downgrade jsonb;

COMMENT ON COLUMN public.workspace_subscriptions.pending_downgrade IS
  'TUL-1737: owner keep-list for a period-end downgrade; the subscription webhook archives the overflow when plan_tier reaches target_tier, then clears this.';
