-- replace_talent_languages: delete by PROFILE, not by (profile, tenant).
--
-- Found live 2026-09-10 (first real talent signup, TAL-92137): the first
-- languages save succeeded and every save after it failed with
--   23505 duplicate key (talent_profile_id, language_code)=(…, en)
-- and, because the profile drawer saves sections together, the whole drawer
-- showed "Couldn't save" from then on.
--
-- Cause: the self-edit path stores languages with tenant_id NULL ("global
-- across all agency rosters", see talent-self-profile-sections.ts), and the
-- RPC's DELETE used `tenant_id = p_tenant_id`. With p_tenant_id NULL that
-- predicate is never true, so nothing was deleted and the INSERT collided
-- with the rows from the previous save.
--
-- The unique constraint is (talent_profile_id, language_code) with NO tenant
-- column, i.e. a profile has ONE row per language regardless of tenant. A
-- tenant-scoped delete can therefore never be correct here: any tenant that
-- did not write the existing row would collide with it too. Delete every
-- language row for the profile and write the submitted set; the tenant id is
-- still stamped on the new rows so staff RLS reads keep working.
CREATE OR REPLACE FUNCTION public.replace_talent_languages(
  p_talent_profile_id UUID,
  p_tenant_id         UUID,
  p_rows              JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.talent_languages
    WHERE talent_profile_id = p_talent_profile_id;

  IF jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO public.talent_languages (
      talent_profile_id,
      tenant_id,
      language_code,
      language_name,
      speaking_level,
      is_native,
      can_host,
      can_sell,
      can_translate,
      can_teach,
      display_order
    )
    SELECT
      p_talent_profile_id,
      p_tenant_id,
      (r->>'language_code'),
      (r->>'language_name'),
      (r->>'speaking_level')::text,
      COALESCE((r->>'is_native')::boolean, false),
      COALESCE((r->>'can_host')::boolean,  false),
      COALESCE((r->>'can_sell')::boolean,  false),
      COALESCE((r->>'can_translate')::boolean, false),
      COALESCE((r->>'can_teach')::boolean, false),
      COALESCE((r->>'display_order')::int, 0)
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$$;
