-- HELD (PM applies). F1 (TUL-1273 deferred): services searchable in the directory.
--
-- Adds ONE leg to public.directory_search_public_talent_ids(text): talents whose
-- published, approved, PUBLIC talent offerings match the query by title,
-- category or description. Everything else is byte-identical to the live body
-- (pg_get_functiondef on staging fxlank, 2026-10-19): same signature, same
-- RETURNS SETOF uuid / plpgsql / STABLE / search_path, invoker rights (not
-- SECURITY DEFINER), and the name/bio, location, taxonomy and System B value
-- legs unchanged. CREATE OR REPLACE keeps the existing grants.
--
-- The facet-count RPCs already filter p_search through this function
-- (20261231413000), so facet counts pick the new leg up with no change there.
--
-- Idempotent: CREATE OR REPLACE. Rollback: re-run the function body from the
-- live definition (the same text minus the OFFERINGS leg).

CREATE OR REPLACE FUNCTION public.directory_search_public_talent_ids(p_query text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
            || ' ' || coalesce(tp.bio_i18n ->> 'en', '')
            || ' ' || coalesce(tp.bio_i18n ->> 'es', '')
        ) @@ v_tsq)
        OR (
          length(v_safe) >= 2
          AND (
            coalesce(tp.display_name, '') ILIKE v_like
            OR coalesce(tp.first_name, '') ILIKE v_like
            OR coalesce(tp.last_name, '') ILIKE v_like
            OR coalesce(tp.profile_code, '') ILIKE v_like
            OR coalesce(tp.short_bio, '') ILIKE v_like
            OR coalesce(tp.bio_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(tp.bio_i18n ->> 'es', '') ILIKE v_like
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
            OR coalesce(l.display_name_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(l.display_name_i18n ->> 'es', '') ILIKE v_like
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
        coalesce(tt.name_i18n ->> 'en', '') ILIKE v_like
        OR coalesce(tt.name_i18n ->> 'es', '') ILIKE v_like
        OR tt.slug ILIKE v_like
        OR (
          length(v_safe) >= 3
          AND (
            similarity(coalesce(tt.name_i18n ->> 'en', ''), v_safe) > 0.2
            OR similarity(tt.slug, v_safe) > 0.25
          )
        )
      )

    UNION

    -- VALUE leg — System B (`talent_profile_field_values`). Mirrors
    -- `read-source-directory-search.ts`: ILIKE B's jsonb scalar (`value #>> '{}'`)
    -- across the canonical B defs for the searchable BRIDGED keys (resolved via
    -- the A→B key bridge) PLUS the three canonical SOCIAL handle fields.
    SELECT bv.talent_profile_id AS id
    FROM public.talent_profile_field_values bv
    INNER JOIN public.profile_field_definitions pfd
      ON pfd.id = bv.field_definition_id
     AND pfd.deprecated_at IS NULL
     AND pfd.field_key IN (
        'physical.body_type', 'physical.dress_size', 'physical.eye_color',
        'physical.hair_color', 'physical.hair_length', 'physical.shoe_size_eu',
        'experience.level', 'experience.notable_work',
        'experience.professional_highlights', 'availability.status',
        'availability.available_for', 'travel.scope', 'media.website_url',
        'creator.instagram_handle', 'creator.tiktok_handle', 'creator.youtube_channel'
     )
    INNER JOIN public.talent_profiles tp ON tp.id = bv.talent_profile_id
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND coalesce(bv.value #>> '{}', '') ILIKE v_like

    UNION

    -- OFFERINGS leg (F1, TUL-1273). A talent is found by the services they sell.
    -- D-10 guest-sellable rule, fail-safe: ONLY talent-owned rows that are
    -- published AND approved AND public. Never agency_only / on_request /
    -- pending / rejected / draft / archived, and never a workspace-owned row.
    -- Title / category / description (plus their en/es maps) match as words via
    -- the same 'simple' tsquery as the name leg; title and category also match as
    -- substrings (>= 2 chars). Description is word-match only so a short
    -- substring like "de" cannot match every long description.
    SELECT o.talent_profile_id AS id
    FROM public.talent_offerings o
    INNER JOIN public.talent_profiles tp ON tp.id = o.talent_profile_id
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND o.owner_kind = 'talent'
      AND o.status = 'published'
      AND o.moderation_state = 'approved'
      AND o.visibility = 'public'
      AND (
        (v_tsq IS NOT NULL AND numnode(v_tsq) > 0 AND to_tsvector(
          'simple',
          coalesce(o.title, '')
            || ' ' || coalesce(o.category, '')
            || ' ' || coalesce(o.description, '')
            || ' ' || coalesce(o.title_i18n ->> 'en', '')
            || ' ' || coalesce(o.title_i18n ->> 'es', '')
            || ' ' || coalesce(o.category_i18n ->> 'en', '')
            || ' ' || coalesce(o.category_i18n ->> 'es', '')
            || ' ' || coalesce(o.description_i18n ->> 'en', '')
            || ' ' || coalesce(o.description_i18n ->> 'es', '')
        ) @@ v_tsq)
        OR (
          length(v_safe) >= 2
          AND (
            coalesce(o.title, '') ILIKE v_like
            OR coalesce(o.category, '') ILIKE v_like
            OR coalesce(o.title_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(o.title_i18n ->> 'es', '') ILIKE v_like
            OR coalesce(o.category_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(o.category_i18n ->> 'es', '') ILIKE v_like
          )
        )
      )
  ) x;
END;
$function$;
