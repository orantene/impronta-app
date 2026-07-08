-- STANDING reviews — Phase 4: faceone review requests + walled-off testimonials.
--
-- review_requests: a talent (or tenant staff) invites a specific past client to
-- leave a review for a specific completed booking. FTC-safe: no pre-filled rating,
-- no incentive; one request per (booking, client) enforced by a unique index; a
-- single reminder tracked via reminded_at.
--
-- tenant_testimonials: imported/attested social proof, kept in a SEPARATE table so
-- its optional display `rating` can NEVER touch talent_profiles.rating_avg or the
-- verified STANDING signal. Public read is published-only; clearly labeled as a
-- testimonial (not a verified booking review) at the render layer.

BEGIN;

-- ---------------------------------------------------------------------------
-- review_requests (faceone)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  talent_profile_id   UUID        NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  booking_id          UUID        REFERENCES public.agency_bookings (id) ON DELETE SET NULL,
  client_user_id      UUID        REFERENCES public.profiles (id) ON DELETE SET NULL,
  invited_email       TEXT,
  invite_token        TEXT        NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  message             TEXT,
  status              TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'sent', 'completed', 'expired')),
  requested_by_user_id UUID       REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reminded_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS review_requests_token_unique
  ON public.review_requests (invite_token);
-- One outstanding request per (booking, client) — the anti-spam / rate-limit guard.
CREATE UNIQUE INDEX IF NOT EXISTS review_requests_booking_client_unique
  ON public.review_requests (booking_id, client_user_id)
  WHERE booking_id IS NOT NULL AND client_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_talent
  ON public.review_requests (talent_profile_id, created_at DESC);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- Tenant staff, or the talent themselves, may create + read their own requests.
-- (Public token submission is handled by a SECURITY DEFINER server action, not RLS.)
DROP POLICY IF EXISTS review_requests_owner_insert ON public.review_requests;
CREATE POLICY review_requests_owner_insert ON public.review_requests
  FOR INSERT
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR auth.uid() = (SELECT tp.user_id FROM public.talent_profiles tp WHERE tp.id = talent_profile_id)
  );

DROP POLICY IF EXISTS review_requests_owner_select ON public.review_requests;
CREATE POLICY review_requests_owner_select ON public.review_requests
  FOR SELECT
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR auth.uid() = (SELECT tp.user_id FROM public.talent_profiles tp WHERE tp.id = talent_profile_id)
    OR auth.uid() = client_user_id
  );

DROP POLICY IF EXISTS review_requests_owner_update ON public.review_requests;
CREATE POLICY review_requests_owner_update ON public.review_requests
  FOR UPDATE
  USING (
    public.is_staff_of_tenant(tenant_id)
    OR auth.uid() = (SELECT tp.user_id FROM public.talent_profiles tp WHERE tp.id = talent_profile_id)
  )
  WITH CHECK (
    public.is_staff_of_tenant(tenant_id)
    OR auth.uid() = (SELECT tp.user_id FROM public.talent_profiles tp WHERE tp.id = talent_profile_id)
  );

COMMENT ON TABLE public.review_requests IS
  'faceone: talent/staff invite a past client to review a completed booking. One per (booking, client). No pre-filled rating, no incentive (FTC-safe).';

-- ---------------------------------------------------------------------------
-- tenant_testimonials (walled off from the verified STANDING signal)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_testimonials (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  talent_profile_id UUID        NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  author_name       TEXT        NOT NULL,
  author_role       TEXT,
  body              TEXT        NOT NULL,
  rating            SMALLINT    CHECK (rating BETWEEN 1 AND 5),
  source            TEXT        NOT NULL DEFAULT 'manual'
                                  CHECK (source IN ('requested', 'imported', 'manual')),
  status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'published', 'hidden')),
  created_by_user_id UUID       REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_testimonials_talent_published
  ON public.tenant_testimonials (talent_profile_id, created_at DESC)
  WHERE status = 'published';

ALTER TABLE public.tenant_testimonials ENABLE ROW LEVEL SECURITY;

-- Public read published testimonials (labeled as testimonials at the UI layer).
DROP POLICY IF EXISTS tenant_testimonials_public_select ON public.tenant_testimonials;
CREATE POLICY tenant_testimonials_public_select ON public.tenant_testimonials
  FOR SELECT
  USING (status = 'published');

-- Tenant staff manage (attest / import / moderate).
DROP POLICY IF EXISTS tenant_testimonials_staff_insert ON public.tenant_testimonials;
CREATE POLICY tenant_testimonials_staff_insert ON public.tenant_testimonials
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS tenant_testimonials_staff_update ON public.tenant_testimonials;
CREATE POLICY tenant_testimonials_staff_update ON public.tenant_testimonials
  FOR UPDATE
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

COMMENT ON TABLE public.tenant_testimonials IS
  'Attested / imported testimonials, walled off from the verified STANDING signal. Optional display rating NEVER feeds talent_profiles.rating_avg. Public read = published only; labeled as a testimonial, not a verified booking review.';

COMMIT;
