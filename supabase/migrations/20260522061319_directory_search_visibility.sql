-- Directory search + sort layer — follow-on to 20260522061318_talent_public_visibility.
--
-- The directory search RPC and the partial sort/FTS indexes were hard-coded to
-- workflow_status IN ('approved','published') AND visibility='public'. With the
-- visibility overhaul the public gate is now `is_publicly_hidden = false` (the
-- agency eye is enforced separately via agency_talent_roster). Recreate the RPC
-- and the partial indexes against the new predicate so search results and the
-- sort fast-path match the Draft-free model.

BEGIN;

-- ---------------------------------------------------------------------------
-- Partial indexes — predicate swapped to the new public gate.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_talent_profiles_directory_fts;
DROP INDEX IF EXISTS public.idx_talent_profiles_display_name_trgm;
DROP INDEX IF EXISTS public.idx_talent_profiles_profile_code_trgm;
DROP INDEX IF EXISTS public.idx_talent_profiles_public_featured_sort;
DROP INDEX IF EXISTS public.idx_talent_profiles_public_recent;
DROP INDEX IF EXISTS public.idx_talent_profiles_public_updated;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_directory_fts
  ON public.talent_profiles
  USING gin (
    to_tsvector(
      'simple',
      coalesce(display_name, '')
        || ' ' || coalesce(first_name, '')
        || ' ' || coalesce(last_name, '')
        || ' ' || coalesce(profile_code, '')
        || ' ' || coalesce(short_bio, '')
        || ' ' || coalesce(bio_en, '')
        || ' ' || coalesce(bio_es, '')
    )
  )
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_display_name_trgm
  ON public.talent_profiles
  USING gin (display_name gin_trgm_ops)
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false
    AND display_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_profile_code_trgm
  ON public.talent_profiles
  USING gin (profile_code gin_trgm_ops)
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_public_featured_sort
  ON public.talent_profiles (
    is_featured DESC,
    featured_level DESC,
    featured_position ASC,
    updated_at DESC,
    created_at DESC,
    id DESC
  )
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_public_recent
  ON public.talent_profiles (created_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_public_updated
  ON public.talent_profiles (updated_at DESC, id DESC)
  WHERE deleted_at IS NULL
    AND is_publicly_hidden = false;

-- ---------------------------------------------------------------------------
-- Search RPC — public gate swapped to `is_publicly_hidden = false`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.directory_search_public_talent_ids(p_query text)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_raw text;
  v_safe text;
  v_like text;
  v_tsq tsquery;
BEGIN
  v_raw := trim(coalesce(p_query, ''));
  IF length(v_raw) < 1 THEN
    RETURN;
  END IF;

  v_safe := regexp_replace(v_raw, '\s+', ' ', 'g');
  v_safe := replace(replace(v_safe, '%', ''), '_', '');
  v_like := '%' || v_safe || '%';

  v_tsq := websearch_to_tsquery('simple', v_raw);

  RETURN QUERY
  SELECT DISTINCT x.id
  FROM (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND (
        (v_tsq IS NOT NULL AND numnode(v_tsq) > 0 AND to_tsvector(
          'simple',
          coalesce(tp.display_name, '')
            || ' ' || coalesce(tp.first_name, '')
            || ' ' || coalesce(tp.last_name, '')
            || ' ' || coalesce(tp.profile_code, '')
            || ' ' || coalesce(tp.short_bio, '')
            || ' ' || coalesce(tp.bio_en, '')
            || ' ' || coalesce(tp.bio_es, '')
        ) @@ v_tsq)
        OR (
          length(v_safe) >= 2
          AND (
            coalesce(tp.display_name, '') ILIKE v_like
            OR coalesce(tp.first_name, '') ILIKE v_like
            OR coalesce(tp.last_name, '') ILIKE v_like
            OR coalesce(tp.profile_code, '') ILIKE v_like
            OR coalesce(tp.short_bio, '') ILIKE v_like
            OR coalesce(tp.bio_en, '') ILIKE v_like
            OR coalesce(tp.bio_es, '') ILIKE v_like
          )
        )
        OR (
          length(v_safe) >= 3
          AND (
            similarity(coalesce(tp.display_name, ''), v_safe) > 0.22
            OR similarity(coalesce(tp.profile_code, ''), v_safe) > 0.22
          )
        )
      )

    UNION

    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND EXISTS (
        SELECT 1
        FROM public.locations l
        WHERE l.archived_at IS NULL
          AND (l.id = tp.residence_city_id OR l.id = tp.location_id)
          AND (
            l.city_slug ILIKE v_like
            OR l.display_name_en ILIKE v_like
            OR coalesce(l.display_name_es, '') ILIKE v_like
          )
      )

    UNION

    SELECT tpt.talent_profile_id AS id
    FROM public.talent_profile_taxonomy tpt
    INNER JOIN public.talent_profiles tp ON tp.id = tpt.talent_profile_id
    INNER JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id AND tt.archived_at IS NULL
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND (
        tt.name_en ILIKE v_like
        OR coalesce(tt.name_es, '') ILIKE v_like
        OR tt.slug ILIKE v_like
        OR (
          length(v_safe) >= 3
          AND (
            similarity(tt.name_en, v_safe) > 0.2
            OR similarity(tt.slug, v_safe) > 0.25
          )
        )
      )

    UNION

    SELECT fv.talent_profile_id AS id
    FROM public.field_values fv
    INNER JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
    INNER JOIN public.talent_profiles tp ON tp.id = fv.talent_profile_id
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND fd.searchable = true
      AND fd.active = true
      AND fd.archived_at IS NULL
      AND fd.internal_only = false
      AND fd.public_visible = true
      AND fd.profile_visible = true
      AND fd.value_type IN ('text'::public.field_value_type, 'textarea'::public.field_value_type)
      AND length(v_safe) >= 1
      AND coalesce(fv.value_text, '') ILIKE v_like
  ) x;
END;
$$;

GRANT EXECUTE ON FUNCTION public.directory_search_public_talent_ids(text) TO anon, authenticated;

COMMIT;
