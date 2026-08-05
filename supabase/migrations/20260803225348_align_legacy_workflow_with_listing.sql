-- Align the legacy lifecycle columns with the unified public-listing gate.
--
-- 20260803203521 made `talent_profiles.is_publicly_listed` (driven by the
-- roster eye) the single public gate, but profiles approved via the eye BEFORE
-- that migration still carry workflow_status='hidden'/'draft'. The drawer's
-- status pill reads the legacy column, so those profiles show "Hidden" while
-- being live on the public site — and the pill's dropdown then hides the
-- "Published" option entirely.
--
-- One-time repair: a talent the eye has made publicly listed is, by
-- definition, approved+public on the legacy axis too (this is exactly what the
-- roster bulk-publish writes). Forward-looking rows don't need this — the
-- drawer's status control and the eye are trigger- and action-synced since
-- 20260803203521 + PR #975.
--
-- Scope measured on prod before writing: 1 row (rocio, TAL-92025).

UPDATE public.talent_profiles
   SET workflow_status = 'approved',
       visibility      = 'public',
       updated_at      = now()
 WHERE is_publicly_listed = true
   AND workflow_status NOT IN ('approved', 'published');
