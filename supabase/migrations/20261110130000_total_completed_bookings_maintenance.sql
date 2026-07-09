-- talent_profiles.total_completed_bookings maintenance (audit item 6).
--
-- Why: the column exists (added 20260907180000_field_architecture_v1) but
-- NOTHING writes it. It has been permanently 0 for every talent since it was
-- added, which silently breaks three consumers:
--   - web/src/lib/reviews/review-owner-actions.ts (loadReviewAnalyticsAction)
--     divides review count by this value to derive the talent's "response
--     rate" stat on their own Reviews page — with the denominator always 0
--     the stat can never render (responseRatePct stays null).
--   - web/src/lib/server-actions/search-talent.ts — surfaces the dead 0 in
--     public search results.
--   - web/src/lib/server-actions/admin-talent-metrics.ts — surfaces the dead
--     0 in the admin metrics ribbon (web/src/components/admin/shell/internal/
--     metrics-ribbon.tsx "N bookings completed" pill never fires).
--
-- Fix: maintain it going forward via triggers (recompute, not increment, so
-- it self-heals and stays idempotent under retries/backfills), plus a
-- one-time backfill for existing rows. A booking counts once it reaches
-- status = 'completed' (public.booking_status enum), counted per talent via
-- booking_talent. Mirrors the style of talent_reviews_recompute_summary in
-- 20261110040000_reviews_standing_integrity.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Recompute function — SECURITY DEFINER, idempotent set-based COUNT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_recompute_completed_bookings(p_talent_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_talent_profile_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.talent_profiles tp
  SET total_completed_bookings = COALESCE(cnt.n, 0)
  FROM (
    SELECT COUNT(DISTINCT b.id)::INT AS n
    FROM public.agency_bookings b
    JOIN public.booking_talent bt ON bt.booking_id = b.id
    WHERE bt.talent_profile_id = p_talent_profile_id
      AND b.status = 'completed'
  ) cnt
  WHERE tp.id = p_talent_profile_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. agency_bookings AFTER INSERT OR UPDATE OF status — recompute every
--    talent on the booking whenever a completion or un-completion happens.
--    (AFTER INSERT is included so a booking created directly as 'completed'
--    is still counted; loop over booking_talent since a booking can have
--    multiple talents.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_bookings_recompute_completed_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'completed')
     OR (TG_OP = 'UPDATE' AND (NEW.status = 'completed' OR OLD.status = 'completed')) THEN
    FOR r IN
      SELECT DISTINCT bt.talent_profile_id
      FROM public.booking_talent bt
      WHERE bt.booking_id = NEW.id
        AND bt.talent_profile_id IS NOT NULL
    LOOP
      PERFORM public.talent_recompute_completed_bookings(r.talent_profile_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_bookings_recompute_completed_bookings ON public.agency_bookings;
CREATE TRIGGER trg_agency_bookings_recompute_completed_bookings
  AFTER INSERT OR UPDATE OF status ON public.agency_bookings
  FOR EACH ROW EXECUTE FUNCTION public.agency_bookings_recompute_completed_bookings();

-- ---------------------------------------------------------------------------
-- 3. booking_talent AFTER INSERT OR DELETE — recompute the affected talent
--    when the parent booking is already completed (covers a talent line
--    being added to / removed from a booking after it completed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_talent_recompute_completed_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_talent_id UUID;
  v_booking_id UUID;
  v_status public.booking_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_talent_id := OLD.talent_profile_id;
    v_booking_id := OLD.booking_id;
  ELSE
    v_talent_id := NEW.talent_profile_id;
    v_booking_id := NEW.booking_id;
  END IF;

  IF v_talent_id IS NULL OR v_booking_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO v_status FROM public.agency_bookings WHERE id = v_booking_id;

  IF v_status = 'completed' THEN
    PERFORM public.talent_recompute_completed_bookings(v_talent_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_talent_recompute_completed_bookings ON public.booking_talent;
CREATE TRIGGER trg_booking_talent_recompute_completed_bookings
  AFTER INSERT OR DELETE ON public.booking_talent
  FOR EACH ROW EXECUTE FUNCTION public.booking_talent_recompute_completed_bookings();

-- ---------------------------------------------------------------------------
-- 4. One-time backfill — single set-based UPDATE, not a per-row loop.
-- ---------------------------------------------------------------------------
UPDATE public.talent_profiles tp
SET total_completed_bookings = COALESCE(cnt.n, 0)
FROM (
  SELECT bt.talent_profile_id AS talent_profile_id, COUNT(DISTINCT b.id)::INT AS n
  FROM public.booking_talent bt
  JOIN public.agency_bookings b ON b.id = bt.booking_id
  WHERE bt.talent_profile_id IS NOT NULL
    AND b.status = 'completed'
  GROUP BY bt.talent_profile_id
) cnt
WHERE tp.id = cnt.talent_profile_id;

-- Talents with zero completed bookings never match the join above and are
-- already 0 by column default, so no separate zero-out pass is needed.

COMMIT;
