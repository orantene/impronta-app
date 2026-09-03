-- Phase 0.7 — `message_kind` gains 'order'.
--
-- The offer card in the thread becomes the ORDER card. D4, ruled by the
-- Platform Features Director after the Front Door Manager and I converged:
--
--   1. Rename internally — types, files, functions, comments, test names.
--   2. NEVER ship a customer-facing copy change as a side effect of an internal
--      rename. Those are two PRs' worth of intent even when they are one diff.
--   3. The customer-facing noun comes from the WORDS TABLE with a default,
--      never hardcoded in either surface. A tenant who calls it a quote gets
--      "quote"; one who calls it an order gets "order".
--
-- Point 3 is why this is worth doing at all. Hardcoding "order" in the UI would
-- be the same class of mistake as `unit_price_cents` holding a line total: a
-- name that is right for one caller and wrong for the next, with nothing to
-- catch it. This migration therefore adds a DISCRIMINATOR, not a label. No copy
-- ships here.
--
-- Widening a CHECK is additive: every existing kind still validates, and no row
-- changes. The enum is a text CHECK rather than a real enum, so this is a
-- constraint swap and not `ALTER TYPE ... ADD VALUE` — no separate-file rule.

BEGIN;

ALTER TABLE public.inquiry_messages
  DROP CONSTRAINT IF EXISTS inquiry_messages_message_kind_check;

ALTER TABLE public.inquiry_messages
  ADD CONSTRAINT inquiry_messages_message_kind_check
  CHECK (message_kind = ANY (ARRAY[
    'text',
    'offer_event',
    'payment_request',
    'payment_paid',
    'booking_confirmed',
    'talent_rate_confirmed',
    'coordinator_request',
    'talent_rate',
    'call_sheet_update',
    'booking_status',
    'system_event',
    'admin_suggested_talent',
    'balance_due',
    'reservation',
    -- NEW. The order card: draft, quoted, pay now, paid, fulfilled, refunded.
    -- `card_payload` carries { order_id }, and every figure is READ from the
    -- order rather than copied into the payload — a card that stores its own
    -- totals is a card that disagrees with the order it describes the moment
    -- someone adds a line.
    'order'
  ]));

COMMENT ON COLUMN public.inquiry_messages.message_kind IS
  'Card discriminator. ''order'' is the order card (D4); its card_payload holds { order_id } '
  'and the card READS the order rather than copying its figures. The customer-facing noun comes '
  'from the words table, never from this value.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Prove it both ways: the new kind is accepted AND a junk kind is still refused.
-- A widened CHECK that accepts everything would pass a one-sided assertion.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_inquiry UUID;
  v_tenant  UUID;
BEGIN
  SELECT id, tenant_id INTO v_inquiry, v_tenant FROM public.inquiries LIMIT 1;
  IF v_inquiry IS NULL THEN
    RAISE NOTICE 'no inquiry to probe against — constraint definition asserted only';
    IF position('''order''' IN pg_get_constraintdef(
         (SELECT oid FROM pg_constraint
           WHERE conrelid = 'public.inquiry_messages'::regclass
             AND conname = 'inquiry_messages_message_kind_check'))) = 0 THEN
      RAISE EXCEPTION 'the widened CHECK does not list ''order''';
    END IF;
    RETURN;
  END IF;

  -- Accepted.
  INSERT INTO public.inquiry_messages
    (inquiry_id, tenant_id, thread_type, message_kind, body, card_payload)
  VALUES
    (v_inquiry, v_tenant, 'private'::public.inquiry_thread_type, 'order', '',
     jsonb_build_object('probe', true));

  -- And still refused.
  BEGIN
    INSERT INTO public.inquiry_messages
      (inquiry_id, tenant_id, thread_type, message_kind, body)
    VALUES
      (v_inquiry, v_tenant, 'private'::public.inquiry_thread_type, 'not_a_real_kind', '');
    RAISE EXCEPTION 'the CHECK accepted a junk kind — it was widened too far';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  DELETE FROM public.inquiry_messages
   WHERE inquiry_id = v_inquiry AND card_payload ? 'probe';

  IF EXISTS (SELECT 1 FROM public.inquiry_messages WHERE card_payload ? 'probe') THEN
    RAISE EXCEPTION 'probe message survived cleanup';
  END IF;
END $$;

COMMIT;
