-- Phase 0.4 — `customers`: a workspace-scoped buyer that does not need an account.
--
-- WHY THIS TABLE EXISTS, precisely.
--
-- The workspace's idea of "a client" today is `agency_client_relationships`.
-- Its columns are: tenant_id, client_profile_id NOT NULL, source_type, status,
-- private_notes, local_tags, first_inquiry_id, last_interaction_at, added_by,
-- added_at, source_workspace_id, origin_domain. There is NO email column and NO
-- phone column. Identity is `client_profile_id`, and a `client_profiles` row
-- requires an `auth.users` row.
--
-- It is worse one level down: `client_profiles` has no email and no name column
-- either (id, user_id, company_name, phone, notes, verification_status,
-- trust_tier, ...). The ONLY place a client's email exists is `auth.users`.
-- That is why the workspace Clients page reaches for inquiries instead, and why
-- an email-only buyer is not representable anywhere in the current schema.
--
-- That is the mechanical cause of a bug the department has been treating as a
-- separate problem: `lib/inquiry/guest-client.ts` calls
-- `admin.auth.admin.createUser` on every guest submit. It does that because the
-- client list has nowhere else to put a person. A guest who buys a taco is
-- given a real authentication identity, forever, so that a workspace can see
-- who bought the taco.
--
-- So this table does not merely "enable guest checkout". It removes the reason
-- guests were being provisioned at all. Email or phone is the identity;
-- `user_id` is what a customer gains LATER if they ever sign up, not a
-- precondition for existing.
--
-- Scoping: per tenant, deliberately. The same human at two agencies is two
-- customers with two histories, which matches the profile-presentation
-- ownership model already agreed for talent.
--
-- `agency_client_relationships` is NOT dropped here. Expand, then contract:
-- this release adds the table and backfills it; a later one moves the readers
-- and only then removes the old one.

BEGIN;

