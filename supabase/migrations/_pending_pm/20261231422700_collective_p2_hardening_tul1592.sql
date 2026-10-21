-- TUL-1592 · Friends collective P2 hardening (consultant notes on #4172). HELD in _pending_pm. Fail closed.
--
-- (a) A split line's money always adds up in the database, not only in code: the member's cost plus the owner's take
--     equals the line total. (The 90% cap and the 10% member minimum are already CHECKed by 20261231420200.)
-- (b) The share columns of agency_talent_roster are not readable by `anon`. The public roster SELECT policy exposes whole
--     rows of publicly visible members, so without this the owner's cut of each member was public. Column privileges
--     only bite when there is no table-level grant, so the table-level SELECT is revoked from anon and every OTHER
--     column is granted back (the list is read from the catalog at apply time).
-- (c) Reviews earned inside a Friends collective are collected on the OWNER's page and stay out of the member's public
--     rating (talent_profiles.rating_avg / rating_count / would_book_again_pct), which feeds directory cards, Discover
--     and the messages views. The private totals (rating_all_*) still count everything.
--
-- ROLLBACK:
--   ALTER TABLE public.order_lines DROP CONSTRAINT IF EXISTS order_lines_owner_split_sums_chk;
--   GRANT SELECT ON public.agency_talent_roster TO anon;
--   DROP TRIGGER IF EXISTS agencies_work_model_rating_recompute ON public.agencies;
--   DROP FUNCTION IF EXISTS public.agencies_work_model_rating_recompute();
--   and re-apply the talent_reviews_recompute_summary body of 20261110040000_reviews_standing_integrity.sql.

BEGIN;

-- (a) ------------------------------------------------------------------------------------------------------------
ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_owner_split_sums_chk;
ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_owner_split_sums_chk CHECK (
    owner_take_cents IS NULL OR talent_cost_cents = total_cents - owner_take_cents
  );

-- (b) ------------------------------------------------------------------------------------------------------------
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'agency_talent_roster'
     AND c.column_name NOT LIKE 'owner\_share\_%'
     AND c.column_name NOT LIKE 'pending\_share\_%';
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'agency_talent_roster has no readable columns: refusing to change grants';
  END IF;
  EXECUTE 'REVOKE SELECT ON public.agency_talent_roster FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.agency_talent_roster TO anon', v_cols);
END $$;

-- (c) ------------------------------------------------------------------------------------------------------------
-- Same function as 20261110040000 §4 with ONE added condition on the public aggregates: the review's workspace is
-- not a Friends collective. rating_all_* (private, laundering baseline) is unchanged.
CREATE OR REPLACE FUNCTION public.talent_reviews_recompute_summary(p_talent_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.talent_profiles tp
  SET
    rating_count         = pub.cnt,
    rating_avg           = pub.avg,
    would_book_again_pct = pub.wba_pct,
    rating_all_count     = allr.cnt,
    rating_all_avg       = allr.avg
  FROM
    (
      SELECT
        COUNT(*)::INTEGER                                            AS cnt,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)::numeric(3, 2) AS avg,
        CASE
          WHEN COUNT(*) FILTER (WHERE r.would_book_again IS NOT NULL) > 0
          THEN ROUND(
                 100.0 * COUNT(*) FILTER (WHERE r.would_book_again)
                 / NULLIF(COUNT(*) FILTER (WHERE r.would_book_again IS NOT NULL), 0)
               )::SMALLINT
          ELSE NULL
        END                                                         AS wba_pct
      FROM public.talent_reviews r
      WHERE r.talent_profile_id = p_talent_profile_id
        AND r.status = 'published'
        AND r.verified_paid
        AND NOT EXISTS (
          SELECT 1 FROM public.agencies a
           WHERE a.id = r.tenant_id AND a.work_model = 'friends_collective'
        )
    ) pub,
    (
      SELECT
        COUNT(*)::INTEGER                                            AS cnt,
        COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)::numeric(3, 2) AS avg
      FROM public.talent_reviews r
      WHERE r.talent_profile_id = p_talent_profile_id
        AND r.status <> 'spam'
    ) allr
  WHERE tp.id = p_talent_profile_id;
END;
$$;

-- A workspace that BECOMES (or stops being) a collective moves its members' public rating with it.
CREATE OR REPLACE FUNCTION public.agencies_work_model_rating_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t uuid;
BEGIN
  IF NEW.work_model IS DISTINCT FROM OLD.work_model
     AND (NEW.work_model = 'friends_collective' OR OLD.work_model = 'friends_collective') THEN
    FOR t IN SELECT DISTINCT r.talent_profile_id FROM public.talent_reviews r WHERE r.tenant_id = NEW.id LOOP
      PERFORM public.talent_reviews_recompute_summary(t);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.agencies_work_model_rating_recompute() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agencies_work_model_rating_recompute ON public.agencies;
CREATE TRIGGER agencies_work_model_rating_recompute
  AFTER UPDATE OF work_model ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_work_model_rating_recompute();

-- One-time: members who already have reviews inside a collective drop them from their public rating now.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN
    SELECT DISTINCT r.talent_profile_id
      FROM public.talent_reviews r
      JOIN public.agencies a ON a.id = r.tenant_id
     WHERE a.work_model = 'friends_collective'
  LOOP
    PERFORM public.talent_reviews_recompute_summary(t);
  END LOOP;
END $$;

COMMIT;
