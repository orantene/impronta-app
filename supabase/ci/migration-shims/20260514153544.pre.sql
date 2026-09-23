-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: 20260514153544_inquiry_source_channel_expand.sql
--
-- WHY IT CANNOT APPLY FROM SCRATCH
--   It applies fine. What it cannot reproduce from scratch is the ORDER of
--   public.inquiry_source_channel's values. Enum order is schema, not cosmetics:
--   it is what `<`, `>` and ORDER BY on the column mean.
--
--   20260411120000_commercial_accounts_bookings.sql creates the type with seven
--   values. The only file that adds 'pitch' is 20260908000000_pitches.sql —
--   a LATER stamp — so replaying in version order lands 'pitch' last, at
--   position 20. Production has it at position 8.
--
-- WHAT PRODUCTION STATE IT REPRODUCES
--   Production received 'pitch' before this file's nine values. THIS FILE'S OWN
--   HEADER is the evidence, written by someone reading production at the time:
--
--     "The audit (phase-a-audit §A.3.1) noted that source_channel was a
--      7-value generic enum. Probe revealed it's actually an 8-value Postgres
--      enum (`pitch` was added previously). The plan wants 10 values …"
--     "-- Existing values (kept): directory_guest, directory_client, phone,
--      -- whatsapp, email, admin, other, pitch."
--
--   Eight values with 'pitch' eighth, before the nine added below — which is
--   exactly the order database.types.ts reports for production today:
--     directory_guest, directory_client, phone, whatsapp, email, admin, other,
--     pitch, direct_client_dashboard, …
--
--   Adding it here, one statement before the nine, puts 'pitch' back at
--   position 8. 20260908000000 adds it inside a DO block that swallows
--   duplicate_object, so that file stays a correct no-op for this value.
--
--   A pre-shim runs on EVERY attempt, including ones the runner makes before
--   20260411120000 has created the type — so this is guarded on the type
--   existing rather than failing the run. When the type is absent the attempt
--   is about to be deferred anyway, and the shim runs again on the retry.
-- ─────────────────────────────────────────────────────────────────────────────
DO $shim$
BEGIN
  IF to_regtype('public.inquiry_source_channel') IS NOT NULL THEN
    ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'pitch';
  END IF;
END
$shim$;
