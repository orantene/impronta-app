-- TUL-1367 · Service hub: listing link (talent x workspace x service), price shown,
-- lowest price and consent.
--
-- HELD in _pending_pm. Additive only: one new table, two trigger functions, two RPCs.
-- No existing table or column changes; the trigger on talent_offerings only touches the
-- new table. The app answers "unavailable" while this is absent.
--
-- Rules (Service hub flows, approved 2026-10-19 under TUL-1365):
--   9  listing price never below the talent's lowest accepted price (or their price) +
--      the workspace minimum; the owner is alerted when a talent raises a price
--      (floor_breached_at); open offers keep their own price (offers are not read here).
--   11 the listing keeps the service's (talent's) currency.
--   20 the talent consents: only the talent can move a listing to 'accepted'.
--   Decision 4: an exclusive talent (active primary roster row) can be listed only by
--      that workspace or the Tulala hub (agencies.kind = 'hub').
-- Works for every kind of group: nothing here names a tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_service_listings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.agencies(id)          ON DELETE CASCADE,
  talent_profile_id       uuid        NOT NULL REFERENCES public.talent_profiles(id)   ON DELETE CASCADE,
  offering_id             uuid        NOT NULL REFERENCES public.talent_offerings(id)  ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'offered'
                                        CHECK (status IN ('offered','accepted','hidden')),
  price_mode              text        NOT NULL CHECK (price_mode IN ('talent_price','margin','fixed','from')),
  margin_bps              integer     NULL CHECK (margin_bps IS NULL OR (margin_bps >= 0 AND margin_bps <= 10000)),
  price_cents             bigint      NULL CHECK (price_cents IS NULL OR price_cents >= 0),
  currency                text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  talent_lowest_cents     bigint      NULL CHECK (talent_lowest_cents IS NULL OR talent_lowest_cents >= 0),
  workspace_min_cents     bigint      NOT NULL DEFAULT 0 CHECK (workspace_min_cents >= 0),
  show_who                text        NOT NULL DEFAULT 'name' CHECK (show_who IN ('name','portfolio','hidden')),
  client_contact          text        NOT NULL DEFAULT 'workspace' CHECK (client_contact IN ('workspace','talent')),
  booking_type            text        NOT NULL DEFAULT 'request' CHECK (booking_type IN ('request','instant')),
  accepted_terms_version  integer     NULL CHECK (accepted_terms_version IS NULL OR accepted_terms_version >= 1),
  talent_consented_at     timestamptz NULL,
  floor_breached_at       timestamptz NULL,
  created_by              uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_service_listings_uniq UNIQUE (tenant_id, offering_id),
  CONSTRAINT workspace_service_listings_price_shape CHECK (
    (price_mode = 'margin' AND margin_bps IS NOT NULL)
    OR (price_mode IN ('fixed','from') AND price_cents IS NOT NULL)
    OR price_mode = 'talent_price'
  ),
  CONSTRAINT workspace_service_listings_instant_needs_price CHECK (
    NOT (booking_type = 'instant' AND price_mode = 'from')
  )
);

COMMENT ON TABLE public.workspace_service_listings IS
  'TUL-1367: one row per workspace x talent x service. Talent consents (accepted), client price never below talent floor + workspace minimum, keeps the service currency, exclusive talents only by their workspace or the hub.';

CREATE INDEX IF NOT EXISTS workspace_service_listings_talent_idx
  ON public.workspace_service_listings (talent_profile_id);
CREATE INDEX IF NOT EXISTS workspace_service_listings_offering_idx
  ON public.workspace_service_listings (offering_id);

ALTER TABLE public.workspace_service_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_service_listings_read ON public.workspace_service_listings;
CREATE POLICY workspace_service_listings_read ON public.workspace_service_listings
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );
-- No direct write policies: writes go through the RPCs below.
REVOKE ALL ON public.workspace_service_listings FROM anon;

-- ---------------------------------------------------------------------------
-- Guard trigger: currency, floor, exclusivity, breach flag.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_service_listings_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount     bigint;
  v_currency   text;
  v_talent     uuid;
  v_client     bigint;
  v_floor      bigint;
  v_breach     boolean := false;
  v_exclusive  uuid;
  v_target_hub boolean;
  v_price_edit boolean;
