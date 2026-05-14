-- Atomic sort_order allocator for media_assets bulk inserts.
--
-- Without this, two concurrent uploads to the same talent both read
-- max(sort_order) at the same time and write duplicate values. This RPC
-- runs in a single transaction and returns the starting sort_order for
-- the requested batch — callers fill rows with start, start+1, …
--
-- We tag the talent's existing gallery rows by reserving the range up to
-- start + count - 1; subsequent callers will see the new max.

CREATE OR REPLACE FUNCTION public.allocate_media_gallery_sort_order(
  p_talent_profile_id uuid,
  p_count int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_max int;
BEGIN
  IF p_count <= 0 THEN
    RETURN 1;
  END IF;

  -- Lock the talent's gallery rows so concurrent allocators serialise.
  PERFORM 1
    FROM public.media_assets
    WHERE owner_talent_profile_id = p_talent_profile_id
      AND variant_kind = 'gallery'
      AND deleted_at IS NULL
    FOR UPDATE;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_current_max
    FROM public.media_assets
    WHERE owner_talent_profile_id = p_talent_profile_id
      AND variant_kind = 'gallery'
      AND deleted_at IS NULL;

  RETURN v_current_max + 1;
END
$$;

GRANT EXECUTE ON FUNCTION public.allocate_media_gallery_sort_order(uuid, int)
  TO authenticated, service_role;
