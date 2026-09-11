-- M0: a free sale may close without a named buyer.
--
-- orders_identified_before_payment required customer_id for every non-draft
-- row. That is correct for money — a charge without a name is a dispute with
-- no defendant. It was wrong for a $0 counter registration (R08): the till
-- already has a guest_session_id, nothing is charged, and inventing an email
-- just to satisfy the CHECK would mint a fake customer.
--
-- New rule: money still needs a customer; a zero-total order may stay on its
-- guest session alone. guest_session_id remains required for drafts that have
-- no customer (orders_draft_has_an_identity is unchanged).

BEGIN;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_identified_before_payment;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_identified_before_payment
  CHECK (
    status = 'draft'
    OR customer_id IS NOT NULL
    OR (total_cents = 0 AND guest_session_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT orders_identified_before_payment ON public.orders IS
  'Money requires a named buyer. customer_id may be null only while draft, or on a zero-total order that still carries guest_session_id.';

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'orders_identified_before_payment: no agency to probe against — skipping live CHECKs';
    RETURN;
  END IF;

  -- Money without a customer must still fail.
  BEGIN
    INSERT INTO public.orders (
      tenant_id, status, currency, subtotal_cents, total_cents, source_channel, guest_session_id
    ) VALUES (v_tenant, 'pending_payment', 'USD', 100, 100, 'probe', 'gs_probe_money');
    RAISE EXCEPTION 'orders_identified_before_payment did NOT fire for a paid-path order without a customer';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Free sale with a guest session must be accepted (then cleaned up).
  DELETE FROM public.orders
   WHERE tenant_id = v_tenant AND source_channel = 'probe' AND guest_session_id LIKE 'gs_probe%';

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, total_cents, source_channel, guest_session_id
  ) VALUES (v_tenant, 'paid', 'USD', 0, 0, 'probe', 'gs_probe_free');

  DELETE FROM public.orders
   WHERE tenant_id = v_tenant AND guest_session_id = 'gs_probe_free';
END $$;

COMMIT;
