-- Phase 12 (CMS) — Scheduled publish.
--
-- Operators can schedule a future publish from the editor topbar instead of
-- having to be online at the publish moment. The cron worker (see
-- /web/src/app/api/cron/publish-scheduled/route.ts, gated by Vercel cron
-- secret) sweeps every minute, finds rows whose scheduled_publish_at <= now()
-- and whose status is still 'draft', then calls the same publishHomepage()
-- code path the operator would have hit manually.
--
-- Columns are nullable so legacy rows continue to parse. Tenant isolation is
-- inherited from existing cms_pages RLS — no new policies needed.
--
-- scheduled_revision_id is reserved for the next iteration that lets an
-- operator pin a specific revision to publish at the scheduled time. The
-- v1 cron simply publishes whatever the draft contains at fire time. We
-- add the column now so a follow-up migration doesn't need a column-add.

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_revision_id UUID REFERENCES public.cms_page_revisions (id) ON DELETE SET NULL;

-- Sweep index: cron route runs `WHERE status='draft' AND scheduled_publish_at <= now()`.
-- Partial index keeps it tiny — only rows with a scheduled fire time are indexed,
-- and only while they're still draft.
CREATE INDEX IF NOT EXISTS idx_cms_pages_scheduled_sweep
  ON public.cms_pages (scheduled_publish_at)
  WHERE scheduled_publish_at IS NOT NULL
    AND status = 'draft';

-- Sanity check: scheduled fire time must be in the future relative to when
-- it's set. Trigger fires only on INSERT/UPDATE that touches the column;
-- a NULL → NULL UPDATE (clearing) is fine. Keeps server actions honest;
-- the UI also blocks past timestamps but we want the constraint at the DB.
CREATE OR REPLACE FUNCTION public.cms_pages_scheduled_publish_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scheduled_publish_at IS NOT NULL
     AND (OLD.scheduled_publish_at IS NULL
          OR OLD.scheduled_publish_at IS DISTINCT FROM NEW.scheduled_publish_at)
     AND NEW.scheduled_publish_at < now() - INTERVAL '1 minute'
  THEN
    RAISE EXCEPTION 'scheduled_publish_at must be in the future (got %)', NEW.scheduled_publish_at
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cms_pages_scheduled_publish_check ON public.cms_pages;
CREATE TRIGGER cms_pages_scheduled_publish_check
  BEFORE INSERT OR UPDATE OF scheduled_publish_at ON public.cms_pages
  FOR EACH ROW
  EXECUTE PROCEDURE public.cms_pages_scheduled_publish_check();

COMMENT ON COLUMN public.cms_pages.scheduled_publish_at IS
  'Phase 12 — UTC timestamp at which the cron sweep will publish this page. NULL means unscheduled. Cleared automatically when the cron successfully publishes.';
COMMENT ON COLUMN public.cms_pages.scheduled_by IS
  'Phase 12 — staff profile that scheduled the publish. Null on legacy + unscheduled rows.';
COMMENT ON COLUMN public.cms_pages.scheduled_revision_id IS
  'Phase 12 (reserved) — pin a specific revision to publish at the scheduled fire time. v1 publishes whatever the draft contains at fire time; v2 will read this column.';
