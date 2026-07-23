-- STANDING reviews — integrity hardening (Phase 1).
--
-- Closes the audit holes on the (previously unused) talent_reviews engine:
--   C1 self-review farming  -> arm's-length verified_paid gate (reviewer != talent,
--                              a paid booking_transaction paid BY the reviewing client).
--   C2 retaliation / self-flip -> DB-enforced 48h edit window anchored to published_at,
--                              column guard (client may only touch rating/body/traits/
--                              would_book_again/attrs/private_note/anon), status never
--                              client-writable, lock on talent reply.
--   C2 null-booking spam    -> client INSERT requires booking_id IS NOT NULL.
--   C3 hide-to-fake-5.0      -> split aggregates (public rating_avg from published+
--                              verified_paid; rating_all_* from ALL non-spam rows so a
--                              hide never lifts the truth) + immutable moderation audit.
--
-- Pre-Stripe note: payments are provider='manual'. A manual paid transaction whose
-- payer is the reviewing client (and reviewer != talent) still verifies here, which is
-- correct for real arm's-length manual bookings. When Stripe is wired, tighten
-- review_is_arms_length_paid() with `provider <> 'manual' AND provider_reference IS NOT NULL`
-- to defeat staff-forged manual settlements (documented in the function body).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Allow a platform-only hard-removal status ('spam') distinct from tenant 'hidden'
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_reviews DROP CONSTRAINT IF EXISTS talent_reviews_status_check;
ALTER TABLE public.talent_reviews
  ADD CONSTRAINT talent_reviews_status_check CHECK (status IN ('published', 'hidden', 'spam'));

-- ---------------------------------------------------------------------------
-- 1. Arm's-length paid verification (fixes C1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_is_arms_length_paid(
  p_booking_id        UUID,
  p_talent_profile_id UUID,
  p_client_user_id    UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_talent_user UUID;
  v_ok          BOOLEAN;
