-- T1-04 A: money must not require a name. A PRODUCT may.
--
-- Timestamp sorts after 20261230002200. Do not use a calendar 2026-09 date:
-- `orders` itself is created at 20261228000142, and a calendar-dated file
-- would sort BEFORE the table it alters on any replay from zero.
--
-- WHAT WAS WRONG. `orders_identified_before_payment` demanded a customer for
-- every paid order, so the commonest transaction on a counter — an anonymous
-- cash walk-in buying a coffee — was impossible, and `customers_has_a_key`
-- (rightly) forbids inventing a blank walk-in customer to satisfy it. Meanwhile
-- NOTHING checked the cases where a name is genuinely required: a ticket the
-- door checks a person against, something that has to be delivered, credit the
-- buyer spends later.
--
-- THE NEW SHAPE.
--   1. The OFFERING says whether it needs a name, and why.
--   2. A paid order is legal when it can be RETRIEVED: a customer, or a guest
--      session together with the receipt code that `/r/<code>` already renders.
--   3. A trigger refuses to let an order leave draft unnamed when any line
--      sells an offering that demands a name, and NAMES that offering in the
--      error detail so the till can say which item and why.
--
-- (2) is a CHECK because it is a property of one row. (3) has to be a trigger
-- because it depends on the order's lines and their offerings, which a CHECK
-- constraint cannot see.

BEGIN;

-- ── 1. The offering declares its own identity demand. ───────────────────────

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS requires_identity boolean NOT NULL DEFAULT false;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS identity_reason text;

COMMENT ON COLUMN public.talent_offerings.requires_identity IS
  'This product needs a named buyer whatever it costs. Distinct from require_account_to_book, which demands an ACCOUNT; this demands only an email or a phone.';

COMMENT ON COLUMN public.talent_offerings.identity_reason IS
  'WHY a name is needed: attendee_names | delivery | entitlement. Required exactly when requires_identity, so a refusal can always say why.';

-- The flag and the reason are ONE fact. A flag with no reason produces a
-- refusal that cannot explain itself; a reason with no flag is a setting
-- nothing reads.
--
-- WRITTEN AS A CASE, DELIBERATELY. The obvious form,
--   (requires_identity AND identity_reason IN (...)) OR (NOT requires_identity AND identity_reason IS NULL)
-- LETS THE BAD ROW THROUGH: with the flag true and the reason NULL, the first
-- arm is TRUE AND NULL = NULL, the second is FALSE, and NULL OR FALSE is NULL,
-- which a CHECK treats as satisfied. The first version of this migration had
-- exactly that hole and the proof block below is what caught it. CASE gives
-- each branch a boolean that cannot be NULL.
ALTER TABLE public.talent_offerings
  DROP CONSTRAINT IF EXISTS talent_offerings_identity_reason_paired;

-- Both columns are introduced by THIS migration, so no live row can be
-- half-filled. The one thing that can leave one behind is a re-apply after a
-- failed run of this same file, which is how the NULL hole above was found.
-- Normalise toward the SAFE side (keep the demand, give it the commonest
-- reason) rather than clearing the flag, which would silently sell a ticket to
-- nobody.
UPDATE public.talent_offerings
   SET identity_reason = 'attendee_names'
 WHERE requires_identity IS TRUE
   AND (identity_reason IS NULL
        OR identity_reason NOT IN ('attendee_names', 'delivery', 'entitlement'));

UPDATE public.talent_offerings
   SET identity_reason = NULL
 WHERE requires_identity IS FALSE
   AND identity_reason IS NOT NULL;

ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_identity_reason_paired
  CHECK (
    CASE
      WHEN requires_identity
        THEN identity_reason IS NOT NULL
         AND identity_reason IN ('attendee_names', 'delivery', 'entitlement')
      ELSE identity_reason IS NULL
    END
  );

CREATE INDEX IF NOT EXISTS talent_offerings_requires_identity_idx
  ON public.talent_offerings (id)
  WHERE requires_identity IS TRUE;

-- ── 2. A paid order must be RETRIEVABLE, not necessarily named. ─────────────

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_identified_before_payment;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_identified_before_payment
  CHECK (
    status = 'draft'
    OR customer_id IS NOT NULL
    OR (guest_session_id IS NOT NULL AND receipt_code IS NOT NULL)
  );

COMMENT ON CONSTRAINT orders_identified_before_payment ON public.orders IS
  'A closed order must be reachable: a customer, or a guest session plus the receipt code /r/<code> resolves. Money alone never demands a name; talent_offerings.requires_identity does, enforced by orders_require_identity_for_lines.';

-- ── 3. The product's demand, enforced when the order leaves draft. ──────────

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
  -- A draft may be anything; it is not a sale yet.
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- A named buyer satisfies every demand.
  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only the MOVE out of draft is gated. An already-closed anonymous order
  -- being touched again (a refund, a rollup) must not be re-refused: the sale
  -- happened, and blocking the write would strand the money, not the identity.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT o.title, o.identity_reason
    INTO v_title, v_reason
    FROM public.order_lines l
    JOIN public.talent_offerings o ON o.id = l.offering_id
   WHERE l.order_id = NEW.id
     AND o.requires_identity IS TRUE
   ORDER BY l.sort_order, l.id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'order % cannot leave draft without a customer', NEW.id
      USING ERRCODE = 'check_violation',
            DETAIL  = format(
              'offering %L requires identity (%s)',
              COALESCE(v_title, 'unnamed offering'),
              COALESCE(v_reason, 'unspecified')
            ),
            HINT    = 'Attach a customer, or sell an offering that does not require identity.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.orders_require_identity_for_lines() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orders_require_identity_for_lines() TO service_role;

