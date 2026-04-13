BEGIN;
DROP FUNCTION IF EXISTS public.api_directory_cards(int, timestamptz, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.api_directory_cards(int, int, uuid[], text, text, text);
CREATE OR REPLACE FUNCTION public.api_directory_cards(
  p_limit int DEFAULT 24,
  p_offset int DEFAULT 0,
  p_taxonomy_term_ids uuid[] DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_location_slug text DEFAULT NULL,
  p_sort text DEFAULT 'recommended'
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
  WITH base AS (
    SELECT
      t.id,
      t.profile_code,
      t.public_slug_part,
      t.display_name,
      t.first_name,
      t.last_name,
      t.short_bio,
      t.created_at,
      t.updated_at,
      t.listing_started_at,
      t.is_featured,
      t.featured_level,
      t.featured_position,
      t.height_cm,
      l.city_slug,
      l.display_name_en AS location_display_en,
      l.display_name_es AS location_display_es,
      l.country_code AS location_country_code,
      tt_primary.name_en AS primary_talent_type_name_en,
      tt_primary.name_es AS primary_talent_type_name_es,
      COALESCE(fl.fit_labels_jsonb, '[]'::jsonb) AS fit_labels_jsonb,
      m.width AS thumb_width,
      m.height AS thumb_height,
      m.bucket_id AS thumb_bucket_id,
      m.storage_path AS thumb_storage_path
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
        p_taxonomy_term_ids IS NULL
        OR cardinality(p_taxonomy_term_ids) = 0
        OR EXISTS (
          SELECT 1
          FROM public.talent_profile_taxonomy tpt
          WHERE tpt.talent_profile_id = t.id
            AND tpt.taxonomy_term_id = ANY (p_taxonomy_term_ids)
        )
      )
      AND (
        COALESCE(NULLIF(trim(p_location_slug), ''), '') = ''
        OR COALESCE(l.city_slug, '') = trim(p_location_slug)
      )
      AND (
        COALESCE(NULLIF(trim(p_query), ''), '') = ''
        OR COALESCE(t.profile_code, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(t.display_name, '') ILIKE '%' || trim(p_query) || '%'
        OR CONCAT_WS(' ', t.first_name, t.last_name) ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(t.short_bio, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(tt_primary.name_en, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(tt_primary.name_es, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(l.display_name_en, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(l.display_name_es, '') ILIKE '%' || trim(p_query) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.talent_profile_taxonomy tpt
          JOIN public.taxonomy_terms tt
            ON tt.id = tpt.taxonomy_term_id
           AND tt.archived_at IS NULL
          WHERE tpt.talent_profile_id = t.id
            AND (
              COALESCE(tt.name_en, '') ILIKE '%' || trim(p_query) || '%'
              OR COALESCE(tt.name_es, '') ILIKE '%' || trim(p_query) || '%'
              OR COALESCE(tt.slug, '') ILIKE '%' || trim(p_query) || '%'
            )
        )
      )
  )
  SELECT
    base.id,
    base.profile_code,
    base.public_slug_part,
    base.display_name,
    base.first_name,
    base.last_name,
    base.created_at,
    base.is_featured,
    base.featured_level,
    base.thumb_width,
    base.thumb_height,
    base.thumb_bucket_id,
    base.thumb_storage_path,
    base.primary_talent_type_name_en,
    base.primary_talent_type_name_es,
    base.location_display_en,
    base.location_display_es,
    base.location_country_code,
    base.fit_labels_jsonb,
    base.height_cm
  FROM base
  ORDER BY
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN CASE WHEN base.is_featured THEN 0 ELSE 1 END
      ELSE 0
    END,
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN base.featured_level
      ELSE 0
    END DESC,
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN base.featured_position
      ELSE 0
    END ASC,
    CASE
      WHEN COALESCE(p_sort, 'recommended') = 'updated'
        THEN base.updated_at
      WHEN COALESCE(p_sort, 'recommended') = 'recent'
        THEN base.created_at
      ELSE COALESCE(base.listing_started_at, base.updated_at, base.created_at)
    END DESC,
    base.created_at DESC,
    base.id DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT LEAST(GREATEST(p_limit, 1), 48);
$$;
GRANT EXECUTE ON FUNCTION public.api_directory_cards(int, int, uuid[], text, text, text)
  TO anon, authenticated;
DROP FUNCTION IF EXISTS public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, DATE, TEXT, INT, TEXT, TEXT, JSONB, TEXT, UUID[]);
CREATE OR REPLACE FUNCTION public.guest_submit_inquiry(
  p_session_key TEXT,
  p_contact_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_company TEXT,
  p_event_type_id UUID DEFAULT NULL,
  p_event_date DATE DEFAULT NULL,
  p_event_location TEXT DEFAULT NULL,
  p_quantity INT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_raw_ai_query TEXT DEFAULT NULL,
  p_interpreted_query JSONB DEFAULT NULL,
  p_source_page TEXT DEFAULT NULL,
  p_talent_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
  iid UUID;
  tid UUID;
BEGIN
  IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
    RAISE EXCEPTION 'Name required';
  END IF;
  IF p_contact_email IS NULL OR length(trim(p_contact_email)) = 0 THEN
    RAISE EXCEPTION 'Email required';
  END IF;

  SELECT id INTO gid
  FROM public.guest_sessions
  WHERE session_key = p_session_key;

  IF gid IS NULL THEN
    RAISE EXCEPTION 'Unknown guest session';
  END IF;

  IF p_talent_ids IS NULL OR array_length(p_talent_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one talent';
  END IF;

  INSERT INTO public.inquiries (
    guest_session_id,
    client_user_id,
    contact_name,
    contact_email,
    contact_phone,
    company,
    event_date,
    event_location,
    quantity,
    message,
    event_type_id,
    raw_ai_query,
    interpreted_query,
    source_page,
    status
  )
  VALUES (
    gid,
    NULL,
    trim(p_contact_name),
    trim(p_contact_email),
    NULLIF(trim(p_contact_phone), ''),
    NULLIF(trim(p_company), ''),
    p_event_date,
    NULLIF(trim(COALESCE(p_event_location, '')), ''),
    CASE WHEN p_quantity IS NOT NULL AND p_quantity > 0 THEN p_quantity ELSE NULL END,
    NULLIF(trim(p_message), ''),
    p_event_type_id,
    NULLIF(trim(COALESCE(p_raw_ai_query, '')), ''),
    p_interpreted_query,
    NULLIF(trim(COALESCE(p_source_page, '')), ''),
    'new'::public.inquiry_status
  )
  RETURNING id INTO iid;

  FOREACH tid IN ARRAY p_talent_ids
  LOOP
    INSERT INTO public.inquiry_talent (inquiry_id, talent_profile_id)
    VALUES (iid, tid)
    ON CONFLICT (inquiry_id, talent_profile_id) DO NOTHING;
  END LOOP;

  RETURN iid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, DATE, TEXT, INT, TEXT, TEXT, JSONB, TEXT, UUID[])
  TO anon, authenticated;
COMMIT;
