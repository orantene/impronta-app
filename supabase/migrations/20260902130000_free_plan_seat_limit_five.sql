-- Align Free workspace roster cap with the product contract (5 profiles).
--
-- Existing scaffolds used 10 as an early placeholder. The current SaaS
-- matrix is binding: Free = up to 5 talent profiles.

BEGIN;

UPDATE public.agencies
   SET talent_seat_limit = 5
 WHERE plan_tier = 'free';

COMMENT ON COLUMN public.agencies.talent_seat_limit IS
  'Talent roster cap for this tenant. NULL = unlimited (Network). Current defaults: free=5, studio=50, agency=200, network=NULL.';

COMMIT;
