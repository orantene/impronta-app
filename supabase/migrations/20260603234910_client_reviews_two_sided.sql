-- TWO-SIDED REVIEWS — talent → client direction + a report flag on both tables.
--
-- W7 shipped client → talent reviews (public.talent_reviews). This wave adds the
-- OTHER direction: a talent who worked a booking may leave a 1–5 star rating +
-- optional text for the booking's CLIENT. Client reviews are NOT public (clients
-- have no public page). They are visible to:
--   - the client (the subject) — read own
--   - the talent (the author)  — read own
--   - tenant staff + platform admin — read + hide
--
-- Eligibility predicate (enforced in submitClientReviewAction; documented here):
--   the caller is a talent on the booking
--     (booking_talent.talent_profile_id IN the caller's talent_profiles)
--   AND ( booking.status = 'completed'
--         OR ( booking.payment_status = 'paid'
--              AND COALESCE(ends_at, event_date + INTERVAL '1 day') <= now() ) )
--   One review per (booking, author talent-user, client) — upsert/edit allowed.
--
-- No public read, no denormalized cache columns, no trigger — client rating
-- aggregates are computed on read (loadClientRatingSummary).
--
-- Also adds a nullable `reported_at` column to BOTH talent_reviews and
-- client_reviews for the report flow: the SUBJECT of a review flags it for staff
-- moderation (sets reported_at). Staff/platform then hide it (status='hidden').
--
-- Idempotent: re-runnable.

BEGIN;

-- ---------------------------------------------------------------------------
-- report flag on the existing talent_reviews (W7 table)
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_reviews
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ;

COMMENT ON COLUMN public.talent_reviews.reported_at IS
  'Set when the SUBJECT talent flags this client→talent review for staff moderation. NULL = not reported.';

-- The talent SUBJECT must be able to flag a review about them (set reported_at)
-- even though they cannot edit rating/body or hide it. We allow the talent that
-- owns the reviewed profile to UPDATE the row; the action only ever touches
-- reported_at, and rating/body/status changes by a talent are not exposed.
DROP POLICY IF EXISTS talent_reviews_subject_report ON public.talent_reviews;
CREATE POLICY talent_reviews_subject_report ON public.talent_reviews
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_reviews.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_reviews.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- The talent SUBJECT must also be able to READ reviews about them regardless of
-- status (so the talent/admin "all my received reviews incl. hidden" view works
-- for the owner). Public select only exposes published rows; this adds owner read.
DROP POLICY IF EXISTS talent_reviews_subject_select ON public.talent_reviews;
CREATE POLICY talent_reviews_subject_select ON public.talent_reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_reviews.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- client_reviews  (talent → client)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_reviews (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  booking_id               UUID        REFERENCES public.agency_bookings (id) ON DELETE SET NULL,
  author_user_id           UUID        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  author_talent_profile_id UUID        REFERENCES public.talent_profiles (id) ON DELETE SET NULL,
  client_user_id           UUID        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rating                   INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body                     TEXT,
  status                   TEXT        NOT NULL DEFAULT 'published'
                                         CHECK (status IN ('published', 'hidden')),
  reported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_reviews IS
  'Talent → client reviews. One per (booking, author talent-user, client); upsert/edit allowed. NOT public — readable by author, subject client, tenant staff, platform admin. status=hidden is a staff/platform moderation soft-delete. reported_at is set when the subject client flags it.';

COMMENT ON COLUMN public.client_reviews.reported_at IS
  'Set when the SUBJECT client flags this talent→client review for staff moderation. NULL = not reported.';

-- One review per author talent-user per client per booking.
CREATE UNIQUE INDEX IF NOT EXISTS client_reviews_booking_author_client_unique
  ON public.client_reviews (booking_id, author_user_id, client_user_id);

CREATE INDEX IF NOT EXISTS idx_client_reviews_client_published
  ON public.client_reviews (client_user_id, created_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_client_reviews_author
  ON public.client_reviews (author_user_id);

CREATE INDEX IF NOT EXISTS idx_client_reviews_tenant
  ON public.client_reviews (tenant_id);

-- ---------------------------------------------------------------------------
-- updated_at touch (reuse the same pattern as talent_reviews)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_reviews_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_reviews_touch_updated_at ON public.client_reviews;
CREATE TRIGGER trg_client_reviews_touch_updated_at
  BEFORE UPDATE ON public.client_reviews
  FOR EACH ROW EXECUTE FUNCTION public.client_reviews_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_reviews ENABLE ROW LEVEL SECURITY;

-- Author (the talent's user) inserts their own review row. Eligibility is
-- enforced in the action; RLS guarantees the row is attributed to the caller.
DROP POLICY IF EXISTS client_reviews_author_insert ON public.client_reviews;
CREATE POLICY client_reviews_author_insert ON public.client_reviews
  FOR INSERT
  WITH CHECK (author_user_id = auth.uid());

-- Author edits their own review (rating/body). Cannot change ownership.
DROP POLICY IF EXISTS client_reviews_author_update ON public.client_reviews;
CREATE POLICY client_reviews_author_update ON public.client_reviews
  FOR UPDATE
  USING (author_user_id = auth.uid())
  WITH CHECK (author_user_id = auth.uid());

-- Author reads their own rows back (regardless of status) for "reviews I gave".
DROP POLICY IF EXISTS client_reviews_author_select ON public.client_reviews;
CREATE POLICY client_reviews_author_select ON public.client_reviews
  FOR SELECT
  USING (author_user_id = auth.uid());

-- Subject client reads PUBLISHED reviews about them (received reviews). Hidden
-- rows stay invisible to the subject. (A hidden row is moderated-away.)
DROP POLICY IF EXISTS client_reviews_subject_select ON public.client_reviews;
CREATE POLICY client_reviews_subject_select ON public.client_reviews
  FOR SELECT
  USING (client_user_id = auth.uid() AND status = 'published');

-- Subject client may flag a review about them (set reported_at). They cannot
-- change rating/body/status; the action only touches reported_at.
DROP POLICY IF EXISTS client_reviews_subject_report ON public.client_reviews;
CREATE POLICY client_reviews_subject_report ON public.client_reviews
  FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

-- Tenant staff + platform admin read ALL rows for their tenant and UPDATE (to
-- hide / unhide). is_staff_of_tenant() returns true for platform admins too.
DROP POLICY IF EXISTS client_reviews_staff_select ON public.client_reviews;
CREATE POLICY client_reviews_staff_select ON public.client_reviews
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS client_reviews_staff_update ON public.client_reviews;
CREATE POLICY client_reviews_staff_update ON public.client_reviews
  FOR UPDATE
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMIT;
