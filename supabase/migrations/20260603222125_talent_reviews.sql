-- Client → talent REVIEWS / RATINGS.
--
-- After a booking is COMPLETED (or paid + the event date has passed), the
-- booking's client may leave a 1–5 star rating + optional text for a talent who
-- was on that booking. Reviews publish immediately and show on the talent's
-- public pages with an average. One review per (booking, talent, client) —
-- editing (upsert) is allowed. Tenant staff + platform admin can HIDE a review
-- (status='hidden'); talent CANNOT edit or delete reviews about them.
--
-- Eligibility predicate (enforced in the server action; documented for agents):
--   booking.client_user_id = caller
--   AND ( booking.status = 'completed'
--         OR ( booking.payment_status = 'paid'
--              AND COALESCE(booking.ends_at, (booking.event_date + INTERVAL '1 day'))
--                  <= now() ) )
--   AND the talent is on the booking (booking_talent.talent_profile_id)
--
-- Denormalized talent_profiles.rating_avg / rating_count are recomputed from
-- PUBLISHED reviews by an AFTER INSERT/UPDATE/DELETE trigger. The aggregate is
-- global across a talent profile (a profile may appear on several tenants'
-- rosters) — matches "average shows on the talent's public page".

BEGIN;

-- ---------------------------------------------------------------------------
-- Denormalized rating columns on talent_profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS rating_avg   NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER       NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.talent_profiles.rating_avg IS
  'Denormalized mean of PUBLISHED talent_reviews.rating for this profile (0 when none). Maintained by trg_talent_reviews_recompute.';
COMMENT ON COLUMN public.talent_profiles.rating_count IS
  'Denormalized count of PUBLISHED talent_reviews for this profile. Maintained by trg_talent_reviews_recompute.';

-- ---------------------------------------------------------------------------
-- talent_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_reviews (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  talent_profile_id UUID        NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  booking_id        UUID        REFERENCES public.agency_bookings (id) ON DELETE SET NULL,
  client_user_id    UUID        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rating            INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body              TEXT,
  status            TEXT        NOT NULL DEFAULT 'published'
                                  CHECK (status IN ('published', 'hidden')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_reviews IS
  'Client → talent reviews. One per (booking, talent, client); upsert/edit allowed. status=hidden is a staff/platform moderation soft-delete. talent cannot edit/delete rows about them.';

-- One review per client per talent per booking (booking_id may be NULL → those
-- are NOT deduped by this index; the action always supplies a booking_id).
CREATE UNIQUE INDEX IF NOT EXISTS talent_reviews_booking_talent_client_unique
  ON public.talent_reviews (booking_id, talent_profile_id, client_user_id);

CREATE INDEX IF NOT EXISTS idx_talent_reviews_talent_published
  ON public.talent_reviews (talent_profile_id, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_talent_reviews_tenant
  ON public.talent_reviews (tenant_id);

CREATE INDEX IF NOT EXISTS idx_talent_reviews_client
  ON public.talent_reviews (client_user_id);

-- ---------------------------------------------------------------------------
-- updated_at touch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_reviews_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_reviews_touch_updated_at ON public.talent_reviews;
CREATE TRIGGER trg_talent_reviews_touch_updated_at
  BEFORE UPDATE ON public.talent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.talent_reviews_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Recompute denormalized rating_avg / rating_count from PUBLISHED reviews
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_reviews_recompute_summary(p_talent_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.talent_profiles tp
  SET
    rating_count = agg.cnt,
    rating_avg   = agg.avg
  FROM (
    SELECT
      COUNT(*)::INTEGER                                            AS cnt,
      COALESCE(ROUND(AVG(r.rating)::numeric, 2), 0)::numeric(3, 2) AS avg
    FROM public.talent_reviews r
    WHERE r.talent_profile_id = p_talent_profile_id
      AND r.status = 'published'
  ) agg
  WHERE tp.id = p_talent_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.talent_reviews_recompute_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.talent_reviews_recompute_summary(OLD.talent_profile_id);
    RETURN OLD;
  END IF;

  PERFORM public.talent_reviews_recompute_summary(NEW.talent_profile_id);
  -- An UPDATE could have moved the row to a different talent profile.
  IF TG_OP = 'UPDATE' AND OLD.talent_profile_id IS DISTINCT FROM NEW.talent_profile_id THEN
    PERFORM public.talent_reviews_recompute_summary(OLD.talent_profile_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_reviews_recompute ON public.talent_reviews;
CREATE TRIGGER trg_talent_reviews_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.talent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.talent_reviews_recompute_trigger();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_reviews ENABLE ROW LEVEL SECURITY;

-- Public (anon + authed) read of PUBLISHED reviews only — powers public pages.
DROP POLICY IF EXISTS talent_reviews_public_select ON public.talent_reviews;
CREATE POLICY talent_reviews_public_select ON public.talent_reviews
  FOR SELECT
  USING (status = 'published');

-- Client inserts their own review row (eligibility is enforced in the action;
-- RLS guarantees the row is attributed to the caller).
DROP POLICY IF EXISTS talent_reviews_client_insert ON public.talent_reviews;
CREATE POLICY talent_reviews_client_insert ON public.talent_reviews
  FOR INSERT
  WITH CHECK (client_user_id = auth.uid());

-- Client edits their own review (rating/body). Cannot change ownership.
DROP POLICY IF EXISTS talent_reviews_client_update ON public.talent_reviews;
CREATE POLICY talent_reviews_client_update ON public.talent_reviews
  FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

-- Client may read their own rows back regardless of status (so an edited /
-- hidden row still surfaces in their "your reviews" view).
DROP POLICY IF EXISTS talent_reviews_client_select_own ON public.talent_reviews;
CREATE POLICY talent_reviews_client_select_own ON public.talent_reviews
  FOR SELECT
  USING (client_user_id = auth.uid());

-- Tenant staff + platform admin: read ALL rows for their tenant and UPDATE
-- (to hide / unhide). is_staff_of_tenant() already returns true for platform
-- admins, so this single policy covers both.
DROP POLICY IF EXISTS talent_reviews_staff_select ON public.talent_reviews;
CREATE POLICY talent_reviews_staff_select ON public.talent_reviews
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS talent_reviews_staff_update ON public.talent_reviews;
CREATE POLICY talent_reviews_staff_update ON public.talent_reviews
  FOR UPDATE
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMIT;
