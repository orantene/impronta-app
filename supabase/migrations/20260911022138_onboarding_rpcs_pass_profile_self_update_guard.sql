-- Client self-onboarding could not complete (defects-close, 2026-09-11).
--
-- `guard_profile_self_update` (20260408113000) is a BEFORE UPDATE trigger on
-- public.profiles that reverts app_role, account_status and
-- onboarding_completed_at whenever auth.uid() is the row's own id. Its purpose
-- is right: a signed-in person may not promote their own role or status. But
-- the onboarding RPCs (complete_client_onboarding, complete_talent_onboarding,
-- complete_talent_onboarding_with_locations, ensure_profile_for_current_user)
-- are SECURITY DEFINER functions that run WITH the caller's auth.uid(), so the
-- guard fired on the sanctioned transition too: the RPC reported success, the
-- client_profiles / talent_profiles row was written, and the profile stayed
-- `onboarding`, which auth-routing bounces to /onboarding/role forever.
-- Observed on the isolated branch (the first database that ever ran
-- 20260408113000; production's ledger records it but the guard was never
-- created there, see docs/plans/program/defects.md).
--
-- The fix is the narrowest that keeps the guard's purpose: a transaction-local
-- setting `tulala.onboarding_rpc` that only the onboarding RPCs raise, through
-- two helpers no client role may execute. While it is raised the guard lets
-- account_status and onboarding_completed_at move and lets app_role become
-- `client` or `talent` (never a staff role). A direct self-UPDATE, before or
-- after an RPC in the same transaction, is still reverted; staff editing
-- another person's row is unchanged. The RPC bodies below are the tree's
-- current bodies with the two PERFORM lines added and nothing else.
--
-- The proof block at the end creates two throwaway auth users, exercises the
-- client and talent paths as those users (SET LOCAL ROLE authenticated +
-- request.jwt.claim.sub), asserts the direct self-UPDATE is still reverted
-- before, during and after, and then rolls its own writes back by raising a
-- sentinel it catches. A failed assertion propagates and fails the file.
BEGIN;

-- D-110 (found applying this file to production on 2026-09-11): production
-- never ran 20260408113000 / 20260408150000 although its ledger records them.
-- There `profiles.app_role` is still NOT NULL DEFAULT 'client', which the
-- proof block below (a profile with no role yet) trips on, and the guard and
-- ensure_profile_for_current_user() do not exist at all. The code's contract
-- since April is "no role until the person chooses one", so the column is
-- brought to that shape here, idempotently; a database that already has it
-- is untouched.
ALTER TABLE public.profiles
  ALTER COLUMN app_role DROP DEFAULT,
  ALTER COLUMN app_role DROP NOT NULL;

