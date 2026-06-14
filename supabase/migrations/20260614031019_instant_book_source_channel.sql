-- Instant-book (feature 6.4).
-- Add 'instant_book' to the inquiry source_channel enum so the instant-book
-- engine can stamp source_channel='instant_book' on inquiries that skip
-- negotiation + talent approval (talent opted-in fixed-rate booking).
-- ALTER TYPE ... ADD VALUE cannot run inside a txn that also USES the value;
-- the value is added standalone here and used by later code only.

ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'instant_book';

COMMENT ON COLUMN public.inquiries.source_channel IS
  'Origination channel. ''instant_book'' = talent opted-in fixed-rate booking; skips negotiation and talent approval.';
