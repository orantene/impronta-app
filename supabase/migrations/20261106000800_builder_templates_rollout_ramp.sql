-- G8 — scheduled / timed rollout ramp + auto-archive.
--
-- Adds the columns the flag-gated rollout cron reads to advance a template's
-- staged rollout unattended ("canary 10% → 100% over the weekend") and to flip
-- long-stale drafts to archived:
--
--   rollout_ramp_to    — the target rollout_percentage the cron ramps toward.
--                        When the live rollout_percentage reaches this value the
--                        cron clears both ramp columns (the ramp is complete).
--   rollout_ramp_at    — the next time the cron should advance this template's
--                        rollout_percentage one step toward rollout_ramp_to.
--                        Rows with rollout_ramp_at <= now() are due.
--   status_expire_at   — when set on a draft, the cron flips the row to
--                        status='archived' once now() >= status_expire_at
--                        (auto-archive of long-stale drafts).
--
-- Additive + idempotent. All three are nullable: a NULL leaves the row out of
-- the cron's working set entirely (no ramp scheduled / no expiry set).

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS rollout_ramp_to integer;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS rollout_ramp_at timestamptz;

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS status_expire_at timestamptz;

COMMENT ON COLUMN public.builder_templates.rollout_ramp_to
  IS 'G8: target rollout_percentage [0,100] the timed-rollout cron ramps toward; cleared (with rollout_ramp_at) once reached.';
COMMENT ON COLUMN public.builder_templates.rollout_ramp_at
  IS 'G8: next due time for the rollout cron to advance rollout_percentage one step toward rollout_ramp_to. NULL ⇒ no ramp scheduled.';
COMMENT ON COLUMN public.builder_templates.status_expire_at
  IS 'G8: when set on a draft, the rollout cron auto-archives the row once now() >= this. NULL ⇒ never auto-archive.';
