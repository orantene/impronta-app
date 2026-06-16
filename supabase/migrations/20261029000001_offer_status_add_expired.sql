-- ============================================================================
-- A5 — add 'expired' to the inquiry_offer_status enum.
--
-- A SENT offer now carries valid_until (stamped at send time =
-- now + DEFAULT_OFFER_EXPIRY_DAYS). A sweeper (separate workstream) transitions
-- a lapsed offer to status='expired'; this migration makes that value legal.
--
-- IMPORTANT: ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so
-- this statement is intentionally NOT wrapped in BEGIN/COMMIT. IF NOT EXISTS
-- makes it idempotent / re-runnable.
-- ============================================================================

ALTER TYPE public.inquiry_offer_status ADD VALUE IF NOT EXISTS 'expired';
