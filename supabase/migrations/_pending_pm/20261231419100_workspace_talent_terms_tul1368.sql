-- TUL-1368 · Service hub: terms card when a talent joins a workspace (and when terms change).
--
-- HELD in _pending_pm. Additive only: two new tables + two RPCs. Nothing existing changes.
-- The app degrades gracefully while this is absent (no card is shown; owner propose returns
-- "unavailable").
--
-- Model: one row per (workspace, talent, version). A workspace proposes terms; the talent
-- accepts or declines. Any change is a NEW version (status 'pending'); until the talent
-- accepts it, the latest ACCEPTED version stays in force (rule 20 of the Service hub flows).
-- TUL-1367 (listing link) stores the accepted version number per listing.
--
-- Works for every kind of group (agency, network, studio, rental studio, collective) in
-- every trade: the model is a column, not a tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_talent_terms (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  talent_profile_id   uuid        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  version             integer     NOT NULL CHECK (version >= 1),
  work_model          text        NOT NULL CHECK (work_model IN (
                                    'coordinator_agency','open_network','team_studio',
                                    'rental_studio','friends_collective')),
  share_kind          text        NOT NULL CHECK (share_kind IN ('percent','fixed','per_hour','margin','rent')),
  share_bps           integer     NULL CHECK (share_bps IS NULL OR (share_bps >= 0 AND share_bps <= 10000)),
  share_amount_cents  bigint      NULL CHECK (share_amount_cents IS NULL OR share_amount_cents >= 0),
  share_currency      text        NULL CHECK (share_currency IS NULL OR share_currency ~ '^[A-Z]{3}$'),
  client_price_mode   text        NOT NULL CHECK (client_price_mode IN ('talent_price','talent_plus_margin','fixed','from')),
  show_identity       text        NOT NULL CHECK (show_identity IN ('name','portfolio','hidden')),
  show_contact        boolean     NOT NULL DEFAULT false,
  client_contact      text        NOT NULL CHECK (client_contact IN ('workspace','talent')),
  exclusive           boolean     NOT NULL DEFAULT false,
  no_poaching         boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','accepted','declined','superseded')),
  proposed_by         uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  proposed_at         timestamptz NOT NULL DEFAULT now(),
  responded_by        uuid        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at        timestamptz NULL,
  CONSTRAINT workspace_talent_terms_version_uniq UNIQUE (tenant_id, talent_profile_id, version),
  -- percent and margin carry a rate; fixed, per_hour and rent carry an amount + currency.
  CONSTRAINT workspace_talent_terms_share_shape CHECK (
    (share_kind IN ('percent','margin') AND share_bps IS NOT NULL)
    OR (share_kind IN ('fixed','per_hour','rent') AND share_amount_cents IS NOT NULL AND share_currency IS NOT NULL)
  )
);

COMMENT ON TABLE public.workspace_talent_terms IS
  'TUL-1368: versioned terms a workspace offers a talent (model, share, client price, identity/contact visibility, who talks to clients, exclusivity, no-poaching). Latest accepted version is in force; a newer pending version waits for the talent.';

-- At most one pending version per pair.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_talent_terms_one_pending
  ON public.workspace_talent_terms (tenant_id, talent_profile_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workspace_talent_terms_talent_idx
  ON public.workspace_talent_terms (talent_profile_id, status);

ALTER TABLE public.workspace_talent_terms ENABLE ROW LEVEL SECURITY;

-- Read: the workspace's staff, the talent themself, platform admins. No anon access.
DROP POLICY IF EXISTS workspace_talent_terms_read ON public.workspace_talent_terms;
CREATE POLICY workspace_talent_terms_read ON public.workspace_talent_terms
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );
-- No direct INSERT/UPDATE/DELETE policies: writes go through the two RPCs below.

REVOKE ALL ON public.workspace_talent_terms FROM anon;

-- The talent's exclusive workspace, set by accepting EXCLUSIVE terms (PM 2026-10-19).
-- One row per talent: accepting exclusive terms elsewhere moves it. Read by the listing
-- link (TUL-1367): an exclusive talent is sold only by this workspace, their own site
-- and the Tulala hub.
CREATE TABLE IF NOT EXISTS public.talent_exclusive_workspace (
  talent_profile_id  uuid        PRIMARY KEY REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id          uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  terms_id           uuid        NOT NULL REFERENCES public.workspace_talent_terms(id) ON DELETE CASCADE,
  set_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_exclusive_workspace IS
  'TUL-1368: the workspace a talent accepted EXCLUSIVE terms with (one per talent). Written only by respond_workspace_talent_terms.';

ALTER TABLE public.talent_exclusive_workspace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_exclusive_workspace_read ON public.talent_exclusive_workspace;
CREATE POLICY talent_exclusive_workspace_read ON public.talent_exclusive_workspace
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(tenant_id)
    OR public.is_own_talent_profile(talent_profile_id)
  );
REVOKE ALL ON public.talent_exclusive_workspace FROM anon;

