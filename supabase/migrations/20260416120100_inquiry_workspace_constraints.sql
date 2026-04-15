-- Inquiry workspace V2: activity log actor metadata + next_action_by admin + optional constraints
-- NOTE: version must be unique vs 20260416120000_cms_pages_and_redirects (Supabase PK = 14-digit prefix).

BEGIN;

-- Allow 'admin' in next_action_by (drop/re-add column check if present on fresh DBs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inquiries' AND column_name = 'next_action_by'
  ) THEN
    ALTER TABLE public.inquiries DROP CONSTRAINT IF EXISTS inquiries_next_action_by_check;
    ALTER TABLE public.inquiries
      ADD CONSTRAINT inquiries_next_action_by_check
      CHECK (next_action_by IS NULL OR next_action_by IN ('client', 'coordinator', 'talent', 'system', 'admin'));
  END IF;
END $$;

ALTER TABLE public.inquiry_activity_log
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user'
    CHECK (actor_type IN ('user', 'system'));

ALTER TABLE public.inquiry_activity_log
  ADD COLUMN IF NOT EXISTS event_category TEXT NOT NULL DEFAULT 'workflow'
    CHECK (event_category IN ('workflow', 'system', 'admin_override'));

UPDATE public.inquiry_activity_log
SET actor_type = 'system'
WHERE actor_user_id IS NULL AND actor_type = 'user';

COMMIT;
