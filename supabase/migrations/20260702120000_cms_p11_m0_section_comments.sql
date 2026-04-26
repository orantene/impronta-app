-- Phase 11 (CMS) — In-context comments on homepage sections.
--
-- Operators (and reviewers visiting via a share link) can attach threaded
-- comments to a specific section of the homepage from inside the editor
-- chrome. Comments resolve and unresolve; deletions are soft (so a thread
-- doesn't suddenly drop replies that quoted the original).
--
-- v1 scope:
--   - Tenant + page + section scoped.
--   - Author can be a real auth.users row (staff) OR a share-link reviewer
--     identified by an opaque ID + display name carried in their JWT claim.
--   - Threading: parent_comment_id; null = top-level thread.
--   - Resolved markers (resolved_at + resolved_by_user_id) are staff-set.
--   - Realtime subscriptions read straight from this table (publication
--     enabled at the bottom).
--
-- Out of scope for v1 (intentional):
--   - @mentions notification fan-out (column reserved; no trigger yet).
--   - Attachments (use linked media via the existing assets library).
--   - Multi-page (when Phase 24 lights up multi-page, page_id already does
--     the right thing — the table is forward-compatible).

-- ---- main table ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cms_section_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Phase B.2.A fix (2026-04-26): table was authored with a typo — the
  -- canonical multi-tenant root table is `public.agencies` (see saas/p1
  -- migrations); `public.tenants` does not exist and caused this migration
  -- to fail to apply on prod for weeks. Corrected here so `db push` can
  -- proceed; behavior identical to what the original migration intended.
  tenant_id UUID NOT NULL REFERENCES public.agencies (id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.cms_pages (id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.cms_section_comments (id) ON DELETE CASCADE,

  -- Body. Plain text in v1; mention parsing happens client-side from a
  -- canonical token (`@profile-id`) so the DB doesn't need to know about
  -- mention syntax.
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),

  -- Author identity. Exactly one of (author_user_id) or (author_share_link_id +
  -- author_display_name) must be set — enforced by a check constraint below.
  author_kind TEXT NOT NULL CHECK (author_kind IN ('staff', 'reviewer')),
  author_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  author_share_link_id UUID,
  author_display_name TEXT,

  -- Reserved — populated by client at insert time. Empty array on v1 since
  -- the mention-picker UI isn't shipping in this phase.
  mentions UUID[] NOT NULL DEFAULT '{}'::UUID[],

  -- Resolve state. Only staff can resolve (enforced in server action +
  -- via RLS — reviewers can't UPDATE these columns).
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,

  -- Soft delete so replies don't lose their parent visually.
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cms_section_comments_author_identity_check CHECK (
    (author_kind = 'staff' AND author_user_id IS NOT NULL
        AND author_share_link_id IS NULL)
    OR (author_kind = 'reviewer' AND author_share_link_id IS NOT NULL
        AND author_display_name IS NOT NULL
        AND author_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cms_section_comments_page_section
  ON public.cms_section_comments (tenant_id, page_id, section_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cms_section_comments_thread
  ON public.cms_section_comments (parent_comment_id, created_at)
  WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cms_section_comments_unresolved
  ON public.cms_section_comments (tenant_id, page_id)
  WHERE resolved_at IS NULL AND deleted_at IS NULL AND parent_comment_id IS NULL;

-- updated_at maintenance ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.cms_section_comments_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cms_section_comments_set_updated_at
  ON public.cms_section_comments;
CREATE TRIGGER cms_section_comments_set_updated_at
  BEFORE UPDATE ON public.cms_section_comments
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_section_comments_set_updated_at();

-- ---- RLS ----------------------------------------------------------------

ALTER TABLE public.cms_section_comments ENABLE ROW LEVEL SECURITY;

-- Staff: full CRUD on every comment in their tenants. The is_agency_staff()
-- helper already gates by app_role; tenant scoping is enforced in the
-- server action (which passes tenant_id explicitly) and by FK to cms_pages
-- (which itself is tenant-scoped). Mirrors the pattern used for cms_pages.
CREATE POLICY cms_section_comments_staff_all ON public.cms_section_comments
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());

-- Reviewer reads/writes are NOT done via direct RLS — the share-link JWT
-- doesn't carry an auth.users session, so RLS can't see it. Instead the
-- server actions for reviewer-authored comments use the service-role
-- client (which bypasses RLS) AFTER validating the share-link claim and
-- the `comment` permission level. That keeps the trust boundary in one
-- place (the JWT check) rather than scattered across RLS policies that
-- can't talk to the JWT.

COMMENT ON TABLE public.cms_section_comments IS
  'Phase 11 — threaded comments on homepage sections. Staff and share-link reviewers both author here. Realtime publication enabled below; subscribers filter on (tenant_id, page_id) per channel.';

-- ---- realtime publication -----------------------------------------------

-- Idempotent: ALTER PUBLICATION ADD will throw if the table is already in
-- the publication, so we wrap in DO/EXCEPTION.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.cms_section_comments;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_object THEN
    -- Local dev environments without the supabase_realtime publication
    -- shouldn't crash the migration; Realtime just won't fire there.
    NULL;
END;
$$;
