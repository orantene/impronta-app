-- Atomic full-replace for talent_languages.
-- Replaces the non-atomic delete-then-insert pattern in server actions
-- with a single transaction so a mid-request crash can't leave the talent
-- with zero languages.
--
-- Parameters:
--   p_talent_profile_id  UUID of the talent profile being updated.
--   p_tenant_id          UUID of the calling workspace (scopes the replace).
--   p_rows               JSONB array of language objects matching the
--                        talent_languages column set.

CREATE OR REPLACE FUNCTION replace_talent_languages(
  p_talent_profile_id UUID,
  p_tenant_id         UUID,
  p_rows              JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete existing rows for this talent + tenant in the same tx.
  DELETE FROM public.talent_languages
    WHERE talent_profile_id = p_talent_profile_id
      AND tenant_id = p_tenant_id;

  -- Insert the new set (no-op when array is empty).
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

-- Only staff (service role) may call this function; RLS on the table still
-- guards direct reads. The server actions always authenticate the actor
-- before calling here, so this is defence-in-depth.
REVOKE ALL ON FUNCTION replace_talent_languages(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_talent_languages(UUID, UUID, JSONB) TO service_role;
