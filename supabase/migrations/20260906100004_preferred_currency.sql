-- Add preferred_currency to agencies so workspace owners can lock their
-- billing checkout to a specific presentment currency (e.g. MXN, EUR).
-- NULL = let Stripe Adaptive Pricing auto-detect (default behaviour).
-- Values are lowercase ISO 4217 codes (stripe convention: "usd", "mxn", …).

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT NULL;

COMMENT ON COLUMN agencies.preferred_currency IS
  'Preferred Stripe presentment currency (lowercase ISO 4217, e.g. "mxn"). '
  'NULL = Adaptive Pricing auto-detect.';