BEGIN
  IF p_booking_id IS NULL OR p_client_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Reviewer must not be the reviewed talent (self-review).
  SELECT user_id INTO v_talent_user
    FROM public.talent_profiles WHERE id = p_talent_profile_id;
  IF v_talent_user IS NOT NULL AND v_talent_user = p_client_user_id THEN
    RETURN FALSE;
  END IF;

  -- Talent must actually be on the booking.
  IF NOT EXISTS (
    SELECT 1 FROM public.booking_talent bt
    WHERE bt.booking_id = p_booking_id
      AND bt.talent_profile_id = p_talent_profile_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- A settled payment on this booking, paid BY the reviewing client.
  SELECT EXISTS (
    SELECT 1 FROM public.booking_transactions tx
    WHERE tx.booking_id = p_booking_id
      AND tx.status = 'paid'
      AND tx.paid_at IS NOT NULL
      AND tx.payer_user_id = p_client_user_id
    -- STRIPE TODO: AND tx.provider <> 'manual' AND tx.provider_reference IS NOT NULL
  ) INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;

-- BEFORE INSERT only: stamp verified_paid, published_at, and derive skill_scope.
-- (Not re-run on UPDATE so a client text edit can never flip verified_paid, which
-- would otherwise trip the edit guard below.)
CREATE OR REPLACE FUNCTION public.talent_reviews_verify_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.verified_paid := public.review_is_arms_length_paid(
    NEW.booking_id, NEW.talent_profile_id, NEW.client_user_id);

  IF NEW.published_at IS NULL AND NEW.status = 'published' THEN
    NEW.published_at := now();
  END IF;

  IF NEW.skill_scope IS NULL AND NEW.booking_id IS NOT NULL THEN
    SELECT btl.role_label INTO NEW.skill_scope
      FROM public.booking_talent btl
      WHERE btl.booking_id = NEW.booking_id
        AND btl.talent_profile_id = NEW.talent_profile_id
      LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_reviews_verify ON public.talent_reviews;
CREATE TRIGGER trg_talent_reviews_verify
  BEFORE INSERT ON public.talent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.talent_reviews_verify_on_insert();

-- ---------------------------------------------------------------------------
-- 2. Client edit guard (fixes C2) — SECURITY INVOKER so auth.uid() is the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_reviews_edit_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Backend / service-role maintenance (no authenticated JWT) bypasses the guard.
  -- Authenticated clients always have a non-null auth.uid(), so this cannot be
  -- spoofed from the public API.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Staff / platform may moderate (status, etc.); their actions are audited by
  -- the application via review_moderation_events.
  IF public.is_staff_of_tenant(OLD.tenant_id) THEN
    RETURN NEW;
  END IF;

  -- Otherwise the actor is the review's client. Enforce ownership, window, lock.
  IF auth.uid() IS DISTINCT FROM OLD.client_user_id THEN
    RAISE EXCEPTION 'not permitted to edit this review';
  END IF;

  IF OLD.published_at IS NOT NULL AND now() > OLD.published_at + INTERVAL '48 hours' THEN
    RAISE EXCEPTION 'the 48 hour review edit window has closed';
  END IF;

  IF OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'this review is locked because the talent has replied';
  END IF;

  -- Client-writable columns ONLY: rating, body, traits, would_book_again,
  -- attr_*, private_note, anon, updated_at. Everything else must be unchanged.
  IF NEW.status            IS DISTINCT FROM OLD.status
  OR NEW.verified_paid     IS DISTINCT FROM OLD.verified_paid
  OR NEW.tenant_id         IS DISTINCT FROM OLD.tenant_id
  OR NEW.talent_profile_id IS DISTINCT FROM OLD.talent_profile_id
  OR NEW.booking_id        IS DISTINCT FROM OLD.booking_id
  OR NEW.client_user_id    IS DISTINCT FROM OLD.client_user_id
  OR NEW.transaction_id    IS DISTINCT FROM OLD.transaction_id
  OR NEW.skill_scope       IS DISTINCT FROM OLD.skill_scope
  OR NEW.published_at      IS DISTINCT FROM OLD.published_at
  OR NEW.locked_at         IS DISTINCT FROM OLD.locked_at
  OR NEW.reply_body        IS DISTINCT FROM OLD.reply_body
  OR NEW.reply_at          IS DISTINCT FROM OLD.reply_at
  THEN
    RAISE EXCEPTION 'clients may only edit rating, text, traits, attributes and would_book_again';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_reviews_edit_guard ON public.talent_reviews;
CREATE TRIGGER trg_talent_reviews_edit_guard
  BEFORE UPDATE ON public.talent_reviews
  FOR EACH ROW EXECUTE FUNCTION public.talent_reviews_edit_guard();

-- ---------------------------------------------------------------------------
-- 3. RLS: require booking_id on client insert; keep row-ownership on update
--    (column/window enforcement is the edit-guard trigger above).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS talent_reviews_client_insert ON public.talent_reviews;
CREATE POLICY talent_reviews_client_insert ON public.talent_reviews
  FOR INSERT
  WITH CHECK (client_user_id = auth.uid() AND booking_id IS NOT NULL);

DROP POLICY IF EXISTS talent_reviews_client_update ON public.talent_reviews;
CREATE POLICY talent_reviews_client_update ON public.talent_reviews
  FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

-- Public read: published only, AND never a spam-flagged row.
DROP POLICY IF EXISTS talent_reviews_public_select ON public.talent_reviews;
CREATE POLICY talent_reviews_public_select ON public.talent_reviews
  FOR SELECT
  USING (status = 'published');

-- ---------------------------------------------------------------------------
-- 4. Split recompute (fixes C3): public = published + verified_paid;
--    rating_all_* = every non-spam row (so hiding never lifts the truth).
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

-- ---------------------------------------------------------------------------
-- 5. Immutable moderation audit (fixes C3) — every hide/unhide/spam is logged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_moderation_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_kind   TEXT        NOT NULL CHECK (review_kind IN ('talent', 'client')),
  review_id     UUID        NOT NULL,
  tenant_id     UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  actor_user_id UUID        REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_is_platform BOOLEAN NOT NULL DEFAULT FALSE,
  action        TEXT        NOT NULL CHECK (action IN ('hide', 'unhide', 'spam_flag', 'unspam', 'report')),
  reason_code   TEXT,
  justification TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_moderation_events_review
  ON public.review_moderation_events (review_kind, review_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_moderation_events_tenant
  ON public.review_moderation_events (tenant_id, created_at DESC);

ALTER TABLE public.review_moderation_events ENABLE ROW LEVEL SECURITY;

-- Insert only by staff of the tenant (covers platform admins via is_staff_of_tenant).
DROP POLICY IF EXISTS review_moderation_events_staff_insert ON public.review_moderation_events;
CREATE POLICY review_moderation_events_staff_insert ON public.review_moderation_events
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Read: staff of the tenant + platform admins.
DROP POLICY IF EXISTS review_moderation_events_staff_select ON public.review_moderation_events;
CREATE POLICY review_moderation_events_staff_select ON public.review_moderation_events
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

-- No UPDATE / DELETE policies -> immutable under RLS.

COMMENT ON TABLE public.review_moderation_events IS
  'Immutable audit of review moderation (hide/unhide/spam/report). Insert-only; no update/delete policy. A tenant hiding low-star reviews leaves a trail; rating_all_* preserves the pre-hide truth.';

COMMIT;
