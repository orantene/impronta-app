-- Widen `saas_marketing_signups.audience` to accept 'business'.
--
-- WHY: `agencies.workspace_type` ('talent' | 'business') and the `website`
-- plan tier both already exist in production, but nobody could ever reach
-- them — /get-started only accepted operator/agency/organization, and this
-- CHECK constraint would have rejected a 'business' lead at the INSERT even
-- if the app had sent one. This is the DB half of the business front door.
--
-- Original constraint (20260626120000_saas_marketing_signups.sql):
--   CHECK (audience IN ('operator','agency','organization'))
--
-- Purely additive: every existing row still satisfies the widened predicate,
-- so the constraint is re-added without a table rewrite of existing data.

ALTER TABLE public.saas_marketing_signups
  DROP CONSTRAINT IF EXISTS saas_marketing_signups_audience_check;

ALTER TABLE public.saas_marketing_signups
  ADD CONSTRAINT saas_marketing_signups_audience_check
  CHECK (audience IN ('operator', 'agency', 'organization', 'business'));
