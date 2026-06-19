-- Builder Lab Audit — actor_label (P5: representable system/cron actor)
-- ============================================================================
-- The `actor` column is a nullable uuid FK to public.profiles, so it can only
-- hold a real human super-admin. System writers (e.g. the builder-rollout-ramp
-- cron) have no profile row, so they were forced to pass actor = NULL — the
-- Activity feed then renders a blank actor for those transitions.
--
-- This adds a free-text `actor_label` column so a non-human writer can stamp a
-- stable, human-readable identity ("system:builder-rollout-cron") on its audit
-- rows. The display layer falls back to actor_label when actor is null, so the
-- feed shows who/what actually drove a transition instead of blank.
--
-- Idempotent + additive: the column is nullable with no default, so existing
-- rows and existing human-actored writes are unaffected.
-- ============================================================================

BEGIN;

ALTER TABLE public.builder_lab_audit
  ADD COLUMN IF NOT EXISTS actor_label text;

COMMENT ON COLUMN public.builder_lab_audit.actor_label IS
  'Free-text actor identity for non-human writers (e.g. "system:builder-rollout-cron"). Used by the Activity feed as a display fallback when actor (uuid FK) is null.';

COMMIT;
