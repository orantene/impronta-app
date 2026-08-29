-- Support Center Round 2 W2 — editable canned replies.
--
-- JSONB column on the platform_settings singleton. Null means "use the
-- hardcoded default list in web/src/lib/platform/support-canned.ts".
--
-- NOT APPLIED — integrator must `npm run db:push` before merge.

BEGIN;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS support_canned_replies JSONB;

COMMENT ON COLUMN public.platform_settings.support_canned_replies IS
  'HQ-editable canned replies for the support composer. Null = code defaults. Array of {id, title, body}.';

COMMIT;
