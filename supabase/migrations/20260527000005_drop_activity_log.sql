-- DROP inquiry_activity_log.
--
-- !! GATE: Run this migration ONLY after verifying the backfill in
-- !! 20260527000001_backfill_activity_log_to_events.sql is complete.
--
-- Verification query (run before applying this migration):
--
--   SELECT
--     (SELECT COUNT(*) FROM public.inquiry_activity_log)                          AS source_rows,
--     (SELECT COUNT(*) FROM public.inquiry_events
--      WHERE id IN (SELECT id FROM public.inquiry_activity_log))                  AS backfilled_rows;
--
-- Both numbers must be identical. If they differ:
--   a) Re-run the backfill migration (ON CONFLICT DO NOTHING makes it idempotent).
--   b) Investigate any rows where the ids don't appear in inquiry_events.
--   c) Do NOT proceed until counts match.
--
-- After this migration, all event data is exclusively in inquiry_events.
-- The four engine RPCs (cancel, send_offer, submit_approval, convert_to_booking)
-- already write to inquiry_events only (since 20260527000002).

BEGIN;

DROP TABLE IF EXISTS public.inquiry_activity_log CASCADE;

COMMIT;
