-- 20261231426400_tenant_column_hardening_tul1292.sql
-- (TUL-1292 + folded TUL-1721 + TUL-1791, package P1)
--
-- HELD FILE (supabase/migrations/_pending_pm/). NOT applied by the author.
-- PM applies: mv to supabase/migrations/, then `cd web && npm run db:push`.
--
-- !!! APPLY ORDER: AFTER 20261231425500 (talent_profiles_private_columns_revoke) !!!
--     and only once the web code of this PR is deployed (part 3 below moves the
--     user-session invitation_email readers onto an RPC; before the code is live
--     they would get "permission denied for column invitation_email").
-- Full order: 20261231415400 -> 20261231424900 -> deploy #4392 -> 20261231425500
--             -> deploy this PR's code -> THIS FILE.
--
-- Three independent hardening items, one transaction, idempotent (DROP ... IF
-- EXISTS / CREATE OR REPLACE / REVOKE). Assertions use the privilege catalog and
-- pg_trigger, never SET ROLE.
--
-- --- 1. agency_domains status / verification columns (TUL-1292) --------------
-- #4091 limits agency_domains WRITERS to owner/admin, but nothing guarded the
-- state columns: an owner could PATCH status='active' (or verified_at) on a
-- hostname that never passed DNS verification, and the host router then serves
-- the tenant on it. A BEFORE INSERT OR UPDATE trigger now stops every caller
-- that is not service_role / a direct connection (jwt role '' -- same idiom as
-- 20261231424500) from:
--   * inserting a row in any status other than pending / dns_verification_sent,
--     or with verified_at / ssl_provisioned_at set;
--   * moving a row INTO verified / ssl_provisioned / active / suspended;
--   * moving a row OUT OF suspended (a platform decision);
--   * setting verified_at / ssl_provisioned_at to a new non-null value;
--   * changing hostname or kind (a row verified for host A must not be
--     re-pointed at host B while staying active).
-- Allowed for owners: resetting a row to dns_verification_sent / failed / pending
-- with the timestamps cleared (reconnect flow), a new token, tenant_slug.
-- The DNS verification + provisioning transitions are written by the web server
-- actions through the service-role client after their own DNS check, and by the
-- cron sweep (already service role).
--
-- --- 2. RPC tenant checks (TUL-1721, follow-up to TUL-1517) ------------------
-- TUL-1517 guards these ids in TypeScript only. The RPCs are EXECUTE-granted to
-- service_role only, but a bug or a new caller must not be able to cross tenants:
--   admission_comp(..., 10 args)   tier variant must belong to an offering whose
--                                  tenant_id = p_tenant_id            -> not_found
--   party_waitlist_join(...)       p_zone_id must be a zone of p_tenant_id (and of
--                                  p_location_id when given)           -> not_found
--   session_set_instructor(...)    p_user_id must be ACTIVE staff of p_tenant_id or
--                                  own an ACTIVE roster talent there   -> wrong_tenant
-- Bodies are copied from their latest definitions (242000 / 224000 / 217000) with
-- only the check added; signatures and ACLs are unchanged.
--
-- --- 3. talent_profiles.invitation_email (TUL-1791, follow-up to TUL-1269) ---
-- 20261231425500 left invitation_email readable by every signed-in user (a
-- person's contact email, set on unclaimed profiles). Column-level REVOKE from
-- `authenticated` (425500 already replaced the table-wide grant with column
-- grants, so this REVOKE bites; this file refuses to run otherwise). Own row and
-- staff paths read it through two SECURITY DEFINER RPCs, search_path '':
--   talent_invitation_email(uuid)              own profile OR staff_can_access_talent_profile
--   talent_seed_invitation_email(uuid, text)   own profile, only fills an empty value
-- Workspace loaders that already use the service-role client are unchanged.
-- anon already lost the column in 20261231415500. service_role is untouched.
-- Public and talent pages never read the column (pinned by
-- web/src/lib/supabase/tenant-column-hardening.static.test.ts).

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.talent_private_fields(uuid)') IS NULL THEN
    RAISE EXCEPTION 'talent_private_fields(uuid) is missing: apply 20261231424900 first';
  END IF;
  IF to_regprocedure('public.staff_can_access_talent_profile(uuid)') IS NULL THEN
    RAISE EXCEPTION 'staff_can_access_talent_profile(uuid) is missing: apply 20261231415400 first';
  END IF;
  IF has_table_privilege('authenticated', 'public.talent_profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated still holds table-wide SELECT on talent_profiles: apply 20261231425500 first (a column REVOKE is a no-op under a table grant)';
  END IF;
END $$;

-- === 1. agency_domains guard ==================================================

CREATE OR REPLACE FUNCTION public.agency_domains_guard_verification_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  -- service_role (web verification actions, cron sweep, platform actions) and a
  -- direct connection (migrations, PM) set any state.
  IF v_caller_role IN ('service_role', '') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'dns_verification_sent')
       OR NEW.verified_at IS NOT NULL
       OR NEW.ssl_provisioned_at IS NOT NULL THEN
      RAISE EXCEPTION 'agency_domains: a new hostname starts unverified; only the verification job can mark it verified or active'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.hostname IS DISTINCT FROM OLD.hostname OR NEW.kind IS DISTINCT FROM OLD.kind THEN
    RAISE EXCEPTION 'agency_domains: hostname and kind cannot be changed; remove the domain and add a new one'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('verified', 'ssl_provisioned', 'active', 'suspended') THEN
      RAISE EXCEPTION 'agency_domains: only the verification job can set status %', NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'suspended' THEN
      RAISE EXCEPTION 'agency_domains: a suspended domain can only be released by the platform'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (NEW.verified_at IS NOT NULL AND NEW.verified_at IS DISTINCT FROM OLD.verified_at)
     OR (NEW.ssl_provisioned_at IS NOT NULL AND NEW.ssl_provisioned_at IS DISTINCT FROM OLD.ssl_provisioned_at) THEN
    RAISE EXCEPTION 'agency_domains: verified_at and ssl_provisioned_at are set by the verification job only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.agency_domains_guard_verification_state() IS
  'TUL-1292: BEFORE INSERT OR UPDATE guard on agency_domains. Only service_role / a direct connection may mark a hostname verified, ssl_provisioned, active or suspended, set the verification timestamps, or re-point hostname/kind.';

REVOKE ALL ON FUNCTION public.agency_domains_guard_verification_state() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_agency_domains_guard_verification_state ON public.agency_domains;
CREATE TRIGGER trg_agency_domains_guard_verification_state
  BEFORE INSERT OR UPDATE ON public.agency_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.agency_domains_guard_verification_state();

-- === 2. RPC tenant checks =====================================================

CREATE OR REPLACE FUNCTION public.admission_comp(
  p_tenant_id uuid,
  p_session_id uuid,
  p_tier_variant_id uuid,
  p_holder_name text,
  p_holder_email text,
  p_reason text,
  p_approver uuid,
  p_actor_role text,
  p_operation_key text,
  p_customer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_session public.sessions%ROWTYPE;
  v_variant public.talent_offering_variants%ROWTYPE;
  v_limit bigint;
  v_price bigint := 0;
  v_approved boolean := false;
  v_order uuid;
  v_line uuid;
  v_adm uuid;
  v_receipt text;
  v_offering_talent uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_tier_variant_id IS NULL
     OR char_length(btrim(COALESCE(p_holder_name, ''))) < 1 OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- TUL-1721: the tier variant must belong to an offering of THIS tenant. The id
  -- used to be read with no tenant join, so another tenant's price list was
  -- reachable by id.
  SELECT v.* INTO v_variant
    FROM public.talent_offering_variants v
    JOIN public.talent_offerings o ON o.id = v.offering_id
   WHERE v.id = p_tier_variant_id AND o.tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  v_price := COALESCE(v_variant.amount_cents, 0);

  SELECT limit_cents INTO v_limit
    FROM public.role_limits
   WHERE tenant_id = p_tenant_id
     AND role = COALESCE(NULLIF(btrim(COALESCE(p_actor_role, '')), ''), 'editor')
     AND action = 'discount';
  IF v_limit IS NOT NULL AND v_price > v_limit THEN
    SELECT true INTO v_approved
      FROM public.approval_requests
     WHERE tenant_id = p_tenant_id
       AND kind = 'discount'
       AND subject_id IN (p_session_id, p_tier_variant_id)
       AND decision = 'approved'
     LIMIT 1;
    IF v_approved IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'needs_approval');
    END IF;
  END IF;

  -- D-142: a paid order must be reachable (orders_identified_before_payment):
  -- a customer, or a guest session PLUS a receipt code. The comp wrote the
  -- operation key as guest session and nothing else, so every comp was a
  -- 23514 and no ticket was ever issued. The admission's customer is the
  -- order's when the door resolved one; otherwise the comp is a guest sale
  -- with its receipt code, the way a walk-in draft is.
  IF p_customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = p_customer_id AND c.tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  v_receipt := 'cmp' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, customer_id, guest_session_id, receipt_code, session_id
  ) VALUES (
    p_tenant_id, 'paid', 'USD', 0, v_price, 0, 0, 'admission_comp',
    p_customer_id, CASE WHEN p_customer_id IS NULL THEN v_key ELSE NULL END, v_receipt, p_session_id
  ) RETURNING id INTO v_order;

  -- D-146: order_lines_payee_xor wants exactly one payee. A comp pays nobody,
  -- but the line still belongs to a lane: the offering's talent when it has
  -- one, otherwise the house (owner_tenant_id = the workspace).
  SELECT o.talent_profile_id INTO v_offering_talent
    FROM public.talent_offerings o
   WHERE o.id = v_variant.offering_id;

  INSERT INTO public.order_lines (
    tenant_id, order_id, offering_id, variant_id, session_id, label, units, unit_cents, total_cents,
    talent_profile_id, owner_tenant_id
  ) VALUES (
    p_tenant_id, v_order, v_variant.offering_id, v_variant.id, p_session_id,
    'Comp', 1, 0, 0,
    v_offering_talent, CASE WHEN v_offering_talent IS NULL THEN p_tenant_id ELSE NULL END
  ) RETURNING id INTO v_line;

  INSERT INTO public.admissions (
    tenant_id, order_line_id, session_id, holder_name, holder_email, starts_at,
    status, party_size, token_version
  ) VALUES (
    p_tenant_id, v_line, p_session_id, btrim(p_holder_name),
    NULLIF(btrim(COALESCE(p_holder_email, '')), ''), v_session.starts_at,
    'valid', GREATEST(1, COALESCE(v_variant.admits_per_unit, 1)), 1
  ) RETURNING id INTO v_adm;

  RETURN jsonb_build_object('ok', true, 'id', v_adm, 'order_id', v_order, 'line_id', v_line, 'receipt_code', v_receipt);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_join(
  p_tenant_id uuid,
  p_location_id uuid,
  p_zone_id uuid,
  p_party_size integer,
  p_holder_name text,
  p_holder_phone text,
  p_holder_email text,
  p_note text,
  p_quoted_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
  v_pos integer;
BEGIN
  IF p_tenant_id IS NULL OR p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 200
     OR char_length(btrim(COALESCE(p_holder_name, ''))) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_locations WHERE id = p_location_id AND tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  -- TUL-1721: the zone is checked too. It must be this tenant's, and, when a
  -- location is named, a zone OF that location.
  IF p_zone_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_location_zones z
     WHERE z.id = p_zone_id
       AND z.tenant_id = p_tenant_id
       AND (p_location_id IS NULL OR z.location_id = p_location_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT COALESCE(max(position), 0) + 1 INTO v_pos
    FROM public.party_waitlist
   WHERE tenant_id = p_tenant_id
     AND location_id IS NOT DISTINCT FROM p_location_id
     AND status IN ('waiting', 'notified');

  INSERT INTO public.party_waitlist (
    tenant_id, location_id, zone_id, party_size, holder_name, holder_phone,
    holder_email, note, quoted_minutes, status, position
  ) VALUES (
    p_tenant_id, p_location_id, p_zone_id, p_party_size, btrim(p_holder_name),
    NULLIF(btrim(p_holder_phone), ''), NULLIF(btrim(p_holder_email), ''),
    NULLIF(btrim(p_note), ''), p_quoted_minutes, 'waiting', v_pos
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'position', v_row.position, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.session_set_instructor(
  p_tenant_id uuid,
  p_session_id uuid,
  p_user_id uuid,
  p_scope text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_n int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_user_id IS NULL
     OR p_scope IS NULL OR p_scope NOT IN ('this', 'future', 'series') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session
    FROM public.sessions
   WHERE id = p_session_id AND tenant_id = p_tenant_id
     FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_session.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  END IF;

  -- TUL-1721: the instructor must be able to teach in THIS tenant (same rule as
  -- web assertUserIsTenantStaff): an ACTIVE membership here, or an ACTIVE roster
  -- row here for a talent profile that user owns. Never trust the id.
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
       WHERE m.tenant_id = p_tenant_id AND m.profile_id = p_user_id AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1
        FROM public.agency_talent_roster r
        JOIN public.talent_profiles tp ON tp.id = r.talent_profile_id
       WHERE r.tenant_id = p_tenant_id AND r.status = 'active' AND tp.user_id = p_user_id
    )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF p_scope = 'this' THEN
    UPDATE public.sessions
       SET instructor_user_id = p_user_id, updated_at = now()
     WHERE id = v_session.id AND tenant_id = p_tenant_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF p_scope = 'future' THEN
    UPDATE public.sessions
       SET instructor_user_id = p_user_id, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND status = 'scheduled'
       AND starts_at >= v_session.starts_at
       AND (
         (v_session.series_id IS NOT NULL AND series_id = v_session.series_id)
         OR (v_session.series_id IS NULL AND id = v_session.id)
       );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_session.series_id IS NOT NULL THEN
      UPDATE public.session_series
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.series_id AND tenant_id = p_tenant_id;
    END IF;
  ELSE
    IF v_session.series_id IS NULL THEN
      UPDATE public.sessions
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.id AND tenant_id = p_tenant_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      UPDATE public.session_series
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE id = v_session.series_id AND tenant_id = p_tenant_id;
      UPDATE public.sessions
         SET instructor_user_id = p_user_id, updated_at = now()
       WHERE tenant_id = p_tenant_id
         AND series_id = v_session.series_id
         AND status = 'scheduled';
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', v_n);
END;
$$;


REVOKE ALL ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.party_waitlist_join(uuid, uuid, uuid, integer, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_waitlist_join(uuid, uuid, uuid, integer, text, text, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.session_set_instructor(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.session_set_instructor(uuid, uuid, uuid, text) TO service_role;

-- === 3. talent_profiles.invitation_email ======================================

CREATE OR REPLACE FUNCTION public.talent_invitation_email(p_talent_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT tp.invitation_email
    FROM public.talent_profiles tp
   WHERE tp.id = p_talent_id
     AND auth.uid() IS NOT NULL
     AND (
       tp.user_id = auth.uid()
       OR public.staff_can_access_talent_profile(p_talent_id)
     );
$$;

CREATE OR REPLACE FUNCTION public.talent_seed_invitation_email(p_talent_id uuid, p_email text)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR btrim(COALESCE(p_email, '')) = '' THEN
    RETURN false;
  END IF;
  UPDATE public.talent_profiles tp
     SET invitation_email = btrim(p_email)
   WHERE tp.id = p_talent_id
     AND tp.user_id = auth.uid()
     AND tp.invitation_email IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.talent_invitation_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talent_invitation_email(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.talent_seed_invitation_email(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talent_seed_invitation_email(uuid, text) TO authenticated;

REVOKE SELECT (invitation_email) ON public.talent_profiles FROM authenticated;

-- === Assertions (catalog only) ================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.agency_domains'::regclass
       AND tgname = 'trg_agency_domains_guard_verification_state'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'assertion failed: agency_domains guard trigger missing';
  END IF;
  IF has_column_privilege('authenticated', 'public.talent_profiles', 'invitation_email', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: authenticated still holds talent_profiles.invitation_email';
  END IF;
  IF has_column_privilege('anon', 'public.talent_profiles', 'invitation_email', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: anon holds talent_profiles.invitation_email';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.talent_profiles', 'invitation_email', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: service_role LOST talent_profiles.invitation_email';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.talent_profiles', 'display_name', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.talent_profiles', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: authenticated LOST a non-private talent_profiles column';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.talent_profiles', 'UPDATE') THEN
    RAISE EXCEPTION 'assertion failed: authenticated LOST UPDATE on talent_profiles';
  END IF;
  IF has_function_privilege('anon', 'public.talent_invitation_email(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.talent_seed_invitation_email(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: anon can EXECUTE an invitation_email RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.admission_comp(uuid,uuid,uuid,text,text,text,uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.party_waitlist_join(uuid,uuid,uuid,integer,text,text,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.session_set_instructor(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'assertion failed: a hardened RPC became executable by authenticated';
  END IF;
END $$;

COMMIT;
