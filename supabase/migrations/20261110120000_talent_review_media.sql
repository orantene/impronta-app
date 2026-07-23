-- STANDING v3 (item 5) — photo/media attached to a client -> talent review.
--
-- A reviewer can attach photos to their review (e.g. a shot from the shoot /
-- event). Authenticated reviewers only (the guest token path never uploads).
-- Files land in the PUBLIC `media-public` bucket; this table is the metadata +
-- moderation surface.
--
-- Moderation model (mirrors talent_reviews):
--   * public display gates on deleted_at IS NULL AND approval_state='approved'
--     AND the parent review being published.
--   * staff of the tenant moderate (approve / reject / soft-delete).
--   * the review's client inserts + may soft-delete their own media, but a
--     column-guard trigger freezes approval_state (and identity columns) for a
--     non-staff caller, so a rejected photo cannot be self-re-approved.
--
-- The upload write itself uses service-role storage (see review-media-actions.ts)
-- exactly like client-inquiry-attachments.ts; the metadata INSERT here is
-- auth-scoped so this RLS governs it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_review_media (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id        UUID        NOT NULL REFERENCES public.talent_reviews (id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  uploader_user_id UUID        REFERENCES public.profiles (id) ON DELETE SET NULL,
  bucket_id        TEXT        NOT NULL DEFAULT 'media-public',
  storage_path     TEXT        NOT NULL,
  mime_type        TEXT,
  byte_size        BIGINT,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  approval_state   TEXT        NOT NULL DEFAULT 'approved'
                     CHECK (approval_state IN ('pending', 'approved', 'rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_talent_review_media_review
  ON public.talent_review_media (review_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talent_review_media_tenant
  ON public.talent_review_media (tenant_id, created_at DESC);

ALTER TABLE public.talent_review_media ENABLE ROW LEVEL SECURITY;

-- Public read: approved, non-deleted media whose parent review is published.
DROP POLICY IF EXISTS talent_review_media_public_select ON public.talent_review_media;
CREATE POLICY talent_review_media_public_select ON public.talent_review_media
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND approval_state = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.talent_reviews r
      WHERE r.id = review_id AND r.status = 'published'
    )
  );

-- The review's own client may INSERT media for their own review.
DROP POLICY IF EXISTS talent_review_media_client_insert ON public.talent_review_media;
CREATE POLICY talent_review_media_client_insert ON public.talent_review_media
  FOR INSERT
  WITH CHECK (
    uploader_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.talent_reviews r
      WHERE r.id = review_id AND r.client_user_id = auth.uid()
    )
  );

-- The uploader may UPDATE their own media (soft-delete). The column guard below
-- freezes approval_state + identity columns so this is effectively soft-delete.
DROP POLICY IF EXISTS talent_review_media_uploader_update ON public.talent_review_media;
CREATE POLICY talent_review_media_uploader_update ON public.talent_review_media
  FOR UPDATE
  USING (uploader_user_id = auth.uid())
  WITH CHECK (uploader_user_id = auth.uid());

-- Staff of the tenant moderate (approve / reject / soft-delete / read all).
DROP POLICY IF EXISTS talent_review_media_staff_all ON public.talent_review_media;
CREATE POLICY talent_review_media_staff_all ON public.talent_review_media
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Column guard — a non-staff caller may only toggle deleted_at. approval_state
-- and identity columns are frozen so a rejected photo can't be self-re-approved.
CREATE OR REPLACE FUNCTION public.talent_review_media_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Backend / service-role (no JWT) bypasses; staff moderate freely.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_staff_of_tenant(OLD.tenant_id) THEN RETURN NEW; END IF;

  IF NEW.approval_state   IS DISTINCT FROM OLD.approval_state
  OR NEW.review_id        IS DISTINCT FROM OLD.review_id
  OR NEW.tenant_id        IS DISTINCT FROM OLD.tenant_id
  OR NEW.uploader_user_id IS DISTINCT FROM OLD.uploader_user_id
  OR NEW.storage_path     IS DISTINCT FROM OLD.storage_path
  OR NEW.bucket_id        IS DISTINCT FROM OLD.bucket_id
  THEN
    RAISE EXCEPTION 'uploaders may only remove their own review media';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_review_media_guard ON public.talent_review_media;
CREATE TRIGGER trg_talent_review_media_guard
  BEFORE UPDATE ON public.talent_review_media
  FOR EACH ROW EXECUTE FUNCTION public.talent_review_media_guard();

GRANT SELECT ON public.talent_review_media TO anon, authenticated;
GRANT INSERT, UPDATE ON public.talent_review_media TO authenticated;

COMMENT ON TABLE public.talent_review_media IS
  'Photos attached to a client->talent review (STANDING v3 item 5). Public media-public bucket. RLS: public reads approved+non-deleted media of published reviews; the review''s client inserts/soft-deletes (approval_state frozen by trg guard); staff moderate.';

COMMIT;
