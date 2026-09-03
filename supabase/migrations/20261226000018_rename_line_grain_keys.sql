-- Rename the commission context's line-item JSON keys to state their grain.
--
-- FOLLOWS 20261226000017, which fixed the P0 where a LINE TOTAL was passed in a
-- per-unit field and multiplied by units a second time, inflating what the
-- talent was paid.
--
-- That migration fixed the VALUES. It left the NAMES, and after it the names
-- were MORE wrong than before: previously `unit_price_cents` genuinely held a
-- unit price and only `talent_cost_cents` lied about its grain; afterwards both
-- carry line totals and neither name said so.
--
-- A field name that lies about grain is precisely what let the original bug
-- survive review — the next person adding a line-item consumer multiplies by
-- `units` because the field is called `unit_price`, and it looks correct.
--
--   'unit_price_cents'  ->  'line_total_cents'
--   'talent_cost_cents' ->  'talent_cost_total_cents'
--
-- ── This MUST ship with the TypeScript rename, not before or after ──────────
-- `commission-engine.ts` casts this JSON straight to `OfferLineItemForResolver[]`
-- with no mapping layer:
--
--     offerLineItems: p.offer_line_items as OfferLineItemForResolver[]
--
-- A cast does not rename anything. If the keys and the interface fields ever
-- disagree, every amount arrives `undefined`, `Math.round(units * undefined)`
-- is NaN, and the lane arithmetic produces garbage rather than an error at the
-- boundary. So the two halves are one change.
--
-- ── Why this PATCHES rather than restates ──────────────────────────────────
-- Same reasoning as 20261226000017: the function is ~150 lines this migration
-- does not otherwise touch, and a transcription slip in a money function would
-- be worse than the problem being fixed. It reads the installed body, asserts
-- the expected source is present, replaces exactly, and re-asserts afterwards.

DO $$
DECLARE
  v_src   TEXT;
  v_new   TEXT;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'engine_load_commission_context not found';
  END IF;

  -- Refuse if 20261226000017 has not been applied: renaming the keys on a body
  -- that still reads `unit_price` per-unit would relabel the bug rather than
  -- follow the fix.
  IF position('li.total_price * 100' IN v_src) = 0 THEN
    RAISE EXCEPTION
      'expected the line-grain fix (20261226000017) to be applied first — `li.total_price * 100` not found';
  END IF;

  IF position('''unit_price_cents''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'expected key ''unit_price_cents'' not present — has this already run?';
  END IF;

  v_new := replace(v_src, '''unit_price_cents''', '''line_total_cents''');
  v_new := replace(v_new, '''talent_cost_cents''', '''talent_cost_total_cents''');
  -- The inline comment names the old field too; keep it accurate.
  v_new := replace(v_new, 'force talent_cost_cents = 0', 'force talent_cost_total_cents = 0');

  IF v_new = v_src THEN
    RAISE EXCEPTION 'rename produced no change — the source was not what was expected';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id uuid) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_new
  );
END $$;

-- Re-assert against the INSTALLED function, not the variable we just built.
DO $$
DECLARE v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF position('''line_total_cents''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'rename did not take: ''line_total_cents'' absent';
  END IF;
  IF position('''talent_cost_total_cents''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'rename did not take: ''talent_cost_total_cents'' absent';
  END IF;
  IF position('''unit_price_cents''' IN v_src) > 0 THEN
    RAISE EXCEPTION 'stale key ''unit_price_cents'' survived the rename';
  END IF;
  -- The grain fix itself must still be intact.
  IF position('''units'', 1' IN v_src) = 0 OR position('li.total_price * 100' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the line-grain fix was lost while renaming keys';
  END IF;
END $$;