BEGIN
  SELECT o.amount_cents, o.currency, o.talent_profile_id
    INTO v_amount, v_currency, v_talent
  FROM public.talent_offerings o WHERE o.id = NEW.offering_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'offering_not_found' USING ERRCODE = '23503';
  END IF;

  NEW.talent_profile_id := v_talent;
  NEW.currency := upper(v_currency);
  NEW.updated_at := now();

  -- Exclusivity (decision 4). Checked when a listing is created or its status changes,
  -- never on the recheck path (a talent's own price edit must not be blocked).
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  SELECT r.tenant_id INTO v_exclusive
  FROM public.agency_talent_roster r
  WHERE r.talent_profile_id = v_talent AND r.is_primary = true AND r.status = 'active'
  LIMIT 1;
  SELECT (a.kind = 'hub') INTO v_target_hub FROM public.agencies a WHERE a.id = NEW.tenant_id;
  IF NEW.status <> 'hidden' AND v_exclusive IS NOT NULL AND v_exclusive <> NEW.tenant_id
     AND NOT COALESCE(v_target_hub, false) THEN
    RAISE EXCEPTION 'exclusive_talent' USING ERRCODE = '23514';
  END IF;
  END IF;

  -- Floor (rule 9). A quote-only service (no amount) has no number to protect.
  IF v_amount IS NOT NULL THEN
    v_client := CASE NEW.price_mode
      WHEN 'talent_price' THEN v_amount
      WHEN 'margin'       THEN v_amount + round(v_amount * COALESCE(NEW.margin_bps, 0) / 10000.0)::bigint
      ELSE COALESCE(NEW.price_cents, 0)
    END;
    v_floor := COALESCE(NEW.talent_lowest_cents, v_amount) + NEW.workspace_min_cents;
    v_breach := v_client < v_floor;
  END IF;

  v_price_edit := TG_OP = 'INSERT'
    OR NEW.price_mode IS DISTINCT FROM OLD.price_mode
    OR NEW.margin_bps IS DISTINCT FROM OLD.margin_bps
    OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
    OR NEW.workspace_min_cents IS DISTINCT FROM OLD.workspace_min_cents
    OR NEW.talent_lowest_cents IS DISTINCT FROM OLD.talent_lowest_cents;

  IF v_breach AND v_price_edit AND NEW.status <> 'hidden' THEN
    RAISE EXCEPTION 'below_floor' USING ERRCODE = '23514', DETAIL = v_floor::text;
  END IF;

  -- Not a price edit (e.g. the talent raised the service price): flag, never block.
  IF v_breach THEN
    NEW.floor_breached_at := COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.floor_breached_at END, now());
  ELSE
    NEW.floor_breached_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_service_listings_guard ON public.workspace_service_listings;
CREATE TRIGGER trg_workspace_service_listings_guard
  BEFORE INSERT OR UPDATE ON public.workspace_service_listings
  FOR EACH ROW EXECUTE FUNCTION public.workspace_service_listings_guard();

-- When the talent changes the service price or currency, re-check every listing of it.
CREATE OR REPLACE FUNCTION public.talent_offerings_recheck_listings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.workspace_service_listings
     SET updated_at = now()
   WHERE offering_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_offerings_recheck_listings ON public.talent_offerings;
CREATE TRIGGER trg_talent_offerings_recheck_listings
  AFTER UPDATE OF amount_cents, currency ON public.talent_offerings
  FOR EACH ROW
  WHEN (OLD.amount_cents IS DISTINCT FROM NEW.amount_cents OR OLD.currency IS DISTINCT FROM NEW.currency)
  EXECUTE FUNCTION public.talent_offerings_recheck_listings();

-- ---------------------------------------------------------------------------
-- Owner/admin offers (or edits) a listing. A new listing is 'offered' until the talent
-- accepts. Editing keeps the status: the floor already protects the talent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_workspace_service_listing(
  p_tenant_id           uuid,
  p_offering_id         uuid,
  p_price_mode          text,
  p_margin_bps          integer,
  p_price_cents         bigint,
  p_workspace_min_cents bigint,
  p_show_who            text,
  p_client_contact      text,
  p_booking_type        text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.profile_id = (SELECT auth.uid())
        AND m.tenant_id = p_tenant_id
        AND m.status = 'active'
        AND m.role IN ('owner','admin')
    )
  ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_service_listings (
    tenant_id, talent_profile_id, offering_id, status, price_mode, margin_bps, price_cents,
    currency, workspace_min_cents, show_who, client_contact, booking_type, created_by
  )
  SELECT p_tenant_id, o.talent_profile_id, o.id, 'offered', p_price_mode, p_margin_bps, p_price_cents,
         upper(o.currency), COALESCE(p_workspace_min_cents, 0), p_show_who, p_client_contact, p_booking_type,
         (SELECT auth.uid())
  FROM public.talent_offerings o WHERE o.id = p_offering_id
  ON CONFLICT (tenant_id, offering_id) DO UPDATE
     SET price_mode = EXCLUDED.price_mode,
         margin_bps = EXCLUDED.margin_bps,
         price_cents = EXCLUDED.price_cents,
         workspace_min_cents = EXCLUDED.workspace_min_cents,
         show_who = EXCLUDED.show_who,
         client_contact = EXCLUDED.client_contact,
         booking_type = EXCLUDED.booking_type
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'offering_not_found' USING ERRCODE = '23503';
  END IF;
  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- The talent consents (accept) or says no (hidden), and may set the lowest price they
-- accept from this workspace. Only the talent who owns the service can call it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_workspace_service_listing(
  p_listing_id             uuid,
  p_accept                 boolean,
  p_talent_lowest_cents    bigint,
  p_accepted_terms_version integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_talent uuid;
BEGIN
  SELECT talent_profile_id INTO v_talent FROM public.workspace_service_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_own_talent_profile(v_talent) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspace_service_listings
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'hidden' END,
         talent_lowest_cents = p_talent_lowest_cents,
         accepted_terms_version = CASE WHEN p_accept THEN p_accepted_terms_version ELSE accepted_terms_version END,
         talent_consented_at = CASE WHEN p_accept THEN now() ELSE talent_consented_at END
   WHERE id = p_listing_id;

  RETURN CASE WHEN p_accept THEN 'accepted' ELSE 'hidden' END;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_service_listings_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talent_offerings_recheck_listings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_workspace_service_listing(uuid,uuid,text,integer,bigint,bigint,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_workspace_service_listing(uuid,boolean,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workspace_service_listing(uuid,uuid,text,integer,bigint,bigint,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_workspace_service_listing(uuid,boolean,bigint,integer) TO authenticated;

COMMIT;
