-- Talent-owned gallery soft-delete: bypasses fragile client UPDATE RLS while still
-- enforcing ownership via auth.uid() inside the function.

BEGIN;
CREATE OR REPLACE FUNCTION public.talent_soft_delete_own_media(p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_deleted timestamptz;
BEGIN
  SELECT ma.owner_talent_profile_id, ma.deleted_at
  INTO v_owner, v_deleted
  FROM public.media_assets ma
  WHERE ma.id = p_media_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_deleted IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.talent_profiles t
    WHERE t.id = v_owner
      AND t.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.media_assets
  SET
    deleted_at = now(),
    updated_at = now()
  WHERE id = p_media_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.talent_soft_delete_own_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_soft_delete_own_media(uuid) TO authenticated;
COMMENT ON FUNCTION public.talent_soft_delete_own_media(uuid) IS
  'Soft-deletes a media_assets row when the caller owns the linked talent_profiles row.';
COMMIT;
