-- Phase 0.6 — a draft order can exist before the buyer has given a name.
--
-- FOUND BY the Front Door Manager building F3, and it is a design question they
-- were right to stop on rather than route around.
--
-- THE COLLISION. `orders.customer_id` was NOT NULL, and `customers` requires an
-- email or a phone (deliberately — see 20261228000141). Together those mean a
-- customer cannot exist until someone has typed a contact detail, and an order
-- cannot exist without a customer. So the earliest a draft order could be
-- created was the Sheet's "who" step.
--
-- But the Sheet's order is lines → when → who → pay, and the two properties a
-- server-side draft exists for are both needed BEFORE "who":
--
--   • It survives a reload. A diner adds two dishes and a table, drops their
--     phone, comes back. A client-side cart is gone.
--   • "Ask first" attaches the draft to a chat. That button fires at the LINES
--     step, before any email exists. It is the whole storefront-to-chat handoff.
--
-- Without this change the server cart covers only the last third of the flow and
-- the first two thirds go back to a client-side cart — which is the fourth cart
-- the architecture exists to delete.
--
-- THE FIX, and why it is this one. `customer_id` becomes nullable ONLY while the
-- order is a draft, and a draft must instead be identified by the signed guest
-- session the trust ladder already issues. That is the proposal's own wording —
-- "a draft order keyed by the guest session OR customer" — and it keeps the
-- guarantee exactly where money depends on it while relaxing it where nothing
-- does. An order that has reached pending_payment still cannot exist without a
-- customer, so there is no path to charging a card for a buyer we cannot name.
--
-- Free to do now: 0 orders exist. Expensive after the first real cart, because
-- dropping NOT NULL on a populated money table means a backfill and a window
-- where both shapes are live.

BEGIN;

DO $$
DECLARE v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows FROM public.orders;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION
      'orders has % row(s) — relaxing customer_id is only free at zero; write a backfill and stage the constraint swap',
      v_rows;
  END IF;
END $$;

ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL;

-- The signed guest-session cookie. TEXT rather than uuid: it is issued by the
-- guest identity layer and this table should not assume its shape.
ALTER TABLE public.orders ADD COLUMN guest_session_id TEXT;

-- Money still requires a named buyer. This is the constraint that matters, and
-- it is the reason relaxing the column above is safe: the guarantee has not been
-- removed, it has been moved to the transition where it earns its keep.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_identified_before_payment
  CHECK (status = 'draft' OR customer_id IS NOT NULL);

-- A draft still has to be SOMEBODY. An order with neither identity is
-- unrecoverable: nothing can find it to resume, attach or reap it.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_draft_has_an_identity
  CHECK (customer_id IS NOT NULL OR guest_session_id IS NOT NULL);

-- Cart recovery is a lookup by guest session. Partial, because only drafts are
-- ever fetched this way — once an order has a customer it is found by customer.
CREATE INDEX orders_guest_session_idx
  ON public.orders (guest_session_id, created_at DESC)
  WHERE guest_session_id IS NOT NULL AND status = 'draft';

COMMENT ON COLUMN public.orders.guest_session_id IS
  'Signed guest-session id. Identifies a DRAFT before the buyer gives an email, so a cart '
  'survives a reload and can be attached to a chat. Null once the order has a customer.';
COMMENT ON CONSTRAINT orders_identified_before_payment ON public.orders IS
  'Money requires a named buyer. customer_id may be null ONLY while status = draft.';

-- ─────────────────────────────────────────────────────────────────────────────
-- NO RLS POLICY IS ADDED FOR guest_session_id, deliberately.
--
-- RLS cannot verify an HMAC-signed cookie — it sees no request, only a JWT — so
-- a policy like `guest_session_id = current_setting('request.headers')` would be
-- forgeable by anyone who can guess or replay a session id. Reading a guest's
-- own draft is therefore a SERVICE-ROLE read behind a server action that
-- verifies the signature first, which is the same shape as the guest chat and
-- receipt paths.
--
-- Stated here because the absence of a policy looks like an oversight, and the
-- next person to "fix" it would open exactly the hole this comment refuses.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- The relaxation took.
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders'
     AND column_name='customer_id' AND is_nullable='YES';
  IF NOT FOUND THEN RAISE EXCEPTION 'orders.customer_id is still NOT NULL'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='guest_session_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'orders.guest_session_id missing'; END IF;

  -- And the guarantee moved rather than vanished. Both directions asserted: a
  -- one-sided check would certify a constraint that exists but never fires.
  BEGIN
    INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, total_cents, source_channel, guest_session_id)
    VALUES ((SELECT id FROM public.agencies LIMIT 1), 'pending_payment', 'USD', 100, 100, 'probe', 'gs_probe');
    RAISE EXCEPTION 'orders_identified_before_payment did NOT fire — a customerless order reached pending_payment';
  EXCEPTION
    WHEN check_violation THEN NULL;   -- correct: money requires a named buyer
  END;

  BEGIN
    INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, total_cents, source_channel)
    VALUES ((SELECT id FROM public.agencies LIMIT 1), 'draft', 'USD', 100, 100, 'probe');
    RAISE EXCEPTION 'orders_draft_has_an_identity did NOT fire — an unidentifiable draft was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;   -- correct: a draft must be somebody
  END;

  -- And the shape Front Door actually needs MUST be accepted.
  INSERT INTO public.orders (tenant_id, status, currency, subtotal_cents, total_cents, source_channel, guest_session_id)
  VALUES ((SELECT id FROM public.agencies LIMIT 1), 'draft', 'USD', 100, 100, 'probe', 'gs_probe');

  DELETE FROM public.orders WHERE source_channel = 'probe';

  IF (SELECT count(*) FROM public.orders) <> 0 THEN
    RAISE EXCEPTION 'probe rows survived cleanup';
  END IF;
END $$;

COMMIT;
