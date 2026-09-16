-- Onboarding module: resume + build record on the brief.
--
-- `module_state` holds the shared onboarding overlay's progress for one brief:
-- the current step, the AI understanding card, the person's answers and path
-- choice, and the build/arrival record. Written by service-role server actions
-- after every step so a closed phone reopens where it stopped and the guest →
-- account boundary keeps the same brief. Additive, defaulted, no backfill.
--
-- Sorts after 20261231238000 (this repo future-dates its migrations).
ALTER TABLE public.tulala_briefs
  ADD COLUMN IF NOT EXISTS module_state JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tulala_briefs.module_state IS
  'Onboarding module resume + build record (step, understanding, answers, path, build). Service-role writes only.';