COMMENT ON FUNCTION public.orders_require_identity_for_lines() IS
  'T1-04: refuses to let an order leave draft with no customer when a line sells an offering whose requires_identity is true. The DETAIL names the offering so the surface can say which item and why.';

DROP TRIGGER IF EXISTS orders_require_identity_for_lines_trg ON public.orders;
CREATE TRIGGER orders_require_identity_for_lines_trg
  BEFORE INSERT OR UPDATE OF status, customer_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_require_identity_for_lines();

-- ── 4. Proof. Runs the behaviour and cleans up after itself. ───────────────

DO $proof$
DECLARE
  v_tenant   uuid;
  v_offering uuid;
  v_walkin   uuid;
  v_ticket   uuid;
  v_customer uuid;
  v_detail   text;
  v_status   text;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY id LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'identity proof: no agency to probe against, skipping';
    RETURN;
  END IF;

  DELETE FROM public.order_lines
   WHERE order_id IN (SELECT id FROM public.orders WHERE source_channel = 'identity_proof');
  DELETE FROM public.orders WHERE source_channel = 'identity_proof';

  -- PROOF 1: an anonymous PAID walk-in, anchored by its receipt code.
  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, receipt_code
  ) VALUES (
    v_tenant, 'paid', 'USD', 900, 0, 0, 900, 'identity_proof',
    'gs_identity_proof_walkin', 'identityproofwalkin01'
  ) RETURNING id INTO v_walkin;
  RAISE NOTICE 'PROOF 1 PASS: anonymous paid walk-in accepted, order %', v_walkin;

  -- PROOF 2: money with nothing to retrieve it by is still refused.
  BEGIN
    INSERT INTO public.orders (
      tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
      total_cents, source_channel, guest_session_id
    ) VALUES (
      v_tenant, 'paid', 'USD', 900, 0, 0, 900, 'identity_proof', 'gs_identity_proof_nocode'
    );
    RAISE EXCEPTION 'PROOF 2 FAIL: a paid order with no customer and no receipt code was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PROOF 2 PASS: paid order with no retrieval anchor refused';
  END;

  -- PROOF 3: a ticket that needs attendee names refuses, and says which.
  INSERT INTO public.talent_offerings (
    tenant_id, owner_kind, title, amount_cents, currency, status,
    requires_identity, identity_reason
  ) VALUES (
    v_tenant, 'workspace', 'Identity Proof Gala Ticket', 5000, 'USD', 'published',
    true, 'attendee_names'
  ) RETURNING id INTO v_offering;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, receipt_code
  ) VALUES (
    v_tenant, 'draft', 'USD', 5000, 0, 0, 5000, 'identity_proof',
    'gs_identity_proof_ticket', 'identityproofticket01'
  ) RETURNING id INTO v_ticket;

  -- `order_lines_payee_xor` wants exactly one of talent_profile_id /
  -- owner_tenant_id. A workspace-owned offering is paid to the workspace.
  INSERT INTO public.order_lines (
    order_id, tenant_id, offering_id, owner_tenant_id, label, units, unit_cents, total_cents, sort_order
  ) VALUES (
    v_ticket, v_tenant, v_offering, v_tenant, 'Identity Proof Gala Ticket', 1, 5000, 5000, 0
  );

  BEGIN
    UPDATE public.orders SET status = 'paid' WHERE id = v_ticket;
    RAISE EXCEPTION 'PROOF 3 FAIL: a ticket needing attendee names closed with no customer';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
      RAISE NOTICE 'PROOF 3 PASS: ticket refused, detail: %', v_detail;
  END;

  -- PROOF 4: the flag and the reason cannot come apart, in EITHER direction.
  BEGIN
    INSERT INTO public.talent_offerings (tenant_id, owner_kind, title, requires_identity, identity_reason)
    VALUES (v_tenant, 'workspace', 'Identity Proof Unpaired', true, NULL);
    RAISE EXCEPTION 'PROOF 4 FAIL: requires_identity with no reason was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PROOF 4a PASS: a flag with no reason is refused';
  END;

  BEGIN
    INSERT INTO public.talent_offerings (tenant_id, owner_kind, title, requires_identity, identity_reason)
    VALUES (v_tenant, 'workspace', 'Identity Proof Unpaired', false, 'delivery');
    RAISE EXCEPTION 'PROOF 4 FAIL: a reason with no flag was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PROOF 4b PASS: a reason with no flag is refused';
  END;

  BEGIN
    INSERT INTO public.talent_offerings (tenant_id, owner_kind, title, requires_identity, identity_reason)
    VALUES (v_tenant, 'workspace', 'Identity Proof Unpaired', true, 'not_a_reason');
    RAISE EXCEPTION 'PROOF 4 FAIL: an unknown reason was accepted';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'PROOF 4c PASS: an unknown reason is refused';
  END;

  -- PROOF 5: the same ticket, with a named buyer, closes.
  INSERT INTO public.customers (tenant_id, email, display_name)
  VALUES (v_tenant, 'identity-proof@example.test', 'Identity Proof')
  RETURNING id INTO v_customer;

  UPDATE public.orders
     SET customer_id = v_customer, status = 'paid'
   WHERE id = v_ticket;

  SELECT status::text INTO v_status FROM public.orders WHERE id = v_ticket;
  IF v_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'PROOF 5 FAIL: named ticket did not close, status %', v_status;
  END IF;
  RAISE NOTICE 'PROOF 5 PASS: the same ticket closed once it had a customer';

  -- Clean up. Nothing this block created may outlive it.
  DELETE FROM public.order_lines WHERE order_id IN (v_ticket, v_walkin);
  DELETE FROM public.orders WHERE id IN (v_ticket, v_walkin);
  DELETE FROM public.talent_offerings WHERE id = v_offering;
  DELETE FROM public.customers WHERE id = v_customer;
END
$proof$;

COMMIT;
