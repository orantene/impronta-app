-- Extend directory RPC with primary talent type, location, up to 2 fit labels, height (card density / DTO).

BEGIN;
DROP FUNCTION IF EXISTS public.api_directory_cards(int, timestamptz, uuid, uuid[]);
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
  thumb_storage_path text,
  primary_talent_type_name_en text,
  primary_talent_type_name_es text,
  location_display_en text,
  location_display_es text,
  location_country_code text,
  fit_labels_jsonb jsonb,
  height_cm int
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
    m.storage_path AS thumb_storage_path,
    tt_primary.name_en AS primary_talent_type_name_en,
    tt_primary.name_es AS primary_talent_type_name_es,
    l.display_name_en AS location_display_en,
    l.display_name_es AS location_display_es,
    l.country_code AS location_country_code,
    COALESCE(fl.fit_labels_jsonb, '[]'::jsonb) AS fit_labels_jsonb,
    t.height_cm
  FROM public.talent_profiles t
  LEFT JOIN public.locations l
    ON l.id = t.location_id
   AND l.archived_at IS NULL
  LEFT JOIN LATERAL (
    SELECT tt.name_en, tt.name_es
    FROM public.talent_profile_taxonomy tpt
    JOIN public.taxonomy_terms tt
      ON tt.id = tpt.taxonomy_term_id
     AND tt.archived_at IS NULL
    WHERE tpt.talent_profile_id = t.id
      AND tt.kind = 'talent_type'
    ORDER BY tpt.is_primary DESC, tt.sort_order, tt.name_en
    LIMIT 1
  ) tt_primary ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'slug', sub.slug,
            'name_en', sub.name_en,
            'name_es', sub.name_es
          )
          ORDER BY sub.sort_order, sub.name_en
        )
        FROM (
          SELECT tt.slug, tt.name_en, tt.name_es, tt.sort_order
          FROM public.talent_profile_taxonomy tpt
          JOIN public.taxonomy_terms tt
            ON tt.id = tpt.taxonomy_term_id
           AND tt.archived_at IS NULL
          WHERE tpt.talent_profile_id = t.id
            AND tt.kind = 'fit_label'
          ORDER BY tt.sort_order, tt.name_en
          LIMIT 2
        ) sub
      ),
      '[]'::jsonb
    ) AS fit_labels_jsonb
  ) fl ON true
  LEFT JOIN LATERAL (
    SELECT ma.width, ma.height, ma.bucket_id, ma.storage_path
    FROM public.media_assets ma
    WHERE ma.owner_talent_profile_id = t.id
      AND ma.deleted_at IS NULL
      AND ma.approval_state = 'approved'
      AND ma.variant_kind IN ('card', 'public_watermarked', 'gallery')
    ORDER BY
      CASE ma.variant_kind
        WHEN 'card' THEN 0
        WHEN 'public_watermarked' THEN 1
        ELSE 2
      END,
      ma.sort_order,
      ma.created_at
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
