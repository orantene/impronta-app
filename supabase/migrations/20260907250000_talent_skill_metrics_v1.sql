-- ============================================================================
-- Phase 5.1 — Talent skill metrics populator (2026-05-07)
-- ============================================================================
--
-- WHY
-- ───
-- The multi-skill catalog gives each talent up to ~9 specific skills with
-- proficiency tiers + verification flags. To make discovery and booking
-- analytics richer, we want booking-driven evidence per (talent, skill):
--
--   - booking_count   — how many real bookings used this talent for this skill
--   - last_booked_at  — when was that skill last used in a real booking
--
-- The aggregate is computed from:
--   booking_talent      → talent_profile_id, booking_id
--   agency_bookings     → status, source_inquiry_id, event_date, starts_at, created_at
--   inquiries           → requested_skill_term_id   (added in 20260907230000_v1)
--
-- WHAT
-- ────
-- 1. Stored aggregates table   public.talent_skill_metrics
-- 2. Per-pair refresh fn       refresh_talent_skill_metrics(talent, skill)
-- 3. Bulk refresh fn           refresh_talent_skill_metrics_all() — cron entry
-- 4. Triggers on               agency_bookings + booking_talent → refresh affected
-- 5. View extension            talent_skills_resolved gains booking_count + last_booked_at
-- 6. Initial backfill          run refresh_talent_skill_metrics_all() once at install
--
-- The nightly cron (`/api/cron/skill-metrics-refresh`) invokes
-- refresh_talent_skill_metrics_all(). It is the safety net for cases the
-- per-row triggers cannot see — e.g. an inquiry's requested_skill_term_id
-- being edited after the booking already exists. The triggers cover the
-- common path; the cron guarantees eventual consistency.
-- ============================================================================

BEGIN;

-- ─── 1. Stored aggregates table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_skill_metrics (
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  taxonomy_term_id  UUID NOT NULL REFERENCES public.taxonomy_terms(id)  ON DELETE CASCADE,
  booking_count     INT NOT NULL DEFAULT 0,
  last_booked_at    TIMESTAMPTZ,
  refreshed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (talent_profile_id, taxonomy_term_id)
);

CREATE INDEX IF NOT EXISTS idx_talent_skill_metrics_term
  ON public.talent_skill_metrics (taxonomy_term_id);

ALTER TABLE public.talent_skill_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_skill_metrics_staff_select ON public.talent_skill_metrics;
CREATE POLICY talent_skill_metrics_staff_select ON public.talent_skill_metrics
  FOR SELECT
  USING (public.is_agency_staff());

COMMENT ON TABLE public.talent_skill_metrics IS
  'Phase 5.1 — booking-driven aggregates per (talent_profile_id, taxonomy_term_id). Populated by trigger + nightly cron. Read via talent_skills_resolved view.';

