-- TUL-1757: atomic no-show counter.
-- markBookingNoShow used to read customers.no_shows and write back +1, so two overlapping marks counted the
-- client once or twice depending on timing, and a mark that lost the confirmed -> no_show race still counted.
-- The action now calls this only when ITS update flipped the booking row, and the increment itself is one
-- statement, so concurrent calls add up. Additive: one new function, no table change.
-- HELD: PM applies (supabase/migrations/_pending_pm).

CREATE OR REPLACE FUNCTION public.increment_customer_no_shows(p_customer_id uuid)
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.customers
     SET no_shows = no_shows + 1
   WHERE id = p_customer_id
  RETURNING no_shows;
$$;

COMMENT ON FUNCTION public.increment_customer_no_shows(uuid) IS
  'TUL-1757: atomically add one no-show to a customer and return the new count (NULL when the customer does not exist). service_role only; the caller proves the booking flipped to no_show first.';

REVOKE ALL ON FUNCTION public.increment_customer_no_shows(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_customer_no_shows(uuid) TO service_role;
