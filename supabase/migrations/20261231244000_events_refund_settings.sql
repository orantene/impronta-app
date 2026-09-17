-- Event settings: refunds as a per-event switch, and a guest may ASK.
--
-- WHY THREE COLUMNS AND NOT A RULE. `events.refund_cutoff_hours` already
-- answers "is this buyer still inside the window" (`refundDecision`), but it
-- cannot say whether the venue takes refund requests from the ticket page AT
-- ALL. A restaurant that sells a fixed-menu night does not want a "Request a
-- refund" button on every ticket; a festival does. `refunds_open` is that
-- decision, `refund_policy_key` names which of the platform policies the
-- venue is promising (tiered / flexible / strict / manual, the same four the
-- commercial terms use), and `refunds_close_at` is an optional hard stop so a
-- venue can close requests the night before without editing the cutoff.
--
-- DEFAULT CLOSED. A column that defaulted to open would put a refund button
-- on every ticket already issued the moment this applies. The Settings tab
-- flips it per event; the guest ticket page reads it and renders the button
-- only when it is true and the close date has not passed.
--
-- THE GUEST'S REQUEST IS AN INTENT. `ticket_refund_intents` is the one table
-- that already knows how to move money back inspectably (claim-before-execute,
-- executor cron, partial_failure lands where a person sees it). A guest
-- request is a third REASON on that table, and `source` records that a guest
-- asked rather than the system deciding. A `manual` policy inserts the intent
-- ALREADY CLAIMED (`claimed_at = now()`, `result = 'awaiting_review'`): the
-- cron skips claimed rows by design, so the request is visible in the
-- Exceptions inbox as a claimed-but-unexecuted intent, which the table's own
-- header defines as "something to investigate, never something to redo".

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS refunds_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_policy_key text,
  ADD COLUMN IF NOT EXISTS refunds_close_at timestamptz;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_refund_policy_key_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_refund_policy_key_check
  CHECK (refund_policy_key IS NULL OR refund_policy_key IN ('tiered', 'flexible', 'strict', 'manual'));

COMMENT ON COLUMN public.events.refunds_open IS
  'TRUE when the guest ticket page offers "Request a refund" for this event. Default false: a ticket never grows a refund button by accident.';
COMMENT ON COLUMN public.events.refund_policy_key IS
  'Which platform refund policy the venue promises for this event (tiered | flexible | strict | manual). manual: a guest request is recorded already-claimed and a person decides; the cron never executes it.';
COMMENT ON COLUMN public.events.refunds_close_at IS
  'Optional instant after which the ticket page stops offering refund requests, independent of refund_cutoff_hours.';

-- A third reason, and who asked. The CHECK is replaced rather than dropped
-- (see 20261230000800): an unconstrained reason lets a typo sit unexecuted.
ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_reason_check;
ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_reason_check
  CHECK (reason IN ('seat_lost_after_payment', 'event_cancelled', 'guest_request'));

ALTER TABLE public.ticket_refund_intents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS requested_by_admission_id uuid REFERENCES public.admissions(id) ON DELETE SET NULL;

ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_source_check;
ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_source_check
  CHECK (source IN ('system', 'guest_request'));

COMMENT ON COLUMN public.ticket_refund_intents.reason IS
  'seat_lost_after_payment: the hold lapsed between payment and settlement. '
  'event_cancelled: the venue cancelled the show, so every paid line is owed its money back. '
  'guest_request: the ticket holder asked from /ticket/<code> while the event had refunds open.';
COMMENT ON COLUMN public.ticket_refund_intents.source IS
  'system: written by the paid hook or the cancel cascade. guest_request: written by the public ticket page on the holder''s request.';
COMMENT ON COLUMN public.ticket_refund_intents.requested_by_admission_id IS
  'The admission whose holder asked, when source = guest_request. Provenance only; the refund is per order line.';

COMMIT;
