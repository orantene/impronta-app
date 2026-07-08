-- STANDING v2 P1 — client_reviews integrity parity + talent_reviews report-flow fix.
--
-- (a) client_reviews gets the same spine as talent_reviews: published_at anchor,
--     a BEFORE UPDATE edit-guard (author edits rating/body within 48h; subject
--     client may only flag reported_at; staff/service bypass). It was previously
--     infinitely editable with no guard.
-- (b) FIX a regression from 20261110040000: the talent_reviews edit-guard rejects
--     ALL non-client/non-staff updates, which broke reportReviewAction for the
--     SUBJECT talent flagging a client->talent review (review-actions.ts:595).
--     Re-allow the subject talent to change ONLY reported_at.
--
-- Column guards use a to_jsonb() diff (minus the allowed keys) so they are exact
-- and cannot drift as columns are added. Idempotent.

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) client_reviews.published_at + stamp trigger
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_reviews
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE public.client_reviews
   SET published_at = created_at
 WHERE published_at IS NULL AND status = 'published';

CREATE OR REPLACE FUNCTION public.client_reviews_set_published()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.published_at IS NULL AND NEW.status = 'published' THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_reviews_set_published ON public.client_reviews;
CREATE TRIGGER trg_client_reviews_set_published
  BEFORE INSERT ON public.client_reviews
  FOR EACH ROW EXECUTE FUNCTION public.client_reviews_set_published();

-- ---------------------------------------------------------------------------
-- (a) client_reviews edit guard (author 48h + column guard; subject report-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_reviews_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- backend / service-role
  END IF;
  IF public.is_staff_of_tenant(OLD.tenant_id) THEN
    RETURN NEW;  -- staff/platform moderation (audited in-app)
  END IF;

  -- Author (the reviewing talent's user): edit rating/body within 48h only.
  IF auth.uid() = OLD.author_user_id THEN
    IF OLD.published_at IS NOT NULL AND now() > OLD.published_at + INTERVAL '48 hours' THEN
      RAISE EXCEPTION 'the 48 hour review edit window has closed';
    END IF;
    IF (to_jsonb(NEW) - 'rating' - 'body' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'rating' - 'body' - 'updated_at') THEN
      RAISE EXCEPTION 'authors may only edit the rating and text of their review';
    END IF;
    RETURN NEW;
  END IF;

  -- Subject client: may ONLY flag the review (set reported_at).
  IF auth.uid() = OLD.client_user_id THEN
    IF (to_jsonb(NEW) - 'reported_at' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'reported_at' - 'updated_at') THEN
      RAISE EXCEPTION 'the reviewed client may only report a review, not edit it';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not permitted to edit this review';
END;
$$;

DROP TRIGGER IF EXISTS trg_client_reviews_edit_guard ON public.client_reviews;
CREATE TRIGGER trg_client_reviews_edit_guard
  BEFORE UPDATE ON public.client_reviews
  FOR EACH ROW EXECUTE FUNCTION public.client_reviews_edit_guard();

-- ---------------------------------------------------------------------------
-- (b) talent_reviews edit-guard: re-allow the SUBJECT talent to set reported_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_reviews_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- backend / service-role
  END IF;

  IF public.is_staff_of_tenant(OLD.tenant_id) THEN
    RETURN NEW;  -- staff/platform moderation (audited in-app)
  END IF;

  -- Subject talent (the reviewed profile's owner) may ONLY flag the review
  -- (set reported_at) — everything else about a review of them is immutable.
  IF EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = OLD.talent_profile_id AND tp.user_id = auth.uid()
  ) THEN
    IF (to_jsonb(NEW) - 'reported_at' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'reported_at' - 'updated_at') THEN
      RAISE EXCEPTION 'the reviewed talent may only report a review, not edit it';
    END IF;
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
  -- attr_*, private_note, anon (+ updated_at). Everything else unchanged.
  IF (to_jsonb(NEW)
        - 'rating' - 'body' - 'traits' - 'would_book_again'
        - 'attr_professionalism' - 'attr_skill' - 'attr_communication' - 'attr_reliability'
        - 'private_note' - 'anon' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD)
        - 'rating' - 'body' - 'traits' - 'would_book_again'
        - 'attr_professionalism' - 'attr_skill' - 'attr_communication' - 'attr_reliability'
        - 'private_note' - 'anon' - 'updated_at') THEN
    RAISE EXCEPTION 'clients may only edit rating, text, traits, attributes and would_book_again';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
