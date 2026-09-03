-- P0: the commission context fed a LINE TOTAL into a PER-UNIT field.
--
-- FOUND BY: the Orders & Checkout lane while staging unrelated data; routed to
-- Finance by the Platform Features Director; re-verified here line by line
-- against the code and against production before this was written.
--
-- ── The grain mismatch ──────────────────────────────────────────────────────
-- On `inquiry_offer_line_items`, `unit_price` is PER UNIT but `talent_cost` is
-- the LINE TOTAL. The convert RPC in 20261226000004 proves it twice:
--
--   • it DIVIDES to get a rate:  talent_cost / units
--   • it subtracts total from total:  SUM(total_price - talent_cost)
--
-- `engine_load_commission_context` passed BOTH straight through as if both were
-- per-unit, and `lib/billing/commission.ts` then multiplies both by `units`:
--
--   subtotal    = Σ round(units × unit_price_cents)   -- correct
--   talentFull  = Σ round(units × talent_cost_cents)  -- WRONG: total × units
--
-- So for any line with units > 1 the talent's cost was multiplied a second
-- time. Measured on a staged line (2 units, unit_price 150.005, talent_cost
-- 200.00): a $200.00 talent cost became $400.00.
--
-- This is MONEY, not reporting. `lib/payments/transfers.ts` pays
-- `snap.talent_net_cents` straight through as the transfer amount, so an
-- inflated snapshot moves real funds out of the platform balance — more to the
-- talent than the client ever paid.
--
-- It could also simply throw: commission.ts refuses `talent_cost_cents >
-- unit_price_cents`, and comparing a line TOTAL against a PER-UNIT price trips
-- on ordinary data (20000 > 15001), failing conversion with
-- `talent_cost_exceeds_price`. Wrong money, or a dead convert button.
--
-- ── Blast radius: none. Measured on production before writing this ──────────
--   booking_commission_snapshot 0 · booking_transactions 0 · booking_payouts 0
--   inquiry_offer_line_items 0 (so 0 multi-unit lines) · agency_bookings 2
-- Nothing to repair and nobody to pay back. Fix-before-first-use.
--
-- ── The fix, and why not the obvious one ───────────────────────────────────
-- The obvious fix is to divide: pass `talent_cost / units` so both are per-unit.
-- Rejected. Division then multiplication reintroduces rounding drift ($200.00
-- over 3 units → 6667¢ × 3 = 20001¢), and the engine's lane reconciler would
-- silently absorb that into platform_fee — papering over an inexactness rather
-- than not creating it. Money should be exact by construction.
--
-- Instead the context now emits LINE TOTALS with `units = 1`. The resolver's
-- `units × X` is then exact for every line, and its three uses of `.units` (the
-- negative guard and the two sums) all behave correctly at 1.
--
-- Two further benefits:
--   • The `talent_cost_exceeds_price` guard becomes a TOTAL-vs-TOTAL comparison,
--     which is the semantically correct one, and the false throw disappears.
--   • It fixes a second, smaller bug with the same root: the context computed
--     `round(unit_price × 100) × units` while the order stores
--     `round(total_price × 100)`. For 150.005 × 2 those differ (30002 vs
--     30001). Using `total_price` makes the snapshot agree with what the client
--     actually agreed to, which is the authoritative figure.
--
-- ── Why this migration patches rather than restates the function ───────────
-- `engine_load_commission_context` is ~150 lines. Restating it here would mean
-- transcribing a body this migration does not otherwise touch, and a
-- transcription slip in a money function is worse than the bug being fixed. So
-- the body is read from `pg_proc`, patched by exact string replacement, and
-- re-installed — with assertions that FAIL LOUDLY if the source no longer
-- contains what is expected, or if the patch did not take.

DO $outer$
DECLARE
  v_src     TEXT;
  v_patched TEXT;
  v_old     TEXT := E'          \'units\', li.units::numeric,\n          \'unit_price_cents\', (li.unit_price * 100)::int,';
  v_new     TEXT := E'          -- GRAIN: totals with units=1, never per-unit. `talent_cost` is a LINE\n          -- TOTAL on this table while `unit_price` is per unit, so passing both\n          -- as per-unit multiplied the talent cost by units a second time.\n          -- `units` is 1 so the resolver''s `units * X` is exact by construction,\n          -- and `total_price` (not unit_price * units) is what the client agreed to.\n          \'units\', 1::numeric,\n          \'unit_price_cents\', (li.total_price * 100)::int,';
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'engine_load_commission_context not found — cannot patch a function that does not exist';
  END IF;

  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION
      'engine_load_commission_context no longer contains the expected per-unit line-item block. It has been changed since this fix was written — re-check the grain before applying.';
  END IF;

  v_patched := replace(v_src, v_old, v_new);

  IF position('''units'', 1::numeric,' IN v_patched) = 0
     OR position('(li.total_price * 100)::int' IN v_patched) = 0 THEN
    RAISE EXCEPTION 'grain patch did not take — refusing to install an unverified body';
  END IF;
  IF position('(li.unit_price * 100)::int' IN v_patched) > 0 THEN
    RAISE EXCEPTION 'the per-unit price read survived the patch — refusing to install';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_patched
  );
END
$outer$;

-- Prove the installed function is the patched one, not the one we read.
DO $verify$
DECLARE v_src TEXT;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF position('''units'', 1::numeric,' IN v_src) = 0 THEN
    RAISE EXCEPTION 'post-install check: units=1 not present in the live function';
  END IF;
  IF position('(li.unit_price * 100)::int' IN v_src) > 0 THEN
    RAISE EXCEPTION 'post-install check: the per-unit price read is still live';
  END IF;
END
$verify$;
