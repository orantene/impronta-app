-- Faithful replay context for failed_engine_effects (P1 reliability fix).
--
-- CONTEXT: `retryFailedEngineEffects()` used to mark unresolved
-- `failed_engine_effects` rows `resolved = true` WITHOUT ever re-running the
-- failed listener — silently dropping the missed system-message / bell /
-- dispatch. The stored `payload` column only carries the ERROR ({message,
-- stack}), NOT the original event, so a faithful replay was impossible from the
-- persisted data alone.
--
-- This migration adds the columns `emitEngineEvents` needs to persist the
-- ORIGINAL event at failure time so the retry sweep can reconstruct the
-- `EngineEvent` and re-invoke ONLY the listener that failed (keyed by the
-- `listener_name` index), relying on the existing `event_id`-based idempotency
-- in the notification dispatcher + the system-message / bell de-dupe so a
-- partial success is never double-applied.
--
-- All columns are NULLABLE with no backfill: pre-existing rows (logged before
-- this migration) simply lack replay context and the retry code refuses to
-- resolve them — they age into the ops alert instead of being silently lost.
-- Rolling back is a plain `DROP COLUMN` (no data dependency).

BEGIN;

-- The original engine event type (e.g. 'offer.sent'). Mirrors EngineEvent.type.
ALTER TABLE public.failed_engine_effects
  ADD COLUMN IF NOT EXISTS event_type TEXT;

-- The ORIGINAL EngineEvent.payload ({ data, systemMessage?, notifications? }).
-- This is the missing piece needed to re-run the failed listener faithfully.
-- Distinct from the existing `payload` column, which stores the ERROR.
ALTER TABLE public.failed_engine_effects
  ADD COLUMN IF NOT EXISTS event_payload JSONB;

-- The original EngineEvent.actorUserId (nullable by design for system sweeps).
ALTER TABLE public.failed_engine_effects
  ADD COLUMN IF NOT EXISTS event_actor_user_id UUID;

-- Backoff anchor. The retry sweep only picks rows whose next_retry_at is null
-- (never retried) or in the past, then pushes it forward on a failed re-run.
ALTER TABLE public.failed_engine_effects
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

COMMENT ON COLUMN public.failed_engine_effects.event_type IS
  'Original EngineEvent.type, persisted for faithful listener replay by retryFailedEngineEffects.';
COMMENT ON COLUMN public.failed_engine_effects.event_payload IS
  'Original EngineEvent.payload ({data, systemMessage?, notifications?}) — the input the failed listener needs to re-run. NOT the error (see `payload`).';
COMMENT ON COLUMN public.failed_engine_effects.event_actor_user_id IS
  'Original EngineEvent.actorUserId, persisted for faithful listener replay.';
COMMENT ON COLUMN public.failed_engine_effects.next_retry_at IS
  'Exponential-backoff anchor. Retry sweep picks rows where this is null or <= now().';

-- Make the retry sweep's selection (unresolved + attempt cap + backoff) an
-- index seek rather than a scan as the table grows.
CREATE INDEX IF NOT EXISTS idx_failed_effects_retry_ready
  ON public.failed_engine_effects (next_retry_at)
  WHERE resolved = false;

COMMIT;
