-- T1-04 A.1: the identity gate guards SELLING. It must not guard ABANDONING.
--
-- WHAT WAS WRONG. `20261230002300` put the product's identity demand behind a
-- trigger that let an order through on exactly two conditions: the status did
-- not change at all, or a customer was attached. Every OTHER status write ran
-- the full check, and "cancelled" is a status write.
--
-- So an anonymous draft holding one gala ticket could never be closed at all.
-- Staff add the ticket to a walk-in draft, get the correct refusal at collect,
-- press Void, and `pos_cancel_draft` (lib/pos/collection.ts finalizeOrCancel)
-- comes back "Could not cancel the sale." The draft is stuck, and because the
-- POS holds one open draft per terminal, the till is stuck with it. The order
-- expiry sweep (lib/orders/expire-orders.ts) writes the same 'cancelled' and
-- was refused the same way, so the row could not even be reaped overnight.
--
-- The same short-circuit was wrong in the other direction. `OLD.status IS NOT
-- DISTINCT FROM NEW.status` was meant to say "an already-closed sale is not
-- re-litigated", but the trigger also fires on customer_id, so it waved through
-- an UPDATE that STRIPPED the customer off a sold ticket: same status, no
-- customer, no complaint. The gate could be walked backwards.
--
-- THE RULE, STATED ONCE. Identity is owed to a SALE, not to a status write.
--   * A transition INTO a state that holds a sale must satisfy the demand.
--   * A transition into a state that abandons the sale must not. Voiding and
--     expiring are how a demand that cannot be met gets resolved; refusing them
--     leaves the only legal exit closed.
--   * Once an order is already on the selling side with no customer, the sale
--     was made under the rules of its own moment. Do not re-refuse it: an
--     operator flipping `requires_identity` on next week must not strand the
--     refund or the fulfilment of a sale that already happened.
--   * But a name may never be REMOVED from a sale that stands.
--
-- WHY A FUNCTION AND NOT TWO LITERALS IN AN `IF`. The predecessor special-cased
-- 'draft'; this one has to answer for all eight labels of `public.order_status`,
-- and the way that stays true is for every label to be written down in one
-- place with a reason. An unclassified label RAISES rather than defaulting.
-- Defaulting to "selling" would re-lock the till the day a 'voided' state is
-- added; defaulting to "not selling" would sell a gated ticket to nobody
-- through the new state and say nothing. A loud refusal naming the function is
-- the only outcome that cannot ship silently.

BEGIN;

-- ── 1. The status graph, classified. ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.order_status_is_selling(p_status public.order_status)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_status
    -- NOT selling. Nothing has been sold and nothing is owed to anybody.
    WHEN 'draft'             THEN RETURN false;  -- a cart, or a quote being built
    WHEN 'cancelled'         THEN RETURN false;  -- voided at the counter, or reaped by the expiry sweep

    -- Selling. The order stands as a commitment, or stood as one and is being
    -- unwound. Both are states an unnamed buyer must not be able to enter for
    -- a product whose whole point is knowing who holds it.
    WHEN 'quoted'            THEN RETURN true;   -- put to a client, awaiting their word
    WHEN 'pending_payment'   THEN RETURN true;   -- capacity held, payment window open
    WHEN 'paid'              THEN RETURN true;
    WHEN 'fulfilled'         THEN RETURN true;
    WHEN 'refunded'          THEN RETURN true;   -- reachable only from paid, so never gated in practice
    WHEN 'partially_refunded' THEN RETURN true;  -- ditto, and it still holds money

    ELSE
      RAISE EXCEPTION 'order status % is classified neither selling nor abandoning', p_status
        USING ERRCODE = 'check_violation',
              HINT    = 'A value was added to public.order_status without classifying it in public.order_status_is_selling.';
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.order_status_is_selling(public.order_status) IS
  'Does this status mean the order holds a sale? false for draft and cancelled, true for the rest. THE list: the identity gate, and any future rule about what a sale owes, must read it here rather than spelling out statuses again. An unclassified label raises.';