-- ---------------------------------------------------------------------------
-- propose_workspace_talent_terms: staff of the workspace proposes terms.
-- Returns the version that is now pending, or the current version when nothing changed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propose_workspace_talent_terms(
  p_tenant_id          uuid,
  p_talent_profile_id  uuid,
  p_work_model         text,
  p_share_kind         text,
  p_share_bps          integer,
  p_share_amount_cents bigint,
  p_share_currency     text,
  p_client_price_mode  text,
  p_show_identity      text,
  p_show_contact       boolean,
  p_client_contact     text,
  p_exclusive          boolean,
  p_no_poaching        boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest public.workspace_talent_terms%ROWTYPE;
  v_next   integer;
BEGIN
  -- Terms are money settings: only an ACTIVE owner or admin of the workspace (rule O8).
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

  -- Serialize proposals for one pair.
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':' || p_talent_profile_id::text));

  SELECT * INTO v_latest
  FROM public.workspace_talent_terms
  WHERE tenant_id = p_tenant_id AND talent_profile_id = p_talent_profile_id
    AND status IN ('pending','accepted')
  ORDER BY version DESC
  LIMIT 1;

  IF FOUND
     AND v_latest.work_model = p_work_model
     AND v_latest.share_kind = p_share_kind
     AND v_latest.share_bps IS NOT DISTINCT FROM p_share_bps
     AND v_latest.share_amount_cents IS NOT DISTINCT FROM p_share_amount_cents
     AND v_latest.share_currency IS NOT DISTINCT FROM p_share_currency
     AND v_latest.client_price_mode = p_client_price_mode
     AND v_latest.show_identity = p_show_identity
     AND v_latest.show_contact = p_show_contact
     AND v_latest.client_contact = p_client_contact
     AND v_latest.exclusive = p_exclusive
     AND v_latest.no_poaching = p_no_poaching THEN
    RETURN v_latest.version;
  END IF;

  UPDATE public.workspace_talent_terms
     SET status = 'superseded'
   WHERE tenant_id = p_tenant_id AND talent_profile_id = p_talent_profile_id
     AND status = 'pending';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.workspace_talent_terms
  WHERE tenant_id = p_tenant_id AND talent_profile_id = p_talent_profile_id;

  INSERT INTO public.workspace_talent_terms (
    tenant_id, talent_profile_id, version, work_model, share_kind, share_bps,
    share_amount_cents, share_currency, client_price_mode, show_identity, show_contact,
    client_contact, exclusive, no_poaching, status, proposed_by
  ) VALUES (
    p_tenant_id, p_talent_profile_id, v_next, p_work_model, p_share_kind, p_share_bps,
    p_share_amount_cents, p_share_currency, p_client_price_mode, p_show_identity, p_show_contact,
    p_client_contact, p_exclusive, p_no_poaching, 'pending', (SELECT auth.uid())
  );

  RETURN v_next;
END;
$$;

-- ---------------------------------------------------------------------------
-- respond_workspace_talent_terms: the talent accepts or declines a pending version.
-- Accepting supersedes the previously accepted version. Declining leaves the old
-- accepted version in force.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_workspace_talent_terms(
  p_terms_id uuid,
  p_accept   boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.workspace_talent_terms%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.workspace_talent_terms WHERE id = p_terms_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_own_talent_profile(v_row.talent_profile_id) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN 'not_pending';
  END IF;

  IF p_accept THEN
    UPDATE public.workspace_talent_terms
       SET status = 'superseded'
     WHERE tenant_id = v_row.tenant_id AND talent_profile_id = v_row.talent_profile_id
       AND status = 'accepted';
  END IF;

  UPDATE public.workspace_talent_terms
     SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
         responded_by = (SELECT auth.uid()),
         responded_at = now()
   WHERE id = p_terms_id;

  -- Exclusivity follows the accepted terms: exclusive terms make this workspace the
  -- talent's exclusive one; non-exclusive terms from the same workspace end it.
  IF p_accept AND v_row.exclusive THEN
    INSERT INTO public.talent_exclusive_workspace (talent_profile_id, tenant_id, terms_id, set_at)
    VALUES (v_row.talent_profile_id, v_row.tenant_id, v_row.id, now())
    ON CONFLICT (talent_profile_id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id, terms_id = EXCLUDED.terms_id, set_at = EXCLUDED.set_at;
  ELSIF p_accept THEN
    DELETE FROM public.talent_exclusive_workspace
     WHERE talent_profile_id = v_row.talent_profile_id AND tenant_id = v_row.tenant_id;
  END IF;

  RETURN CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END;
END;
$$;

REVOKE ALL ON FUNCTION public.propose_workspace_talent_terms(uuid,uuid,text,text,integer,bigint,text,text,text,boolean,text,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_workspace_talent_terms(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_workspace_talent_terms(uuid,uuid,text,text,integer,bigint,text,text,text,boolean,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_workspace_talent_terms(uuid,boolean) TO authenticated;

COMMIT;