-- Same D-110: ensure_profile_for_current_user() below calls this, and it was
-- never created on production. Verbatim from 20260408150000; a database that
-- has it gets the same body back.
CREATE OR REPLACE FUNCTION public.bootstrap_profile_from_auth_email(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT lower(email)
  INTO user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF user_email IS NULL THEN
    RETURN;
  END IF;

  IF user_email = 'orantene@gmail.com' THEN
    UPDATE public.profiles
    SET
      app_role = 'super_admin'::public.app_role,
      account_status = 'active'::public.account_status,
      onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
      updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The flag helpers. EXECUTE is revoked from every client role: the only
--    way to raise the flag is from inside a SECURITY DEFINER function owned
--    by postgres, i.e. the onboarding RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboarding_transition_begin()
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  SELECT set_config('tulala.onboarding_rpc', '1', true);
$$;

CREATE OR REPLACE FUNCTION public.onboarding_transition_end()
RETURNS VOID
LANGUAGE sql
SET search_path = public
AS $$
  SELECT set_config('tulala.onboarding_rpc', '', true);
$$;

REVOKE ALL ON FUNCTION public.onboarding_transition_begin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_transition_end() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_transition_begin() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_transition_end() TO postgres, service_role;

COMMENT ON FUNCTION public.onboarding_transition_begin() IS
  'Raises the transaction-local tulala.onboarding_rpc flag that lets guard_profile_self_update accept the onboarding transition. Callable only from SECURITY DEFINER onboarding RPCs.';
COMMENT ON FUNCTION public.onboarding_transition_end() IS
  'Clears tulala.onboarding_rpc so a later self-UPDATE in the same transaction is guarded again.';

-- ---------------------------------------------------------------------------
-- 2. The guard, re-asserted with the exemption. Same trigger name, same
--    timing; DROP/CREATE so a database whose ledger claims 20260408113000 but
--    never ran it (production) gets the trigger from this file.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onboarding_rpc BOOLEAN := coalesce(current_setting('tulala.onboarding_rpc', true), '') = '1';
BEGIN
  NEW.updated_at := now();

  IF auth.uid() = OLD.id AND NOT public.is_agency_staff() THEN
    IF v_onboarding_rpc THEN
      -- Sanctioned onboarding transition: status and completion may move,
      -- and the role may only become a non-staff role.
      IF NEW.app_role IS DISTINCT FROM OLD.app_role
         AND NEW.app_role IS DISTINCT FROM 'client'::public.app_role
         AND NEW.app_role IS DISTINCT FROM 'talent'::public.app_role THEN
        NEW.app_role := OLD.app_role;
      END IF;
    ELSE
      NEW.app_role := OLD.app_role;
      NEW.account_status := OLD.account_status;
      NEW.onboarding_completed_at := OLD.onboarding_completed_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_self_update_guard ON public.profiles;
CREATE TRIGGER profiles_self_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_profile_self_update();

-- ---------------------------------------------------------------------------
-- 3. The four onboarding RPCs, raising the flag around their profile UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_client_onboarding()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.onboarding_transition_begin();

  UPDATE public.profiles
  SET
    app_role = 'client'::public.app_role,
    account_status = 'active'::public.account_status,
    onboarding_completed_at = now(),
    updated_at = now()
  WHERE id = uid
    AND account_status IN ('registered'::public.account_status, 'onboarding'::public.account_status);

  PERFORM public.onboarding_transition_end();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  INSERT INTO public.client_profiles (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_talent_onboarding()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.onboarding_transition_begin();

  UPDATE public.profiles
  SET
    app_role = 'talent'::public.app_role,
    account_status = 'active'::public.account_status,
    onboarding_completed_at = now(),
    updated_at = now()
  WHERE id = uid
    AND account_status IN ('registered'::public.account_status, 'onboarding'::public.account_status);

  PERFORM public.onboarding_transition_end();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT tp.id
  INTO tid
  FROM public.talent_profiles tp
  WHERE tp.user_id = uid
    AND tp.deleted_at IS NULL
  LIMIT 1;

  IF tid IS NULL THEN
    INSERT INTO public.talent_profiles (
      user_id,
      profile_code,
      display_name,
      workflow_status,
      visibility
    )
    VALUES (
      uid,
      public.generate_profile_code(),
      (SELECT display_name FROM public.profiles WHERE id = uid),
      'draft',
      'hidden'
    )
    RETURNING id INTO tid;
  END IF;

  IF v_count = 0 AND tid IS NULL THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  RETURN tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_talent_onboarding_with_locations(
  p_residence_country_iso2    TEXT             DEFAULT NULL,
  p_residence_country_name_en TEXT             DEFAULT NULL,
  p_residence_country_name_es TEXT             DEFAULT NULL,
  p_residence_city_slug       TEXT             DEFAULT NULL,
  p_residence_city_name_en    TEXT             DEFAULT NULL,
  p_residence_city_name_es    TEXT             DEFAULT NULL,
  p_residence_lat             DOUBLE PRECISION DEFAULT NULL,
  p_residence_lng             DOUBLE PRECISION DEFAULT NULL,
  p_origin_country_iso2       TEXT             DEFAULT NULL,
  p_origin_country_name_en    TEXT             DEFAULT NULL,
  p_origin_country_name_es    TEXT             DEFAULT NULL,
  p_origin_city_slug          TEXT             DEFAULT NULL,
  p_origin_city_name_en       TEXT             DEFAULT NULL,
  p_origin_city_name_es       TEXT             DEFAULT NULL,
  p_origin_lat                DOUBLE PRECISION DEFAULT NULL,
  p_origin_lng                DOUBLE PRECISION DEFAULT NULL,
  p_display_name              TEXT             DEFAULT NULL,
  p_first_name                TEXT             DEFAULT NULL,
  p_last_name                 TEXT             DEFAULT NULL,
  p_phone                     TEXT             DEFAULT NULL,
  p_gender                    TEXT             DEFAULT NULL,
  p_date_of_birth             DATE             DEFAULT NULL,
  p_nationality               TEXT             DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid                   UUID;
  uid                   UUID := auth.uid();
  v_count               INT;
  v_residence_country_id UUID;
  v_residence_city_id   UUID;
  v_origin_country_id   UUID;
  v_origin_city_id      UUID;
  v_display_name        TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.onboarding_transition_begin();

  IF nullif(trim(coalesce(p_residence_country_iso2, '')), '') IS NOT NULL
     AND nullif(trim(coalesce(p_residence_city_name_en, '')), '') IS NOT NULL THEN
    SELECT country_id, city_id
    INTO v_residence_country_id, v_residence_city_id
    FROM public.ensure_city_location(
      p_residence_country_iso2,
      p_residence_country_name_en,
      p_residence_country_name_es,
      p_residence_city_slug,
      p_residence_city_name_en,
      p_residence_city_name_es,
      p_residence_lat,
      p_residence_lng,
      NULL
    );
  END IF;

  IF nullif(trim(coalesce(p_origin_country_iso2, '')), '') IS NOT NULL
     AND nullif(trim(coalesce(p_origin_city_name_en, '')), '') IS NOT NULL THEN
    SELECT country_id, city_id
    INTO v_origin_country_id, v_origin_city_id
    FROM public.ensure_city_location(
      p_origin_country_iso2,
      p_origin_country_name_en,
      p_origin_country_name_es,
      p_origin_city_slug,
      p_origin_city_name_en,
      p_origin_city_name_es,
      p_origin_lat,
      p_origin_lng,
      NULL
    );
  END IF;

  UPDATE public.profiles
  SET
    app_role                 = 'talent'::public.app_role,
    account_status           = 'active'::public.account_status,
    onboarding_completed_at  = now(),
    updated_at               = now()
  WHERE id = uid
    AND account_status IN (
      'registered'::public.account_status,
      'onboarding'::public.account_status
    );

  PERFORM public.onboarding_transition_end();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  IF v_display_name IS NULL THEN
    SELECT display_name INTO v_display_name FROM public.profiles WHERE id = uid;
  END IF;

  INSERT INTO public.talent_profiles (
    user_id,
    profile_code,
    display_name,
    first_name,
    last_name,
    phone,
    gender,
    date_of_birth,
    nationality,
    workflow_status,
    visibility,
    location_id,
    residence_country_id,
    residence_city_id,
    origin_country_id,
    origin_city_id
  )
  VALUES (
    uid,
    public.generate_profile_code(),
    v_display_name,
    nullif(trim(coalesce(p_first_name, '')), ''),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_gender, '')), ''),
    p_date_of_birth,
    nullif(trim(coalesce(p_nationality, '')), ''),
    'draft',
    'hidden',
    v_residence_city_id,
    v_residence_country_id,
    v_residence_city_id,
    v_origin_country_id,
    v_origin_city_id
  )
  RETURNING id INTO tid;

  RETURN tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_profile_for_current_user()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  has_client_profile BOOLEAN := FALSE;
  has_talent_profile BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.onboarding_transition_begin();

  SELECT *
  INTO auth_user
  FROM auth.users
  WHERE id = auth.uid();

  IF auth_user.id IS NULL THEN
    RAISE EXCEPTION 'Auth user missing';
  END IF;

  INSERT INTO public.profiles (id, display_name, app_role, account_status)
  VALUES (
    auth_user.id,
    COALESCE(
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'name',
      split_part(auth_user.email, '@', 1)
    ),
    NULL,
    'onboarding'
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.bootstrap_profile_from_auth_email(auth_user.id);

  SELECT EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.user_id = auth.uid()
  ) INTO has_client_profile;

  SELECT EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.user_id = auth.uid()
      AND tp.deleted_at IS NULL
  ) INTO has_talent_profile;

  UPDATE public.profiles
  SET
    display_name = COALESCE(
      public.profiles.display_name,
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'name',
      split_part(auth_user.email, '@', 1)
    ),
    account_status = CASE
      WHEN public.profiles.account_status = 'suspended' THEN 'suspended'::public.account_status
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN 'active'::public.account_status
      ELSE 'onboarding'::public.account_status
    END,
    onboarding_completed_at = CASE
      WHEN public.profiles.account_status = 'suspended' THEN public.profiles.onboarding_completed_at
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE public.profiles.id = auth.uid();

  PERFORM public.onboarding_transition_end();

  SELECT *
  INTO profile_row
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN profile_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_client_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talent_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_profile_for_current_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Proof. Every write inside is rolled back by the sentinel; an assertion
--    failure raises through and fails the migration.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  v_client UUID := gen_random_uuid();
  v_talent UUID := gen_random_uuid();
  v_status public.account_status;
  v_role   public.app_role;
  v_done   TIMESTAMPTZ;
  v_tid    UUID;
  v_n      INT;
