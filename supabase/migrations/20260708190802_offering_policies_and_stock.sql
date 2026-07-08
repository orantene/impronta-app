-- W3-6 + W3-8: per-offering booking policies + product stock enforcement.

-- Cancellation window (hours before the appointment when free cancellation
-- ends) and free-reserve expiry (days an unpaid free reserve is held).
-- Display + policy config now; the automated expiry sweep is a follow-up cron.
ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS cancellation_hours int
    CHECK (cancellation_hours IS NULL OR cancellation_hours >= 0),
  ADD COLUMN IF NOT EXISTS free_reserve_expires_days int
    CHECK (free_reserve_expires_days IS NULL OR free_reserve_expires_days > 0);

-- Atomic stock decrement for product purchases: succeeds only when enough
-- stock remains (classic oversell guard under row lock). NULL inventory_qty
-- means unlimited and always succeeds.
CREATE OR REPLACE FUNCTION public.reserve_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RETURN false;
  END IF;
  -- Unlimited stock: nothing to decrement.
  PERFORM 1 FROM public.talent_offerings
   WHERE id = p_offering_id AND inventory_qty IS NULL;
  IF FOUND THEN
    RETURN true;
  END IF;
  UPDATE public.talent_offerings
     SET inventory_qty = inventory_qty - p_qty,
         updated_at = now()
   WHERE id = p_offering_id
     AND inventory_qty >= p_qty;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Release stock (cancellation/failure compensation).
CREATE OR REPLACE FUNCTION public.release_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.talent_offerings
     SET inventory_qty = inventory_qty + p_qty,
         updated_at = now()
   WHERE id = p_offering_id
     AND inventory_qty IS NOT NULL;
$$;