-- citext is already installed in `public` on this project (verified before
-- writing this migration). Email is compared case-insensitively everywhere a
-- human types it, and a functional `lower()` unique index would make every
-- caller remember to lower the value first. One of them eventually would not.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Identity. All three are nullable; the CHECK below requires at least one of
  -- email/phone. `user_id` is set when (and if) the person signs up with an
  -- address the workspace already knows.
  user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_profile_id   UUID REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  email               public.citext,
  phone_e164          TEXT,

  display_name        TEXT,
  locale              TEXT,

  -- Roll-ups. Maintained by trigger from `orders` (Phase 0.5) and later from
  -- `admissions` (Phase 1). Never written by hand.
  visits              INTEGER NOT NULL DEFAULT 0,
  spend_cents         BIGINT  NOT NULL DEFAULT 0,
  no_shows            INTEGER NOT NULL DEFAULT 0,
  last_seen_at        TIMESTAMPTZ,

  notes               TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',

  -- Merge support ships WITH the unique indexes, not after them. A merged row
  -- has to stop competing for its own email the moment merging is possible, or
  -- the first merge violates the index it was supposed to respect.
  merged_into_id      UUID REFERENCES public.customers(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customers_has_a_key
    CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL),
  CONSTRAINT customers_phone_e164_shape
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT customers_rollups_nonneg
    CHECK (visits >= 0 AND spend_cents >= 0 AND no_shows >= 0),
  CONSTRAINT customers_not_merged_into_self
    CHECK (merged_into_id IS NULL OR merged_into_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_email_key
  ON public.customers (tenant_id, email)
  WHERE email IS NOT NULL AND merged_into_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_phone_key
  ON public.customers (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL AND merged_into_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_user_key
  ON public.customers (tenant_id, user_id)
  WHERE user_id IS NOT NULL AND merged_into_id IS NULL;

CREATE INDEX IF NOT EXISTS customers_tenant_last_seen_idx
  ON public.customers (tenant_id, last_seen_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS customers_client_profile_idx
  ON public.customers (client_profile_id)
  WHERE client_profile_id IS NOT NULL;

COMMENT ON TABLE public.customers IS
  'Workspace-scoped buyer. Email or phone is the identity; user_id is optional and '
  'is gained if the person later signs up. Replaces the auth.users provisioning that '
  'agency_client_relationships forced on every guest.';
COMMENT ON COLUMN public.customers.spend_cents IS
  'Integer cents, recomputed by trigger from paid orders minus refunds. Never incremented.';

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customers_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_touch ON public.customers;
CREATE TRIGGER customers_touch
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_touch_updated_at();

REVOKE ALL ON FUNCTION public.customers_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.customers_touch_updated_at() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Roll-ups.
--
-- RECOMPUTE, never increment. An incremental counter drifts the first time a
-- status transition is replayed, and this platform's Stripe webhooks retry by
-- design. A recompute over one customer's orders is a handful of rows and stays
-- correct under replay.
--
-- The body is written now but reads `orders`, which arrives in 0.5. It is
-- guarded on the table existing so this migration is standalone-safe; 0.5
-- re-creates the function with the guard removed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_customer_rollups(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $q$
    UPDATE public.customers c
       SET visits       = COALESCE(o.visits, 0),
           spend_cents  = COALESCE(o.spend_cents, 0),
           last_seen_at = o.last_seen_at
      FROM (
        SELECT count(*) FILTER (
                 WHERE status IN ('paid','fulfilled','partially_refunded')
               ) AS visits,
               -- Gross of what was actually charged. Refund deduction lands in
               -- 0.8b, when refund rows exist to deduct; until then a partially
               -- refunded order counts at its full total and this comment is
               -- the honest statement of that.
               COALESCE(sum(total_cents) FILTER (
                 WHERE status IN ('paid','fulfilled','partially_refunded')
               ), 0) AS spend_cents,
               max(created_at) AS last_seen_at
          FROM public.orders
         WHERE customer_id = $1
      ) o
     WHERE c.id = $1
  $q$ USING p_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_customer_rollups(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_rollups(UUID) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Staff of the tenant read; nothing client-side writes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_staff_select ON public.customers;
CREATE POLICY customers_staff_select ON public.customers
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

-- A signed-in customer may read their own row, so /me can show their history
-- without a service-role round trip.
DROP POLICY IF EXISTS customers_self_select ON public.customers;
CREATE POLICY customers_self_select ON public.customers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policy exists on purpose: every write goes through
-- the service role, in the purchase pipeline. Roll-ups in particular must never
-- be settable by a client.

-- Defence in depth. Supabase grants table privileges to anon and authenticated
-- on every new table, so RLS would otherwise be the only thing standing between
-- a client and a customer list. Both halves are required: a REVOKE from PUBLIC
-- alone leaves the explicit role grants in place (see 20261226000011).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.customers FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.customers FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill from agency_client_relationships.
--
-- 8 rows in production at the time of writing. Email comes from the linked
-- client_profile; a relationship whose profile has no email is skipped rather
-- than invented, and is reported by the verification block below.
-- ─────────────────────────────────────────────────────────────────────────────
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

-- Second source: clients known only through an inquiry.
--
-- The Clients page today lists anyone with an inquiry against the tenant, which
-- is a WIDER set than agency_client_relationships by construction — creating an
-- inquiry does not guarantee a relationship row. In production right now the gap
-- is 0 (1 distinct inquiry client, and it has a relationship), but the gap is
-- structural, not accidental. Backfilling only from relationships would make the
-- page silently drop a client the first time the two diverge.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify, in the migration, that the grants actually took and the backfill did
-- not silently drop everyone. A green `db:check` line has lied here before.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_relationships INT;
  v_backfilled    INT;
  v_skipped       INT;
BEGIN
  IF has_table_privilege('anon', 'public.customers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.customers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customers', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customers', 'DELETE')
  THEN
    RAISE EXCEPTION 'customers: a revoke did not take — client roles still hold write or anon-read access';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.customers', 'INSERT') THEN
    RAISE EXCEPTION 'customers: service_role cannot write — the purchase pipeline would record nothing';
  END IF;

  SELECT count(*) INTO v_relationships FROM public.agency_client_relationships;
  SELECT count(*) INTO v_backfilled    FROM public.customers;

  SELECT count(*) INTO v_skipped
    FROM public.agency_client_relationships acr
    LEFT JOIN public.client_profiles cp ON cp.id = acr.client_profile_id
    LEFT JOIN auth.users u              ON u.id  = cp.user_id
   WHERE u.email IS NULL OR TRIM(COALESCE(u.email, '')) = '';

  RAISE NOTICE 'customers backfill: % relationship rows, % customers created, % skipped for a missing email',
    v_relationships, v_backfilled, v_skipped;

  IF v_relationships > 0 AND v_backfilled = 0 THEN
    RAISE EXCEPTION 'customers: % relationships exist but the backfill created 0 customers', v_relationships;
  END IF;
END $$;

COMMIT;