REVOKE ALL ON FUNCTION public.order_status_is_selling(public.order_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_status_is_selling(public.order_status) TO service_role;

-- ── 2. Retrievability is owed by a sale, not by an abandonment. ────────────
--
-- `orders_identified_before_payment` exempted only 'draft', so a cancelled
-- anonymous order needed a receipt code to be legal. Every order the POS and
-- the purchase pipeline create carries one, so this never fired ahead of the
-- trigger — but it is the same mistake one layer down, and a row reaped from
-- before `receipt_code` existed would hit it. The exemption is now the whole
-- non-selling side.
--
-- SPELLED OUT rather than calling order_status_is_selling(): a CHECK that
-- depends on a user-defined function is a restore-order hazard in pg_dump, and
-- a constraint should be readable in \d+. The proof block below asserts the two
-- lists agree, and `identity-gate-status.static.test.ts` asserts it on every
-- run of the money lane, so they cannot drift in silence.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_identified_before_payment;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_identified_before_payment
  CHECK (
    status IN ('draft', 'cancelled')
    OR customer_id IS NOT NULL
    OR (guest_session_id IS NOT NULL AND receipt_code IS NOT NULL)
  );

COMMENT ON CONSTRAINT orders_identified_before_payment ON public.orders IS
  'An order that HOLDS a sale must be reachable: a customer, or a guest session plus the receipt code /r/<code> resolves. draft and cancelled owe nothing, because a cart and a void are not sales. The exempt list mirrors public.order_status_is_selling.';

-- ── 3. The gate, rewritten around the transition rather than the write. ────

CREATE OR REPLACE FUNCTION public.orders_require_identity_for_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title  text;
  v_reason text;
BEGIN
  -- (a) Abandoning is not selling. A draft owes nothing yet, and a cancellation
  --     is how an unmeetable demand gets resolved. This one branch is the void
  --     button and the expiry sweep.
  IF NOT public.order_status_is_selling(NEW.status) THEN
    RETURN NEW;
  END IF;

  -- (b) A named buyer satisfies every demand there is.
  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- (c) Already anonymous on the selling side. The sale was legal when it was
  --     made; a refund, a fulfilment or a rollup must not be refused now
  --     because the offering's flag changed since. Note both halves: the OLD
  --     row must ALSO have been anonymous, so an UPDATE that takes the customer
  --     OFF a standing sale falls through to the check below.
  IF TG_OP = 'UPDATE'
     AND public.order_status_is_selling(OLD.status)
     AND OLD.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (d) Crossing into the selling side unnamed. Ask the lines.
  --
  --     An INSERT that arrives already on the selling side has no lines yet
  --     (they reference the order), so this finds nothing. That is unchanged
  --     from the predecessor and is not a hole either path can reach: both the
  --     POS and the purchase pipeline insert the order as 'draft' and add lines
  --     before any transition. Closing it properly needs a trigger on
  --     order_lines, which is a separate change with its own refund risk.
  SELECT o.title, o.identity_reason
    INTO v_title, v_reason
    FROM public.order_lines l
    JOIN public.talent_offerings o ON o.id = l.offering_id
   WHERE l.order_id = NEW.id
     AND o.requires_identity IS TRUE
   ORDER BY l.sort_order, l.id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'order % cannot become % without a customer', NEW.id, NEW.status
      USING ERRCODE = 'check_violation',
            DETAIL  = format(
              'offering %L requires identity (%s)',
              COALESCE(v_title, 'unnamed offering'),
              COALESCE(v_reason, 'unspecified')
            ),
            HINT    = 'Attach a customer, or cancel the sale. Cancelling is always allowed.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_require_identity_for_lines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orders_require_identity_for_lines() TO service_role;

COMMENT ON FUNCTION public.orders_require_identity_for_lines() IS
  'T1-04: an order may not cross INTO a selling status (public.order_status_is_selling) with no customer while a line sells an offering whose requires_identity is true, and a customer may not be removed from one that already stands. Cancelling and expiring are never gated. The DETAIL names the offering so the surface can say which item and why.';

DROP TRIGGER IF EXISTS orders_require_identity_for_lines_trg ON public.orders;
CREATE TRIGGER orders_require_identity_for_lines_trg
  BEFORE INSERT OR UPDATE OF status, customer_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_require_identity_for_lines();

-- ── 4. Proof. The reviewer's scenario, plus the graph it generalises to. ───

-- One anonymous draft with one line, built the way the POS builds one: a guest
-- session and a receipt code, no customer. Temporary; dropped below, and gone
-- anyway if anything in the proof raises, because the whole file is one
-- transaction.
CREATE FUNCTION public.identity_gate_proof_draft(
  p_tenant uuid, p_offering uuid, p_cents bigint, p_seq int
) RETURNS uuid
LANGUAGE plpgsql
AS $helper$
DECLARE
  v_order uuid;
BEGIN
  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, receipt_code
  ) VALUES (
    p_tenant, 'draft', 'USD', p_cents, 0, 0, p_cents, 'identity_gate_proof',
    'gs_identity_gate_' || p_seq,
    'identitygateproof' || lpad(p_seq::text, 6, '0')
  ) RETURNING id INTO v_order;

  -- `order_lines_payee_xor` wants exactly one of talent_profile_id /
  -- owner_tenant_id. A workspace-owned offering is paid to the workspace.
  INSERT INTO public.order_lines (
    order_id, tenant_id, offering_id, owner_tenant_id, label, units,
    unit_cents, total_cents, sort_order
  ) VALUES (
    v_order, p_tenant, p_offering, p_tenant, 'identity gate proof line', 1,
    p_cents, p_cents, 0
  );

  RETURN v_order;