-- ─── 2. Per-pair refresh function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_talent_skill_metrics(
  p_talent_profile_id UUID,
  p_taxonomy_term_id  UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count          INT;
  v_last_booked_at TIMESTAMPTZ;
BEGIN
  IF p_talent_profile_id IS NULL OR p_taxonomy_term_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    MAX(COALESCE(b.event_date::TIMESTAMPTZ, b.starts_at, b.created_at))
  INTO v_count, v_last_booked_at
  FROM public.booking_talent bt
  JOIN public.agency_bookings b ON b.id = bt.booking_id
  JOIN public.inquiries i       ON i.id = b.source_inquiry_id
  WHERE bt.talent_profile_id = p_talent_profile_id
    AND i.requested_skill_term_id = p_taxonomy_term_id
    AND b.status::TEXT NOT IN ('cancelled');

  IF v_count > 0 THEN
    INSERT INTO public.talent_skill_metrics
      (talent_profile_id, taxonomy_term_id, booking_count, last_booked_at, refreshed_at)
    VALUES
      (p_talent_profile_id, p_taxonomy_term_id, v_count, v_last_booked_at, now())
    ON CONFLICT (talent_profile_id, taxonomy_term_id)
    DO UPDATE SET
      booking_count  = EXCLUDED.booking_count,
      last_booked_at = EXCLUDED.last_booked_at,
      refreshed_at   = EXCLUDED.refreshed_at;
  ELSE
    DELETE FROM public.talent_skill_metrics
    WHERE talent_profile_id = p_talent_profile_id
      AND taxonomy_term_id  = p_taxonomy_term_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_talent_skill_metrics IS
  'Phase 5.1 — recompute talent_skill_metrics for one (talent, skill) pair. Called from triggers and ad-hoc.';

-- ─── 3. Bulk refresh (cron entry point) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_talent_skill_metrics_all()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pair_count INT;
BEGIN
  TRUNCATE public.talent_skill_metrics;

  INSERT INTO public.talent_skill_metrics
    (talent_profile_id, taxonomy_term_id, booking_count, last_booked_at, refreshed_at)
  SELECT
    bt.talent_profile_id,
    i.requested_skill_term_id,
    COUNT(*),
    MAX(COALESCE(b.event_date::TIMESTAMPTZ, b.starts_at, b.created_at)),
    now()
  FROM public.booking_talent bt
  JOIN public.agency_bookings b ON b.id = bt.booking_id
  JOIN public.inquiries i       ON i.id = b.source_inquiry_id
  WHERE bt.talent_profile_id IS NOT NULL
    AND i.requested_skill_term_id IS NOT NULL
    AND b.status::TEXT NOT IN ('cancelled')
  GROUP BY bt.talent_profile_id, i.requested_skill_term_id;

  GET DIAGNOSTICS v_pair_count = ROW_COUNT;
  RETURN v_pair_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_talent_skill_metrics_all IS
  'Phase 5.1 — truncate + rebuild talent_skill_metrics from booking_talent + agency_bookings + inquiries. Called by /api/cron/skill-metrics-refresh nightly.';

-- ─── 4. Triggers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_refresh_skill_metrics_for_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_skill_term_id UUID;
  v_booking_id UUID;
  v_inquiry_id UUID;
BEGIN
  v_booking_id := COALESCE(NEW.id, OLD.id);
  v_inquiry_id := COALESCE(NEW.source_inquiry_id, OLD.source_inquiry_id);

  IF v_inquiry_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT i.requested_skill_term_id INTO v_skill_term_id
  FROM public.inquiries i
  WHERE i.id = v_inquiry_id;

  IF v_skill_term_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOR r IN
    SELECT bt.talent_profile_id
    FROM public.booking_talent bt
    WHERE bt.booking_id = v_booking_id
      AND bt.talent_profile_id IS NOT NULL
  LOOP
    PERFORM public.refresh_talent_skill_metrics(r.talent_profile_id, v_skill_term_id);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_metrics_on_booking ON public.agency_bookings;
CREATE TRIGGER trg_skill_metrics_on_booking
AFTER INSERT OR DELETE OR UPDATE OF status, source_inquiry_id, event_date, starts_at
ON public.agency_bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_skill_metrics_for_booking();

CREATE OR REPLACE FUNCTION public.trg_refresh_skill_metrics_for_booking_talent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skill_term_id UUID;
  v_booking_id UUID;
BEGIN
  v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);

  SELECT i.requested_skill_term_id INTO v_skill_term_id
  FROM public.agency_bookings b
  JOIN public.inquiries i ON i.id = b.source_inquiry_id
  WHERE b.id = v_booking_id;

  IF v_skill_term_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.talent_profile_id IS NOT NULL THEN
    PERFORM public.refresh_talent_skill_metrics(NEW.talent_profile_id, v_skill_term_id);
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.talent_profile_id IS DISTINCT FROM NEW.talent_profile_id
     AND OLD.talent_profile_id IS NOT NULL THEN
    PERFORM public.refresh_talent_skill_metrics(OLD.talent_profile_id, v_skill_term_id);
  END IF;
  IF TG_OP = 'DELETE' AND OLD.talent_profile_id IS NOT NULL THEN
    PERFORM public.refresh_talent_skill_metrics(OLD.talent_profile_id, v_skill_term_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_skill_metrics_on_booking_talent ON public.booking_talent;
CREATE TRIGGER trg_skill_metrics_on_booking_talent
AFTER INSERT OR DELETE OR UPDATE OF talent_profile_id, booking_id
ON public.booking_talent
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_skill_metrics_for_booking_talent();

-- ─── 5. Extend talent_skills_resolved view ──────────────────────────────────

CREATE OR REPLACE VIEW public.talent_skills_resolved AS
SELECT
  tpt.talent_profile_id,
  tpt.taxonomy_term_id AS skill_term_id,
  t.slug AS skill_slug,
  t.name_en AS skill_name_en,
  t.name_es AS skill_name_es,
  t.is_generic_fallback,
  public.parent_category_of(t.id) AS parent_category_id,
  pc.slug AS parent_category_slug,
  pc.name_en AS parent_category_name_en,
  tpt.relationship_type,
  tpt.proficiency_level,
  tpt.years_experience,
  tpt.display_order,
  tpt.verified_at IS NOT NULL AS is_verified,
  tpt.verified_at,
  tpt.verified_by_user_id,
  tpt.verified_by_tenant_id,
  tpt.verification_note,
  tpt.tenant_id,
  tpt.created_at,
  tpt.updated_at,
  COALESCE(tsm.booking_count, 0) AS booking_count,
  tsm.last_booked_at
FROM public.talent_profile_taxonomy tpt
JOIN public.taxonomy_terms t ON t.id = tpt.taxonomy_term_id
LEFT JOIN public.taxonomy_terms pc ON pc.id = public.parent_category_of(t.id)
LEFT JOIN public.talent_skill_metrics tsm
  ON tsm.talent_profile_id = tpt.talent_profile_id
  AND tsm.taxonomy_term_id = tpt.taxonomy_term_id
WHERE tpt.relationship_type IN ('primary_role', 'secondary_role');

COMMENT ON VIEW public.talent_skills_resolved IS
  'Clean read model for multi-skill profiles: per-talent skill rows joined to parent_category, proficiency, verification state, and (Phase 5.1) booking-driven counts (booking_count, last_booked_at).';

-- ─── 6. Initial backfill ───────────────────────────────────────────────────

SELECT public.refresh_talent_skill_metrics_all();

-- ─── 7. Final assertion ────────────────────────────────────────────────────

DO $$
DECLARE
  v_table_count INT;
  v_function_count INT;
  v_trigger_count INT;
BEGIN
  SELECT count(*) INTO v_table_count FROM information_schema.tables
    WHERE table_name = 'talent_skill_metrics' AND table_schema = 'public';

  SELECT count(*) INTO v_function_count FROM pg_proc
    WHERE proname IN (
      'refresh_talent_skill_metrics',
      'refresh_talent_skill_metrics_all',
      'trg_refresh_skill_metrics_for_booking',
      'trg_refresh_skill_metrics_for_booking_talent'
    );

  SELECT count(*) INTO v_trigger_count FROM pg_trigger
    WHERE tgname IN (
      'trg_skill_metrics_on_booking',
      'trg_skill_metrics_on_booking_talent'
    );

  IF v_table_count <> 1 THEN
    RAISE EXCEPTION 'phase_5_1_metrics: table talent_skill_metrics missing.';
  END IF;
  IF v_function_count <> 4 THEN
    RAISE EXCEPTION 'phase_5_1_metrics: expected 4 functions, got %.', v_function_count;
  END IF;
  IF v_trigger_count <> 2 THEN
    RAISE EXCEPTION 'phase_5_1_metrics: expected 2 triggers, got %.', v_trigger_count;
  END IF;

  RAISE NOTICE 'phase_5_1_metrics: schema + functions + triggers + view installed.';
END $$;

COMMIT;
