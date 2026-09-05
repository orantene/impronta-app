-- Give replace_talent_languages an authorization check of its own.
--
-- On 2026-09-03 this function was SECURITY DEFINER, anon-executable, and its
-- entire body was a DELETE and an INSERT driven by the caller's parameters:
--
--     DELETE FROM talent_languages WHERE talent_profile_id=$1 AND tenant_id=$2;
--     INSERT ... SELECT FROM jsonb_array_elements(p_rows)
--
-- No auth.uid(), no ownership check, no tenant check. Profile ids are printed
-- on public directory pages, so anyone on the internet could wipe and rewrite
-- any talent's languages. The anon grant was revoked the same night, but a
-- revoke is a tourniquet: the function is exposed again the moment anyone
-- re-grants it, and CREATE OR REPLACE is exactly how that happens by accident.
--
-- This adds the missing half. The convention in this database is that a
-- SECURITY DEFINER function defends itself in its body — claim_talent_profile,
-- set_primary_agency_domain and engine_convert_to_booking all read auth.uid().
--
-- ── THE PART THAT IS EASY TO GET WRONG ──────────────────────────────────────
-- A naive `IF auth.uid() IS NULL THEN RAISE` would BREAK a legitimate caller.
-- The three real call sites are not alike:
--
--   admin-talent-languages.ts          requireWorkspaceStaffAction
--   admin-talent-profile-sections.ts   requireWorkspaceStaffAction
--       -> the caller's USER-SCOPED session client, so `authenticated`,
--          auth.uid() is the staff user
--
--   talent-self-profile-sections.ts    requireTalentSelfAction
--       -> a SERVICE-ROLE client, so auth.uid() is NULL
--
-- So the talent's own edit path arrives with no uid at all, and rejecting a
-- null uid would silently break the one surface a talent uses to edit their own
-- languages. service_role is admitted explicitly: it is only reachable from our
-- own server with the secret key, and the app layer has already authorised
-- there. Verified the callers before choosing, rather than assuming they were
-- uniform.
--
-- Body is otherwise byte-identical to the deployed definition.

CREATE OR REPLACE FUNCTION public.replace_talent_languages(
  p_talent_profile_id uuid,
  p_tenant_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- ── AUTHORIZATION ─────────────────────────────────────────────────────────
  -- RAISE rather than return quietly: a silent no-op on a write is
  -- indistinguishable from success to every caller, and this repo has spent a
  -- day on defects whose whole shape was two states sharing one signal.
  IF auth.role() = 'service_role' THEN
    NULL;  -- our own server, key-authenticated, already authorised upstream
  ELSIF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'replace_talent_languages: not authenticated'
      USING ERRCODE = '42501';
  ELSIF NOT (
    public.is_staff_of_tenant(p_tenant_id)
    OR public.is_talent_profile_owner(p_talent_profile_id)
  ) THEN
    RAISE EXCEPTION 'replace_talent_languages: not authorized for this talent or tenant'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.talent_languages
   WHERE talent_profile_id = p_talent_profile_id
     AND tenant_id = p_tenant_id;

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.talent_languages (
      talent_profile_id, tenant_id, language_code, language_name,
      speaking_level, is_native, can_host, can_sell, can_translate,
      can_teach, display_order
    )
    SELECT
      p_talent_profile_id,
      p_tenant_id,
      (r->>'language_code'),
      (r->>'language_name'),
      (r->>'speaking_level')::text,
      COALESCE((r->>'is_native')::boolean, false),
      COALESCE((r->>'can_host')::boolean, false),
      COALESCE((r->>'can_sell')::boolean, false),
      COALESCE((r->>'can_translate')::boolean, false),
      COALESCE((r->>'can_teach')::boolean, false),
      COALESCE((r->>'display_order')::int, 0)
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$function$;

-- CREATE OR REPLACE RESETS GRANTS TO THE DEFAULT, which grants EXECUTE to
-- PUBLIC. Re-revoking here is not belt-and-braces, it is required: without it
-- this very migration would re-open the hole it exists to close.
REVOKE EXECUTE ON FUNCTION public.replace_talent_languages(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replace_talent_languages(uuid, uuid, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.replace_talent_languages(uuid, uuid, jsonb) TO authenticated;

-- ASSERT THE OUTCOME IN THE MIGRATION, not only at review. Costs nothing on
-- replay and survives the next CREATE OR REPLACE, which is precisely how a
-- revoke silently comes undone. Standard from the Orders Manager.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.replace_talent_languages(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'replace_talent_languages is STILL anon-executable after this migration';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.replace_talent_languages(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'replace_talent_languages lost the authenticated grant the staff edit path needs';
  END IF;
END $$;
