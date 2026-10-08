-- TUL-147 follow-up: explicit webhook lane on stripe_processed_events.
--
-- Until now the lane was encoded in event_id (`<lane>:<id>`, bare id for the
-- US/platform lane). The commerce health panel inferred "US lane" from "no
-- colon", which breaks the day a lane is added or an id format changes.
-- Additive only: a nullable column, a one-time backfill, an index. The primary
-- key and every existing column are untouched. Rows written by code that does
-- not yet set `lane` stay NULL until the next backfill; readers treat NULL as
-- "derive from the event_id prefix".

BEGIN;

ALTER TABLE public.stripe_processed_events
  ADD COLUMN IF NOT EXISTS lane text;

COMMENT ON COLUMN public.stripe_processed_events.lane IS
  'Webhook lane that claimed the event: platform (US), platform_mx, discover_client_subscription. NULL on rows written before this column existed or by old code during the deploy window.';

-- One-time backfill. platform_mx:% -> platform_mx; other prefixed ids use the
-- text before the first colon; no colon -> platform.
UPDATE public.stripe_processed_events
SET lane = CASE
  WHEN event_id LIKE 'platform_mx:%' THEN 'platform_mx'
  WHEN position(':' in event_id) > 0 THEN split_part(event_id, ':', 1)
  ELSE 'platform'
END
WHERE lane IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_processed_events_lane_processed_at
  ON public.stripe_processed_events (lane, processed_at DESC);

COMMIT;
