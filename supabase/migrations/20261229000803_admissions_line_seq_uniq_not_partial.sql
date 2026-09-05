-- HOTFIX — the mint could never plan. `admissions_line_seq_uniq` was a PARTIAL
-- unique index (WHERE order_line_id IS NOT NULL AND line_seq IS NOT NULL), and
-- Postgres will not infer a partial index for ON CONFLICT unless the statement
-- carries a matching predicate — which PostgREST's `.upsert({ onConflict })`
-- never emits. So `mint-on-paid.ts`'s upsert died at PLANNING with 42P10 on
-- every settled order: the money landed, the hook threw into `onOrderPaid`'s
-- catch-all, and no admission has ever been minted after a payment.
-- `admissions` being empty platform-wide was consistent with that and looked
-- like "nothing has happened yet". Found and measured by Reservations
-- (invalid tenant → 42P10 for the upsert shape, 23503 for a plain insert).
--
-- THE PREDICATE BOUGHT NOTHING. A plain UNIQUE index treats NULLs as
-- DISTINCT by default, so rows with NULL (order_line_id, line_seq) — door
-- sales, restaurant walk-ins — coexist freely without the WHERE clause. The
-- non-partial index keeps exactly the retry-key property the mint relies on
-- ((order_line_id, line_seq) unique when both are set) and lets ON CONFLICT
-- infer it. No NULLS NOT DISTINCT anywhere in this schema.
--
-- Proof at apply time, below: the mint's exact statement with an impossible
-- tenant must now fail with 23503 (planned, refused by the FK), never 42P10.

BEGIN;

DROP INDEX IF EXISTS public.admissions_line_seq_uniq;
CREATE UNIQUE INDEX admissions_line_seq_uniq
  ON public.admissions (order_line_id, line_seq);

DO $$
DECLARE st text;
BEGIN
  BEGIN
    INSERT INTO public.admissions (tenant_id, order_line_id, line_seq, party_size)
    VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 0, 1)
    ON CONFLICT (order_line_id, line_seq) DO NOTHING;
    RAISE EXCEPTION 'proof failed: the probe insert landed';
  EXCEPTION
    WHEN foreign_key_violation THEN st := '23503';
    WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' THEN RAISE; END IF;
      RAISE EXCEPTION 'proof failed: expected 23503 (planned, refused by FK), got % %', SQLSTATE, SQLERRM;
  END;
END $$;

COMMIT;