END;
$helper$;


DO $proof$
DECLARE
  v_tenant   uuid;
  v_gated    uuid;
  v_plain    uuid;
  v_customer uuid;
  v_order    uuid;
  v_label    text;
  v_status   text;
  v_seq      int := 0;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'identity gate proof: no agency to probe against, skipping';
    RETURN;
  END IF;

  -- EXHAUSTIVE. Every label of the enum must be classified, or the CASE raises
  -- and this block fails. This is what makes "eight labels" a fact rather than
  -- a claim in a comment.
  FOR v_label IN
    SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'order_status'
     ORDER BY e.enumsortorder
  LOOP
    PERFORM public.order_status_is_selling(v_label::public.order_status);

    -- And the CHECK's inlined exempt list must be the same list.
    IF public.order_status_is_selling(v_label::public.order_status)
       = (v_label IN ('draft', 'cancelled')) THEN
      RAISE EXCEPTION
        'PROOF 0 FAIL: status % is classified % by order_status_is_selling but % by orders_identified_before_payment',
        v_label,
        public.order_status_is_selling(v_label::public.order_status),
        NOT (v_label IN ('draft', 'cancelled'));
    END IF;
  END LOOP;
  RAISE NOTICE 'PROOF 0 PASS: every order_status label is classified, and the CHECK agrees';

  DELETE FROM public.order_lines
   WHERE order_id IN (SELECT id FROM public.orders WHERE source_channel = 'identity_gate_proof');
  DELETE FROM public.orders WHERE source_channel = 'identity_gate_proof';
  DELETE FROM public.talent_offerings
   WHERE tenant_id = v_tenant AND title IN ('Identity Gate Gala Ticket', 'Identity Gate Espresso');

  INSERT INTO public.talent_offerings (
    tenant_id, owner_kind, title, amount_cents, currency, status,
    requires_identity, identity_reason
  ) VALUES (
    v_tenant, 'workspace', 'Identity Gate Gala Ticket', 5000, 'USD', 'published',
    true, 'attendee_names'
  ) RETURNING id INTO v_gated;

  INSERT INTO public.talent_offerings (
    tenant_id, owner_kind, title, amount_cents, currency, status
  ) VALUES (
    v_tenant, 'workspace', 'Identity Gate Espresso', 900, 'USD', 'published'
  ) RETURNING id INTO v_plain;

  -- PROOF 1: the reviewer's void. An anonymous draft holding a gated line is
  -- cancellable. This is the one that was refused.
  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_gated, 5000, v_seq);
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order;
  SELECT status::text INTO v_status FROM public.orders WHERE id = v_order;
  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'PROOF 1 FAIL: the void did not take, status %', v_status;
  END IF;
  RAISE NOTICE 'PROOF 1 PASS: an anonymous draft with a gated line can be VOIDED';

  -- PROOF 2: the expiry sweep writes the same cancellation and clears the hold.
  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_gated, 5000, v_seq);
  UPDATE public.orders
     SET hold_expires_at = now() - interval '1 hour'
   WHERE id = v_order;
  UPDATE public.orders
     SET status = 'cancelled', hold_expires_at = NULL
   WHERE id = v_order;
  SELECT status::text INTO v_status FROM public.orders WHERE id = v_order;
  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'PROOF 2 FAIL: the expiry sweep did not take, status %', v_status;
  END IF;
  RAISE NOTICE 'PROOF 2 PASS: an anonymous draft with a gated line can be EXPIRED';

  -- PROOF 3: the same draft still cannot take money, by any selling door.
  FOREACH v_label IN ARRAY ARRAY['quoted','pending_payment','paid','fulfilled','refunded','partially_refunded']
  LOOP
    v_seq := v_seq + 1;
    v_order := public.identity_gate_proof_draft(v_tenant, v_gated, 5000, v_seq);
    BEGIN
      UPDATE public.orders SET status = v_label::public.order_status WHERE id = v_order;
      RAISE EXCEPTION 'PROOF 3 FAIL: an anonymous gated draft reached %', v_label;
    EXCEPTION
      WHEN check_violation THEN NULL;
    END;
  END LOOP;
  RAISE NOTICE 'PROOF 3 PASS: every selling status refuses an anonymous gated draft';

  -- PROOF 4: a NON-gated anonymous draft is untouched in either direction.
  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_plain, 900, v_seq);
  UPDATE public.orders SET status = 'paid' WHERE id = v_order;
  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_plain, 900, v_seq);
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_order;
  RAISE NOTICE 'PROOF 4 PASS: a plain anonymous draft still pays and still voids';

  -- PROOF 5: a gated sale that WAS named unwinds normally, and cannot be
  -- un-named. The second half is the hole the old short-circuit left open.
  INSERT INTO public.customers (tenant_id, email, display_name)
  VALUES (v_tenant, 'identity-gate-proof@example.test', 'Identity Gate Proof')
  RETURNING id INTO v_customer;

  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_gated, 5000, v_seq);
  UPDATE public.orders SET customer_id = v_customer, status = 'paid' WHERE id = v_order;
  UPDATE public.orders SET status = 'fulfilled' WHERE id = v_order;
  UPDATE public.orders SET status = 'refunded' WHERE id = v_order;
  RAISE NOTICE 'PROOF 5a PASS: a named gated sale fulfils and refunds';

  BEGIN
    UPDATE public.orders SET customer_id = NULL WHERE id = v_order;
    RAISE EXCEPTION 'PROOF 5b FAIL: the customer was stripped off a standing gated sale';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PROOF 5b PASS: a standing gated sale cannot be un-named';
  END;

  -- PROOF 6: an anonymous sale that ALREADY stands is not re-refused when the
  -- offering starts demanding a name afterwards. This is why (c) exists.
  v_seq := v_seq + 1;
  v_order := public.identity_gate_proof_draft(v_tenant, v_plain, 900, v_seq);
  UPDATE public.orders SET status = 'paid' WHERE id = v_order;
  UPDATE public.talent_offerings
     SET requires_identity = true, identity_reason = 'delivery'
   WHERE id = v_plain;
  UPDATE public.orders SET status = 'refunded' WHERE id = v_order;
  RAISE NOTICE 'PROOF 6 PASS: flipping requires_identity does not strand an existing anonymous sale';

  DELETE FROM public.order_lines
   WHERE order_id IN (SELECT id FROM public.orders WHERE source_channel = 'identity_gate_proof');
  DELETE FROM public.orders WHERE source_channel = 'identity_gate_proof';
  DELETE FROM public.talent_offerings WHERE id IN (v_gated, v_plain);
  DELETE FROM public.customers WHERE id = v_customer;
END
$proof$;

DROP FUNCTION IF EXISTS public.identity_gate_proof_draft(uuid, uuid, bigint, int);

COMMIT;
