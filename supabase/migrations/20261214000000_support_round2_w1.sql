-- Support Center Round 2 W1 — event types + honest dispatch statuses.
--
-- 1. Widen support_ticket_events.event_type for ai_marked_helpful (W1.1)
--    and kept_open (W2.2; added now so W2 does not need a second CHECK rewrite).
-- 2. Widen notification_dispatch_log.status with skipped so unconfigured
--    channels are not recorded as sent (W1.5).
--
-- NOT APPLIED — integrator must `npm run db:push` before merge. Do not
-- run this against production from an agent session.
--
-- Rollback: drop the two CHECKs and re-add the prior lists
--   events: ... insight_generated, proposed_action_expired
--   dispatch: queued, sent, failed, suppressed

BEGIN;

ALTER TABLE public.support_ticket_events
  DROP CONSTRAINT IF EXISTS support_ticket_events_event_type_check;

ALTER TABLE public.support_ticket_events
  ADD CONSTRAINT support_ticket_events_event_type_check
  CHECK (event_type IN (
    'created','message_sent','status_changed','escalated','assigned','priority_changed',
    'category_changed','contact_updated','rated','reopened','auto_close_warning',
    'auto_closed','diagnostic_attached','insight_generated','proposed_action_expired',
    'ai_marked_helpful','kept_open'
  ));

COMMENT ON CONSTRAINT support_ticket_events_event_type_check ON public.support_ticket_events IS
  'Round 2 W1: ai_marked_helpful (requester said the AI answer helped) and kept_open (idle-clock reset).';

ALTER TABLE public.notification_dispatch_log
  DROP CONSTRAINT IF EXISTS notification_dispatch_log_status_check;

ALTER TABLE public.notification_dispatch_log
  ADD CONSTRAINT notification_dispatch_log_status_check
  CHECK (status IN ('queued','sent','failed','suppressed','skipped'));

COMMENT ON CONSTRAINT notification_dispatch_log_status_check ON public.notification_dispatch_log IS
  'Round 2 W1: skipped = channel handler returned null (not configured or no endpoint). Distinct from failed.';

COMMIT;
