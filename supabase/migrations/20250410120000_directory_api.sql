-- Keyset-paginated directory cards for public discovery (anon RLS applies via INVOKER)

BEGIN;
CREATE OR REPLACE FUNCTION public.api_directory_cards(
  p_limit int DEFAULT 24,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_taxonomy_term_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  profile_code text,
  public_slug_part text,
  display_name text,
  first_name text,
  last_name text,
  created_at timestamptz,
  is_featured boolean,
  featured_level int,
  thumb_width int,
  thumb_height int,
  thumb_bucket_id text,
  thumb_storage_path text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.profile_code,
    t.public_slug_part,
    t.display_name,
    t.first_name,
    t.last_name,
    t.created_at,
    t.is_featured,
    t.featured_level,
    m.width AS thumb_width,
    m.height AS thumb_height,
    m.bucket_id AS thumb_bucket_id,
    m.storage_path AS thumb_storage_path
  FROM public.talent_profiles t
  LEFT JOIN LATERAL (
    SELECT ma.width, ma.height, ma.bucket_id, ma.storage_path
    FROM public.media_assets ma
    WHERE ma.owner_talent_profile_id = t.id
      AND ma.deleted_at IS NULL
      AND ma.approval_state = 'approved'
      AND ma.variant_kind = 'card'
    ORDER BY ma.sort_order ASC, ma.created_at ASC
    LIMIT 1
  ) m ON true
  WHERE t.deleted_at IS NULL
    AND t.workflow_status = 'approved'
    AND t.visibility = 'public'
    AND (
      p_after_created_at IS NULL
      OR (
        t.created_at < p_after_created_at
        OR (t.created_at = p_after_created_at AND t.id < p_after_id)
      )
    )
    AND (
      p_taxonomy_term_ids IS NULL
      OR cardinality(p_taxonomy_term_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = t.id
          AND tpt.taxonomy_term_id = ANY (p_taxonomy_term_ids)
      )
    )
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 48);
$$;
GRANT EXECUTE ON FUNCTION public.api_directory_cards(int, timestamptz, uuid, uuid[])
  TO anon, authenticated;
COMMIT;
