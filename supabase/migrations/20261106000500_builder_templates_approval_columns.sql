-- G4 — two-person approval for template publishing.
--
-- Records the submit/review provenance on builder_templates so the publish flow
-- can (optionally) block self-approval (publish refused when reviewer ==
-- submitter) and surface "submitted by X, reviewed by Y" in the approval queue.
--
--   submitted_by  — who pushed the template into in_review (submitTemplateForReview)
--   submitted_at  — when it entered review
--   reviewed_by   — who acted on the review (publishTemplate / rejectToDraft)
--   reviewed_at   — when the review action landed
--   review_note   — reviewer's note (e.g. the rejection reason)
--
-- Additive + idempotent. Both actor columns FK profiles(id) with ON DELETE SET
-- NULL so a deleted reviewer/submitter never blocks the row.

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.builder_templates.submitted_by
  IS 'G4: actor who submitted the template for review (submitTemplateForReview).';
COMMENT ON COLUMN public.builder_templates.submitted_at
  IS 'G4: when the template entered in_review.';
COMMENT ON COLUMN public.builder_templates.reviewed_by
  IS 'G4: actor who reviewed (publishTemplate approval / rejectToDraft). Self-approve guard compares this against submitted_by.';
COMMENT ON COLUMN public.builder_templates.reviewed_at
  IS 'G4: when the review action (publish/reject) landed.';
COMMENT ON COLUMN public.builder_templates.review_note
  IS 'G4: reviewer note (e.g. the rejection reason). Threads into the revision snapshot via normalizeChangelog.';