BEGIN
  BEGIN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES
      (v_client, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'proof-' || v_client || '@onboarding.invalid', '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
      (v_talent, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'proof-' || v_talent || '@onboarding.invalid', '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

    SELECT account_status INTO v_status FROM public.profiles WHERE id = v_client;
    IF v_status IS DISTINCT FROM 'onboarding'::public.account_status THEN
      RAISE EXCEPTION 'proof setup: expected onboarding, got %', v_status;
    END IF;

    -- (a) A direct self-UPDATE as the user is reverted (the guard's purpose).
    PERFORM set_config('request.jwt.claim.sub', v_client::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles
       SET account_status = 'active', onboarding_completed_at = now(), app_role = 'super_admin'
     WHERE id = v_client;
    RESET ROLE;
    SELECT account_status, app_role, onboarding_completed_at INTO v_status, v_role, v_done
      FROM public.profiles WHERE id = v_client;
    IF v_status <> 'onboarding'::public.account_status OR v_done IS NOT NULL
       OR v_role IS DISTINCT FROM 'client'::public.app_role THEN
      RAISE EXCEPTION 'guard broken: direct self-update landed (% % %)', v_status, v_role, v_done;
    END IF;

    -- (b) Even with the flag raised by hand, a self-UPDATE cannot reach a staff role.
    PERFORM set_config('tulala.onboarding_rpc', '1', true);
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles SET app_role = 'agency_staff' WHERE id = v_client;
    RESET ROLE;
    PERFORM set_config('tulala.onboarding_rpc', '', true);
    SELECT app_role INTO v_role FROM public.profiles WHERE id = v_client;
    IF v_role IS DISTINCT FROM 'client'::public.app_role THEN
      RAISE EXCEPTION 'guard broken: flag let app_role become %', v_role;
    END IF;

    -- (c) The client RPC, as the user, completes onboarding.
    SET LOCAL ROLE authenticated;
    PERFORM public.complete_client_onboarding();
    RESET ROLE;
    SELECT account_status, app_role, onboarding_completed_at INTO v_status, v_role, v_done
      FROM public.profiles WHERE id = v_client;
    IF v_status <> 'active'::public.account_status OR v_done IS NULL
       OR v_role IS DISTINCT FROM 'client'::public.app_role THEN
      RAISE EXCEPTION 'complete_client_onboarding did not land (% % %)', v_status, v_role, v_done;
    END IF;
    SELECT count(*) INTO v_n FROM public.client_profiles WHERE user_id = v_client;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'complete_client_onboarding wrote % client_profiles rows', v_n;
    END IF;
    IF coalesce(current_setting('tulala.onboarding_rpc', true), '') <> '' THEN
      RAISE EXCEPTION 'flag still raised after the RPC';
    END IF;

    -- (d) After the RPC, in the same transaction, a direct self-UPDATE is guarded again.
    SET LOCAL ROLE authenticated;
    UPDATE public.profiles SET account_status = 'suspended', app_role = 'super_admin' WHERE id = v_client;
    RESET ROLE;
    SELECT account_status, app_role INTO v_status, v_role FROM public.profiles WHERE id = v_client;
    IF v_status <> 'active'::public.account_status OR v_role IS DISTINCT FROM 'client'::public.app_role THEN
      RAISE EXCEPTION 'guard broken after RPC (% %)', v_status, v_role;
    END IF;

    -- (e) The talent RPC, as the second user, completes onboarding and creates the talent profile.
    PERFORM set_config('request.jwt.claim.sub', v_talent::text, true);
    SET LOCAL ROLE authenticated;
    SELECT public.complete_talent_onboarding_with_locations(p_display_name => 'Onboarding proof') INTO v_tid;
    RESET ROLE;
    SELECT account_status, app_role, onboarding_completed_at INTO v_status, v_role, v_done
      FROM public.profiles WHERE id = v_talent;
    IF v_status <> 'active'::public.account_status OR v_done IS NULL
       OR v_role IS DISTINCT FROM 'talent'::public.app_role THEN
      RAISE EXCEPTION 'complete_talent_onboarding_with_locations did not land (% % %)', v_status, v_role, v_done;
    END IF;
    IF v_tid IS NULL OR NOT EXISTS (SELECT 1 FROM public.talent_profiles WHERE id = v_tid AND user_id = v_talent) THEN
      RAISE EXCEPTION 'talent profile not created';
    END IF;

    -- (f) ensure_profile_for_current_user, as the client, keeps the active row active.
    PERFORM set_config('request.jwt.claim.sub', v_client::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.ensure_profile_for_current_user();
    RESET ROLE;
    SELECT account_status INTO v_status FROM public.profiles WHERE id = v_client;
    IF v_status <> 'active'::public.account_status THEN
      RAISE EXCEPTION 'ensure_profile_for_current_user regressed the row to %', v_status;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true);
    RAISE SQLSTATE 'P0PRF' USING MESSAGE = 'onboarding proof passed; rolling the proof writes back';
  EXCEPTION
    WHEN SQLSTATE 'P0PRF' THEN
      RAISE NOTICE '%', SQLERRM;
  END;
END $proof$;

COMMIT;
