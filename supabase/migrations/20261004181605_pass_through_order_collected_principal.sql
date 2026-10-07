-- Restored 2026-10-07 from production schema_migrations.statements (read-only
-- query). Applied to production by hand on 2026-10-04; the file was never
-- committed, which blocked `supabase db push`. Content is verbatim.
-- NOTE: 20261230002310_pos_collection_reservations.sql sorts after this file and
-- defines the OLD versions of these functions, so on a fresh database this
-- version is overwritten. 20261231346300_reapply_order_collected_principal.sql
-- re-applies it last so a fresh database matches production.

-- Pass-through Checkout stores service principal in net_amount_cents and the
-- card/processing surcharge in the gross surplus (see createPurchase +
-- completeOrder). order_collected_cents / guard_order_not_overcollected used
-- to sum gross against orders.total_cents, so a seller-pays $100 → $101.50
-- charge could never reach `paid` (overcollect 10150 > 10000). Count principal.

CREATE OR REPLACE FUNCTION public.order_collected_cents(
  p_order_id              uuid,
  p_excluding_transaction uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN t.net_amount_cents IS NOT NULL
             AND t.net_amount_cents >= 0
             AND t.net_amount_cents <= t.gross_amount_cents
          THEN t.net_amount_cents
        ELSE t.gross_amount_cents
      END
    ),
    0
  )::bigint
    FROM public.booking_transactions t
   WHERE t.order_id = p_order_id
     AND t.refund_of_transaction_id IS NULL
     AND (p_excluding_transaction IS NULL OR t.id <> p_excluding_transaction)
     AND t.status = ANY (public.order_money_statuses());
$$;

COMMENT ON FUNCTION public.order_collected_cents(uuid, uuid) IS
  'Cents of service principal already collected against an order (net_amount_cents when present and ≤ gross; else gross). Shared by pos_reserve_collection and guard_order_not_overcollected so pass-through surcharges do not count as overcollection.';

CREATE OR REPLACE FUNCTION public.guard_order_not_overcollected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     bigint;
  v_collected bigint;
  v_add       bigint;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.refund_of_transaction_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.status = ANY (public.order_money_statuses())) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = ANY (public.order_money_statuses())
     AND OLD.gross_amount_cents = NEW.gross_amount_cents
     AND OLD.net_amount_cents IS NOT DISTINCT FROM NEW.net_amount_cents
     AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id THEN
    RETURN NEW;
  END IF;

  SELECT o.total_cents INTO v_total
    FROM public.orders o WHERE o.id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_collected := public.order_collected_cents(NEW.order_id, NEW.id);

  IF NEW.net_amount_cents IS NOT NULL
     AND NEW.net_amount_cents >= 0
     AND NEW.net_amount_cents <= NEW.gross_amount_cents THEN
    v_add := NEW.net_amount_cents;
  ELSE
    v_add := NEW.gross_amount_cents;
  END IF;

  IF v_collected + v_add > v_total THEN
    RAISE EXCEPTION
      'booking_transactions: order % already has %/% cents collected; a further % cents would overcollect it',
      NEW.order_id, v_collected, v_total, v_add
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_order_not_overcollected() IS
  'Refuse money-received status when order principal would overcollect. Counts net_amount_cents (pass-through principal) so Checkout gross surcharges do not block settle.';
