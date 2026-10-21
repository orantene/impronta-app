-- TUL-1367 · Service hub: listing link (talent x workspace x service), price shown,
-- lowest price and consent.
--
-- HELD in _pending_pm. Additive only: two new tables, two trigger functions, three
-- functions (two RPCs + one sellable check). No existing table or column changes; the
-- trigger on talent_offerings only touches the new table. The app answers "unavailable"
-- while this is absent.
--
-- DEPENDS (softly) ON #4158 (20261231419200_workspace_talent_terms_tul1368.sql): exclusivity
-- reads public.talent_exclusive_workspace and consent reads public.workspace_talent_terms.
-- Both are looked up only when they exist (to_regclass): without them nothing is exclusive
-- and NO listing can be accepted (consent fails closed until the terms exist).
--
-- Rules (PM-confirmed 2026-10-19):
--   Floor  = MAX(talent's lowest accepted price, else their price; effective minimum).
--            The minimum is a floor on the client price, NOT a margin.
--   Effective minimum = MAX(workspace minimum, listing minimum): a listing may raise it,
--            never lower it.
--   Consent: only the talent accepts, bound to their latest ACCEPTED workspace terms
--            (show-who never more revealing, same price mode); any owner change to what
--            the talent agreed to sends the listing back to 'offered'.
--   Exclusive talents: only their exclusive workspace (accepted exclusive terms) or the
--            Tulala hub (agencies.kind = 'hub').
--   Currency: the listing keeps the service currency. If the talent changes it, the
--            listing is stopped (offered, floor flagged, fixed price and listing minimum
--            cleared) until the talent re-accepts. Open offers keep their own price.
--
-- NOT WIRED TO SELLING: no reader/checkout uses listings yet. The reader PR MUST use
-- public.workspace_service_listing_is_sellable().
--
-- ROLLBACK (nothing reads these objects yet):
--   DROP TRIGGER IF EXISTS trg_talent_offerings_recheck_listings ON public.talent_offerings;
--   DROP FUNCTION IF EXISTS public.talent_offerings_recheck_listings();
--   DROP FUNCTION IF EXISTS public.workspace_service_listing_is_sellable(uuid);
--   DROP FUNCTION IF EXISTS public.respond_workspace_service_listing(uuid, boolean, bigint);
--   DROP FUNCTION IF EXISTS public.upsert_workspace_service_listing(uuid,uuid,text,integer,bigint,bigint,text,text,text);
--   DROP TABLE IF EXISTS public.workspace_service_listings;   -- drops its guard trigger
--   DROP FUNCTION IF EXISTS public.workspace_service_listings_guard();
--   DROP TABLE IF EXISTS public.workspace_service_hub_settings;

BEGIN;

-- Workspace-wide Service hub settings (one row per workspace). Minimum client price for
-- roster listings; applied in each service's own currency.
CREATE TABLE IF NOT EXISTS public.workspace_service_hub_settings (
  tenant_id          uuid        PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  listing_min_cents  bigint      NOT NULL DEFAULT 0
                                   CHECK (listing_min_cents >= 0 AND listing_min_cents <= 1000000000000),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_service_hub_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_service_hub_settings_read ON public.workspace_service_hub_settings;
CREATE POLICY workspace_service_hub_settings_read ON public.workspace_service_hub_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.is_staff_of_tenant(tenant_id));
-- Written by the Service hub settings screen (later card); no write policy here.
REVOKE ALL ON public.workspace_service_hub_settings FROM anon;

CREATE TABLE IF NOT EXISTS public.workspace_service_listings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid        NOT NULL REFERENCES public.agencies(id)          ON DELETE CASCADE,
  talent_profile_id       uuid        NOT NULL REFERENCES public.talent_profiles(id)   ON DELETE CASCADE,
  offering_id             uuid        NOT NULL REFERENCES public.talent_offerings(id)  ON DELETE CASCADE,
  status                  text        NOT NULL DEFAULT 'offered'
                                        CHECK (status IN ('offered','accepted','hidden')),
  price_mode              text        NOT NULL CHECK (price_mode IN ('talent_price','margin','fixed','from')),
  margin_bps              integer     NULL CHECK (margin_bps IS NULL OR (margin_bps >= 0 AND margin_bps <= 10000)),
  price_cents             bigint      NULL CHECK (price_cents IS NULL OR (price_cents >= 0 AND price_cents <= 1000000000000)),
  currency                text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  talent_lowest_cents     bigint      NULL CHECK (talent_lowest_cents IS NULL OR (talent_lowest_cents >= 0 AND talent_lowest_cents <= 1000000000000)),
  listing_min_cents       bigint      NOT NULL DEFAULT 0 CHECK (listing_min_cents >= 0 AND listing_min_cents <= 1000000000000),
  show_who                text        NOT NULL DEFAULT 'name' CHECK (show_who IN ('name','portfolio','hidden')),
  client_contact          text        NOT NULL DEFAULT 'workspace' CHECK (client_contact IN ('workspace','talent')),
  booking_type            text        NOT NULL DEFAULT 'request' CHECK (booking_type IN ('request','instant')),
  accepted_terms_version  integer     NULL CHECK (accepted_terms_version IS NULL OR accepted_terms_version >= 1),
  talent_consented_at     timestamptz NULL,
  floor_breached_at       timestamptz NULL,
  currency_changed_at     timestamptz NULL,
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
  'TUL-1367: one row per workspace x talent x service. Talent consents (bound to accepted terms), client price never below MAX(talent lowest else price, effective minimum), keeps the service currency, exclusive talents only by their workspace or the hub. Sell only through workspace_service_listing_is_sellable().';

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
-- Exclusive workspace of a talent, from accepted exclusive terms (#4158). NULL when the
-- talent is not exclusive or #4158's table is not there yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.service_hub_exclusive_tenant(p_talent_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  IF to_regclass('public.talent_exclusive_workspace') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT tenant_id FROM public.talent_exclusive_workspace WHERE talent_profile_id = $1'
    INTO v_tenant USING p_talent_profile_id;
  RETURN v_tenant;
END;
$$;

-- ---------------------------------------------------------------------------
-- Guard trigger: currency, floor, exclusivity, consent reset, breach flag.
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
  v_min        bigint;
  v_floor      bigint;
  v_breach     boolean := false;
  v_exclusive  uuid;
  v_target_hub boolean;
  v_price_edit boolean;
BEGIN
  SELECT o.amount_cents, upper(o.currency), o.talent_profile_id
    INTO v_amount, v_currency, v_talent
  FROM public.talent_offerings o WHERE o.id = NEW.offering_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  NEW.talent_profile_id := v_talent;
  NEW.updated_at := now();

  -- Currency change by the talent: stop the listing until the talent re-accepts. The old
  -- fixed price and listing minimum were in the old currency, so they are cleared (never
  -- reread as the new currency).
  IF TG_OP = 'UPDATE' AND v_currency IS DISTINCT FROM OLD.currency THEN
    NEW.currency := v_currency;
    NEW.currency_changed_at := now();
    NEW.floor_breached_at := now();
    IF NEW.status = 'accepted' THEN
      NEW.status := 'offered';
    END IF;
    NEW.talent_consented_at := NULL;
    IF NEW.price_mode IN ('fixed','from') THEN
      NEW.price_mode := 'talent_price';
      NEW.booking_type := 'request';
    END IF;
    NEW.price_cents := NULL;
    NEW.listing_min_cents := 0;
    RETURN NEW;
  END IF;
  NEW.currency := v_currency;

  -- Owner change to anything the talent agreed to: back to 'offered', consent cleared.
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status = 'accepted' AND (
       NEW.price_mode IS DISTINCT FROM OLD.price_mode
    OR NEW.margin_bps IS DISTINCT FROM OLD.margin_bps
    OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
    OR NEW.show_who IS DISTINCT FROM OLD.show_who
    OR NEW.client_contact IS DISTINCT FROM OLD.client_contact
    OR NEW.booking_type IS DISTINCT FROM OLD.booking_type
  ) THEN
    NEW.status := 'offered';
    NEW.talent_consented_at = NULL;
  END IF;

  -- Exclusivity: refused on create / status change; on any other update (e.g. the recheck
  -- after a talent edit) the listing is hidden instead, never blocking the talent.
  v_exclusive := public.service_hub_exclusive_tenant(v_talent);
  SELECT (a.kind = 'hub') INTO v_target_hub FROM public.agencies a WHERE a.id = NEW.tenant_id;
  IF NEW.status <> 'hidden' AND v_exclusive IS NOT NULL AND v_exclusive <> NEW.tenant_id
     AND NOT COALESCE(v_target_hub, false) THEN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'exclusive_talent' USING ERRCODE = '23514';
    END IF;
    NEW.status := 'hidden';
  END IF;

  -- Floor = MAX(lowest accepted else price, effective minimum). Quote-only service (no
  -- amount): only the minimum applies.
  SELECT GREATEST(COALESCE(s.listing_min_cents, 0), NEW.listing_min_cents) INTO v_min
  FROM (SELECT 1) x
  LEFT JOIN public.workspace_service_hub_settings s ON s.tenant_id = NEW.tenant_id;
  v_min := COALESCE(v_min, NEW.listing_min_cents);

  IF v_amount IS NOT NULL THEN
    v_client := CASE NEW.price_mode
      WHEN 'talent_price' THEN v_amount
      WHEN 'margin'       THEN v_amount + round(v_amount * COALESCE(NEW.margin_bps, 0) / 10000.0)::bigint
      ELSE COALESCE(NEW.price_cents, 0)
    END;
    v_floor := GREATEST(COALESCE(NEW.talent_lowest_cents, v_amount), v_min);
    v_breach := v_client < v_floor;
  ELSIF NEW.price_mode IN ('fixed','from') THEN
    v_floor := v_min;
    v_breach := COALESCE(NEW.price_cents, 0) < v_min;
  END IF;

  v_price_edit := TG_OP = 'INSERT'
    OR NEW.price_mode IS DISTINCT FROM OLD.price_mode
    OR NEW.margin_bps IS DISTINCT FROM OLD.margin_bps
    OR NEW.price_cents IS DISTINCT FROM OLD.price_cents
    OR NEW.listing_min_cents IS DISTINCT FROM OLD.listing_min_cents
    OR NEW.talent_lowest_cents IS DISTINCT FROM OLD.talent_lowest_cents;

  IF v_breach AND v_price_edit AND NEW.status <> 'hidden' THEN
    RAISE EXCEPTION 'below_floor' USING ERRCODE = '23514', DETAIL = v_floor::text;
  END IF;

  -- Not a price edit (e.g. the talent raised the service price): flag, never block.
  IF v_breach THEN
    NEW.floor_breached_at := COALESCE(CASE WHEN TG_OP = 'UPDATE' THEN OLD.floor_breached_at END, now());
  ELSIF NEW.currency_changed_at IS NULL THEN
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
-- Owner/admin offers (or edits) a listing. Requires the talent on the workspace roster
-- (active). One generic error for "not allowed" and "no such service" (no existence leak).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_workspace_service_listing(
  p_tenant_id         uuid,
  p_offering_id       uuid,
  p_price_mode        text,
  p_margin_bps        integer,
  p_price_cents       bigint,
  p_listing_min_cents bigint,
  p_show_who          text,
  p_client_contact    text,
  p_booking_type      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid;
  v_talent uuid;
BEGIN
  SELECT o.talent_profile_id INTO v_talent FROM public.talent_offerings o WHERE o.id = p_offering_id;

  IF v_talent IS NULL
     OR NOT (
       public.is_platform_admin()
       OR EXISTS (
         SELECT 1 FROM public.agency_memberships m
         WHERE m.profile_id = (SELECT auth.uid())
           AND m.tenant_id = p_tenant_id
           AND m.status = 'active'
           AND m.role IN ('owner','admin')
       )
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.agency_talent_roster r
       WHERE r.tenant_id = p_tenant_id AND r.talent_profile_id = v_talent
         AND r.status = 'active'
     ) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.workspace_service_listings (
    tenant_id, talent_profile_id, offering_id, status, price_mode, margin_bps, price_cents,
    currency, listing_min_cents, show_who, client_contact, booking_type, created_by
  )
  SELECT p_tenant_id, o.talent_profile_id, o.id, 'offered', p_price_mode, p_margin_bps, p_price_cents,
         upper(o.currency), COALESCE(p_listing_min_cents, 0), p_show_who, p_client_contact, p_booking_type,
         (SELECT auth.uid())
  FROM public.talent_offerings o WHERE o.id = p_offering_id
  ON CONFLICT (tenant_id, offering_id) DO UPDATE
     SET price_mode = EXCLUDED.price_mode,
         margin_bps = EXCLUDED.margin_bps,
         price_cents = EXCLUDED.price_cents,
         listing_min_cents = EXCLUDED.listing_min_cents,
         show_who = EXCLUDED.show_who,
         client_contact = EXCLUDED.client_contact,
         booking_type = EXCLUDED.booking_type
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- The talent consents (accept) or says no (hidden). Consent is bound to the talent's
-- latest ACCEPTED terms with this workspace (looked up here, never supplied): fail closed
-- when there are none; refuse a show-who more revealing than the terms or a different
-- price mode.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_workspace_service_listing(
  p_listing_id          uuid,
  p_accept              boolean,
  p_talent_lowest_cents bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l        public.workspace_service_listings%ROWTYPE;
  v_version  integer;
  v_identity text;
  v_pmode    text;
BEGIN
  SELECT * INTO v_l FROM public.workspace_service_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_own_talent_profile(v_l.talent_profile_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.workspace_service_listings
       SET status = 'hidden', talent_lowest_cents = p_talent_lowest_cents
     WHERE id = p_listing_id;
    RETURN 'hidden';
  END IF;

  IF to_regclass('public.workspace_talent_terms') IS NULL THEN
    RAISE EXCEPTION 'no_accepted_terms' USING ERRCODE = '23514';
  END IF;
  EXECUTE
    'SELECT version, show_identity, client_price_mode FROM public.workspace_talent_terms
      WHERE tenant_id = $1 AND talent_profile_id = $2 AND status = ''accepted''
      ORDER BY version DESC LIMIT 1'
    INTO v_version, v_identity, v_pmode
    USING v_l.tenant_id, v_l.talent_profile_id;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'no_accepted_terms' USING ERRCODE = '23514';
  END IF;

  IF (CASE v_l.show_who WHEN 'hidden' THEN 0 WHEN 'portfolio' THEN 1 ELSE 2 END)
       > (CASE v_identity WHEN 'hidden' THEN 0 WHEN 'portfolio' THEN 1 ELSE 2 END)
     OR v_l.price_mode IS DISTINCT FROM (CASE v_pmode
          WHEN 'talent_price' THEN 'talent_price'
          WHEN 'talent_plus_margin' THEN 'margin'
          WHEN 'fixed' THEN 'fixed'
          WHEN 'from' THEN 'from' END) THEN
    RAISE EXCEPTION 'outside_terms' USING ERRCODE = '23514';
  END IF;

  UPDATE public.workspace_service_listings
     SET status = 'accepted',
         talent_lowest_cents = p_talent_lowest_cents,
         accepted_terms_version = v_version,
         talent_consented_at = now(),
         currency_changed_at = NULL
   WHERE id = p_listing_id;

  RETURN 'accepted';
END;
$$;

-- ---------------------------------------------------------------------------
-- The ONE sellable check for readers and checkout: accepted, not below the floor, not
-- stopped by a currency change, and the consented terms version still in force (not
-- revoked or replaced). Fails closed when #4158's terms table is absent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_service_listing_is_sellable(p_listing_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_l  public.workspace_service_listings%ROWTYPE;
  v_ok boolean;
BEGIN
  SELECT * INTO v_l FROM public.workspace_service_listings WHERE id = p_listing_id;
  IF NOT FOUND OR v_l.status <> 'accepted' OR v_l.floor_breached_at IS NOT NULL
     OR v_l.currency_changed_at IS NOT NULL OR v_l.accepted_terms_version IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.workspace_talent_terms') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE
    'SELECT EXISTS (SELECT 1 FROM public.workspace_talent_terms
                     WHERE tenant_id = $1 AND talent_profile_id = $2
                       AND version = $3 AND status = ''accepted'')'
    INTO v_ok USING v_l.tenant_id, v_l.talent_profile_id, v_l.accepted_terms_version;
  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_service_listings_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.talent_offerings_recheck_listings() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_hub_exclusive_tenant(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_workspace_service_listing(uuid,uuid,text,integer,bigint,bigint,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_workspace_service_listing(uuid,boolean,bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.workspace_service_listing_is_sellable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workspace_service_listing(uuid,uuid,text,integer,bigint,bigint,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_workspace_service_listing(uuid,boolean,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_service_listing_is_sellable(uuid) TO authenticated, service_role;

COMMIT;
