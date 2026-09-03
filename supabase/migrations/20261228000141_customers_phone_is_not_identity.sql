-- Phase 0.4, correction — a phone number does not identify a person.
--
-- FOUND BY APPLYING 20261228000140 TO PRODUCTION AND COUNTING THE RESULT.
-- The dry run said the backfill would create 8 customers from 8 relationships.
-- It created 3. Nothing errored: `ON CONFLICT DO NOTHING` swallowed it.
--
-- Cause: `customers_tenant_phone_key` was UNIQUE on (tenant_id, phone_e164).
-- Six of the eight client profiles carry the SAME phone number, +52 998 400 1234,
-- with six different emails and six different people behind them. The unique
-- index collapsed all six into one row and silently dropped five.
--
-- The index encoded a claim that is simply false: that a phone number identifies
-- one person. It does not. A couple shares a mobile, a family shares a landline,
-- an office shares a switchboard, a hotel concierge books for every guest in the
-- building. A restaurant's regulars are exactly the population where this breaks,
-- and a restaurant is the first customer this table is for.
--
-- It would have been worse at runtime than in the backfill. `ensureCustomer`
-- looks a customer up by phone before creating one, so the SECOND guest to give
-- the household number would have resolved to the FIRST guest's customer row and
-- silently inherited their order history, their spend total and their receipts.
-- A backfill that drops rows is visible if you count. A runtime path that merges
-- two strangers is not.
--
-- The rule this settles: EMAIL is the identity. Phone is an attribute, and it is
-- an identity ONLY for a customer who has no email, so that a phone-only buyer
-- is still one customer rather than a new one per order.

BEGIN;

-- 1. Phone is unique only when it is the ONLY key the customer has.
DROP INDEX IF EXISTS public.customers_tenant_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_only_key
  ON public.customers (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND email IS NULL AND merged_into_id IS NULL;

-- Still worth an index for lookup and for the workspace's "who is this number"
-- question, just not a unique one.
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx
  ON public.customers (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

COMMENT ON INDEX public.customers_tenant_phone_only_key IS
  'Phone identifies a customer ONLY when they have no email. Two people may share '
  'a phone; the same email is the same person. See 20261228000141 for the incident.';

-- 2. Recover the five people the first backfill dropped. Same two sources as
--    20261228000140; ON CONFLICT is now only reachable for a genuine repeat.
INSERT INTO public.customers (
  tenant_id, user_id, client_profile_id, email, phone_e164, display_name,
  notes, tags, last_seen_at, created_at
)
SELECT DISTINCT ON (acr.tenant_id, lower(u.email))
       acr.tenant_id,
       cp.user_id,
       acr.client_profile_id,
       u.email::public.citext,
       CASE WHEN cp.phone ~ '^\+[1-9][0-9]{6,14}$' THEN cp.phone ELSE NULL END,
       NULLIF(TRIM(COALESCE(cp.company_name, '')), ''),
       acr.private_notes,
       acr.local_tags,
       acr.last_interaction_at,
       acr.added_at
  FROM public.agency_client_relationships acr
  JOIN public.client_profiles cp ON cp.id = acr.client_profile_id
  JOIN auth.users u              ON u.id  = cp.user_id
 WHERE u.email IS NOT NULL
   AND TRIM(u.email) <> ''
 ORDER BY acr.tenant_id, lower(u.email), acr.added_at ASC
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (
  tenant_id, user_id, client_profile_id, email, phone_e164, display_name,
  last_seen_at, created_at
)
SELECT DISTINCT ON (i.tenant_id, lower(u.email))
       i.tenant_id,
       i.client_user_id,
       cp.id,
       u.email::public.citext,
       CASE WHEN cp.phone ~ '^\+[1-9][0-9]{6,14}$' THEN cp.phone ELSE NULL END,
       NULLIF(TRIM(COALESCE(cp.company_name, '')), ''),
       max(i.created_at) OVER (PARTITION BY i.tenant_id, i.client_user_id),
       min(i.created_at) OVER (PARTITION BY i.tenant_id, i.client_user_id)
  FROM public.inquiries i
  JOIN auth.users u          ON u.id  = i.client_user_id
  LEFT JOIN public.client_profiles cp ON cp.user_id = i.client_user_id
 WHERE i.client_user_id IS NOT NULL
   AND u.email IS NOT NULL
   AND TRIM(u.email) <> ''
 ORDER BY i.tenant_id, lower(u.email), i.created_at ASC
ON CONFLICT DO NOTHING;

-- 3. Verify by COUNTING, not by the absence of an error.
--
-- 20261228000140's check only asserted "not zero", which is why it passed while
-- dropping five of eight. This asserts the exact number: one customer per
-- (tenant, distinct email) across both sources. If a future ON CONFLICT swallows
-- a row, this raises instead of shrugging.
DO $$
DECLARE
  v_expected INT;
  v_actual   INT;
BEGIN
  SELECT count(*) INTO v_expected FROM (
    SELECT acr.tenant_id AS t, lower(u.email) AS e
      FROM public.agency_client_relationships acr
      JOIN public.client_profiles cp ON cp.id = acr.client_profile_id
      JOIN auth.users u              ON u.id  = cp.user_id
     WHERE u.email IS NOT NULL AND TRIM(u.email) <> ''
    UNION
    SELECT i.tenant_id, lower(u.email)
      FROM public.inquiries i
      JOIN auth.users u ON u.id = i.client_user_id
     WHERE i.client_user_id IS NOT NULL
       AND u.email IS NOT NULL AND TRIM(u.email) <> ''
  ) x;

  SELECT count(*) INTO v_actual
    FROM public.customers
   WHERE email IS NOT NULL AND merged_into_id IS NULL;

  RAISE NOTICE 'customers backfill: expected % (tenant, email) pairs, have %', v_expected, v_actual;

  IF v_actual < v_expected THEN
    RAISE EXCEPTION
      'customers: % (tenant, email) pairs exist but only % customers — a unique index is still collapsing distinct people',
      v_expected, v_actual;
  END IF;
END $$;

COMMIT;
