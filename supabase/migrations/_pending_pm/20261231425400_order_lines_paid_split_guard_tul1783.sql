-- TUL-1783 · The collective split is FROZEN once money moved, in the database too. HELD in _pending_pm (PM applies).
-- APPLY AFTER 20261231424700 (it provides public.caller_is_direct_connection(), TUL-1748) and after 20261231420200 /
-- 20261231422700 (split columns, stale_clear trigger).
--
-- TUL-1718 froze a Friends-collective split in app code (collective-split-apply.ts: no re-split once any
-- booking_transactions row for the order is past draft/cancelled/failed, or has paid_at). Nothing in the database
-- stopped a service-role write from changing a paid split: order_lines had only the stale_clear and write_event triggers.
--
-- A line "carries a split" when owner_take_cents or owner_share_snapshot is set (written by the split, see 20261231420200).
-- Once the order is paid (the SAME definition as the app rule: a transaction on the order whose status is not draft,
-- cancelled or failed, OR whose paid_at is set), the trigger refuses:
--   * UPDATE of a split-carrying line that changes any split input or output
--     (order_id, talent_profile_id, owner_tenant_id, units, unit_cents, total_cents, discount_cents,
--      talent_cost_cents, owner_take_cents, owner_share_snapshot); discount_cents is frozen because a line's own
--      discount feeds refund netting (lineNetCents, TUL-1724) and so changes what each payee is owed;
--   * UPDATE that would START a split on a line of a paid order (a split applied after payment);
--   * DELETE of a split-carrying line.
-- Everything else is untouched: lines without a split (every non-collective workspace), label/refunded_cents/stamps/price
-- phase on any line, any draft/cancelled/failed order, and cascade deletes when the order/workspace itself is deleted.
--
-- Deliberate adjustment (a refund correction, a data fix) is possible, but never by accident: the statement must be in a
-- transaction that first runs `SELECT set_config('tulala.paid_split_adjust', 'on', true)` AND the caller must be the
-- service role (verified JWT role) or a direct connection (public.caller_is_direct_connection(), TUL-1748; an EMPTY jwt
-- role is NOT a bypass). No app code sets it today. The flag is transaction-local, so it cannot leak to the next
-- request on a pooled connection.
--
-- Both functions are SECURITY DEFINER with a pinned search_path: the guard has to see the order and its transactions
-- whatever RLS says about the caller. As invoker, a caller whose RLS cannot see the order's transactions would read
-- "not frozen" and the guard would fail OPEN. They are read-only.
--
-- Trigger name sorts AFTER order_lines_owner_split_stale_clear (20261231422700), so this sees the row as it will be
-- stored, including a split cleared by the stale_clear trigger.
--
-- GRANTS (20261231415700: new functions start with no EXECUTE for anon/authenticated): order_is_money_frozen is granted
-- to authenticated and service_role so a legitimate edit on an UNPAID order never meets "permission denied"; anon gets
-- nothing. The trigger function is only ever invoked by the trigger.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS order_lines_paid_split_guard ON public.order_lines;
--   DROP FUNCTION IF EXISTS public.order_lines_paid_split_guard();
--   DROP FUNCTION IF EXISTS public.order_is_money_frozen(uuid);

BEGIN;

CREATE OR REPLACE FUNCTION public.order_is_money_frozen(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.booking_transactions bt
     WHERE bt.order_id = p_order_id
       AND (bt.status NOT IN ('draft', 'cancelled', 'failed') OR bt.paid_at IS NOT NULL)
  );
$$;

COMMENT ON FUNCTION public.order_is_money_frozen(uuid) IS
  'TUL-1783: true when any transaction on the order took or holds money (status not draft/cancelled/failed, or paid_at set). Mirrors NON_MONEY_TRANSACTION_STATUSES in collective-split-apply.ts. SECURITY DEFINER so RLS cannot hide the transactions from the guard.';

CREATE OR REPLACE FUNCTION public.order_lines_paid_split_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_old_has  boolean;
  v_new_has  boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_has := OLD.owner_take_cents IS NOT NULL OR OLD.owner_share_snapshot IS NOT NULL;
    v_new_has := NEW.owner_take_cents IS NOT NULL OR NEW.owner_share_snapshot IS NOT NULL;

    IF NOT v_old_has AND NOT v_new_has THEN
      RETURN NEW; -- no split before or after: not this guard's business
    END IF;
    IF NEW.order_id IS NOT DISTINCT FROM OLD.order_id
       AND NEW.talent_profile_id IS NOT DISTINCT FROM OLD.talent_profile_id
       AND NEW.owner_tenant_id IS NOT DISTINCT FROM OLD.owner_tenant_id
       AND NEW.units IS NOT DISTINCT FROM OLD.units
       AND NEW.unit_cents IS NOT DISTINCT FROM OLD.unit_cents
       AND NEW.total_cents IS NOT DISTINCT FROM OLD.total_cents
       AND NEW.discount_cents IS NOT DISTINCT FROM OLD.discount_cents
       AND NEW.talent_cost_cents IS NOT DISTINCT FROM OLD.talent_cost_cents
       AND NEW.owner_take_cents IS NOT DISTINCT FROM OLD.owner_take_cents
       AND NEW.owner_share_snapshot IS NOT DISTINCT FROM OLD.owner_share_snapshot
    THEN
      RETURN NEW; -- label, refunded_cents, booking stamps, price phase...: free to change
    END IF;
  ELSE
    IF OLD.owner_take_cents IS NULL AND OLD.owner_share_snapshot IS NULL THEN
      RETURN OLD;
    END IF;
    -- A cascade from the order (or the workspace) being deleted is that deletion's business, not a split edit.
    -- (SECURITY DEFINER: RLS cannot hide a still-existing order from this check.)
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = OLD.order_id) THEN
      RETURN OLD;
    END IF;
  END IF;

  IF NOT public.order_is_money_frozen(OLD.order_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Deliberate, transaction-local adjustment, service role or a direct connection only.
  IF current_setting('tulala.paid_split_adjust', true) = 'on' THEN
    v_role := COALESCE(
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      ''
    );
    IF v_role = 'service_role' OR public.caller_is_direct_connection() THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
  END IF;

  RAISE EXCEPTION 'The collective split of order % is frozen: money has moved on it.', OLD.order_id
    USING ERRCODE = '23514',
          HINT = 'A paid split cannot change or be deleted. Refund the order instead.';
END;
$$;

COMMENT ON FUNCTION public.order_lines_paid_split_guard() IS
  'TUL-1783: once money moved on an order, its collective split lines cannot change or be deleted (DB twin of the TUL-1718 app rule). SECURITY DEFINER; bypass only in a transaction with tulala.paid_split_adjust=on AND service_role or a direct connection.';

REVOKE ALL ON FUNCTION public.order_lines_paid_split_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.order_lines_paid_split_guard() FROM anon;
REVOKE ALL ON FUNCTION public.order_is_money_frozen(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.order_is_money_frozen(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.order_is_money_frozen(uuid) TO authenticated, service_role;

DROP TRIGGER IF EXISTS order_lines_paid_split_guard ON public.order_lines;
CREATE TRIGGER order_lines_paid_split_guard
  BEFORE UPDATE OR DELETE ON public.order_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.order_lines_paid_split_guard();

COMMIT;
