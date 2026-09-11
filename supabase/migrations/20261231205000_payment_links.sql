-- Package 1 task 5: payment links reserve outstanding then mint /pay/<code>.

BEGIN;

ALTER TABLE public.order_collection_reservations
  DROP CONSTRAINT IF EXISTS order_collection_reservations_method_known;
ALTER TABLE public.order_collection_reservations
  ADD CONSTRAINT order_collection_reservations_method_known
  CHECK (method IN ('cash', 'online_card', 'terminal', 'link'));

-- The reserve RPC still hard-codes three methods. Widen it in place so a
-- link claim is a first-class method, not an online_card disguise.
DO $widen$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(
    'public.pos_reserve_collection(uuid,uuid,text,bigint,text,uuid,integer,integer)'::regprocedure
  ) INTO src;
  IF src IS NULL THEN
    RAISE EXCEPTION 'pos_reserve_collection is missing; cannot widen method list';
  END IF;
  src := replace(
    src,
    'p_method NOT IN (''cash'', ''online_card'', ''terminal'')',
    'p_method NOT IN (''cash'', ''online_card'', ''terminal'', ''link'')'
  );
  IF position('''link''' in src) = 0 THEN
    RAISE EXCEPTION 'pos_reserve_collection method widen did not land';
  END IF;
  EXECUTE src;
END
$widen$;

CREATE TABLE IF NOT EXISTS public.payment_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  code          text NOT NULL,
  amount_cents  bigint NOT NULL,
  currency      text NOT NULL,
  provider      text NOT NULL,
  provider_ref  text,
  status        text NOT NULL DEFAULT 'open',
  expires_at    timestamptz NOT NULL,
  created_by    uuid,
  operation_key text NOT NULL,
  reservation_id uuid REFERENCES public.order_collection_reservations(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_links_code_shape CHECK (char_length(btrim(code)) BETWEEN 8 AND 80),
  CONSTRAINT payment_links_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT payment_links_provider_known CHECK (provider IN ('stripe', 'mercadopago', 'mock')),
  CONSTRAINT payment_links_status_known CHECK (status IN ('open', 'paid', 'expired', 'cancelled')),
  CONSTRAINT payment_links_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_links_code_uniq ON public.payment_links (code);
CREATE UNIQUE INDEX IF NOT EXISTS payment_links_operation_key_uniq ON public.payment_links (tenant_id, operation_key);
CREATE INDEX IF NOT EXISTS payment_links_open_expiry_idx ON public.payment_links (expires_at) WHERE status = 'open';

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_links_select_staff ON public.payment_links;
CREATE POLICY payment_links_select_staff ON public.payment_links
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.payment_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_links TO authenticated;
GRANT ALL ON public.payment_links TO service_role;

CREATE OR REPLACE FUNCTION public.reap_payment_links(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payment_links%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.payment_links
     WHERE status = 'open' AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.payment_links SET status = 'expired' WHERE id = v_row.id AND status = 'open';
    IF v_row.reservation_id IS NOT NULL THEN
      PERFORM public.pos_settle_collection_reservation(v_row.reservation_id, NULL, 'released');
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.reap_payment_links(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_payment_links(integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.reap_payment_links(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reap_payment_links is executable by anon';
  END IF;
END
$check$;

COMMIT;
