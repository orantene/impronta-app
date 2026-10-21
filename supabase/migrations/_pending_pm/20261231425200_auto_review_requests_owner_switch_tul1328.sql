-- TUL-1328 (P2, staging QA re-fail): automatic review-request emails (#4089)
-- have a global kill switch but no per-business off switch. A business owner
-- who wants manual review requests but not automatic post-booking nagging has
-- no way to say so.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies
-- it. NOT applied by the author.
--
-- Default true (opt-out model): once the global AUTO_REVIEW_REQUESTS_ENABLED
-- kill switch is on, every business gets automatic requests unless its owner
-- turns this off, mirroring reviews_enabled's own default-on precedent
-- (20261201000000_reviews_enabled_default_on.sql). Distinct from
-- reviews_enabled, which gates whether reviews show at all; this gates only
-- the automatic email, so a business can keep manual review requests and
-- public review display while opting out of the automatic nag.
--
-- Idempotent (IF NOT EXISTS).

BEGIN;

ALTER TABLE public.agency_entitlements
  ADD COLUMN IF NOT EXISTS auto_review_requests_enabled boolean NOT NULL DEFAULT true;

COMMIT;
