-- ============================================================================
-- INCIDENT FIX — repoint the 4 directory RPCs off the DROPPED System A tables
-- (`field_values` + `field_definitions`) onto canonical System B
-- (`talent_profile_field_values` + `profile_field_definitions`).
--
-- WHY (live 500): T3.3 (`20261021000000_drop_system_a_field_tables.sql`) dropped
-- both System A tables, but FOUR live directory RPCs still referenced them in
-- their bodies and now ERROR at runtime:
--   1. directory_search_public_talent_ids(text)         — its final UNION value
--      leg joined `field_values` + `field_definitions` → 42P01 "relation
--      public.field_values does not exist". This is a HARD 500: the TS guard
--      `isDirectorySearchRpcUnavailableError` only matches "function ... does
--      not exist", NOT "relation ... does not exist", so the legacy fallback
--      never engaged → directory text search threw.
--   2. directory_facet_boolean_field_value_counts(...)  — JOINs `field_values`.
--   3. directory_facet_text_field_value_counts(...)     — JOINs `field_values`.
--   4. directory_facet_scalar_base_ids(...)             — the base-ids fn the
--      two count RPCs derive from; its boolean/text CROSS-FILTER legs JOIN
--      `field_values`. (The 5th referencing fn,
--      `invalidate_talent_embeddings_for_field_definition_ai_visible`, is an
--      ORPHAN with 0 triggers — harmless, left untouched.)
--
-- The product TS already reads System B only (the directory read seams were
-- repointed in T2.x/T3.2: `read-source-directory-search.ts`,
-- `read-source-directory-facets.ts`, `read-source-directory-facet-config.ts`).
-- These RPCs were the last System-A readers; this migration brings them to
-- PARITY with those TS B-readers.
--
-- THE BRIDGE (the crux). The directory catalog skeleton now lives in the FROZEN
-- TS registry `directory-field-catalog-registry.ts`, which assigns each facet a
-- SYNTHETIC `field_definitions.id` (e.g. body_type = 9d1a3d6f-…-00000000000d).
-- That synthetic id is what the TS passes as `p_field_definition_id` to the
-- count RPCs, and as `(bf|tf->>'id')::uuid` in the boolean/text cross-filters.
-- It is NEITHER a real A def-id NOR a B def-id — it never existed in any value
-- store. So the rewritten RPCs resolve:
--     synthetic A-id  →  A legacy field key  →  B field_key (OLD_TO_NEW_KEY)
--                     →  canonical `profile_field_definitions` row (id, options,
--                        directory_filter_config).
-- The synthetic-id → B-field_key map below is captured 1:1 from the TS registry
-- + the 17-key A↔B bridge (`legacy-mirror.ts` `OLD_TO_NEW_KEY`).
--
-- VOCAB PARITY (mirrors `read-source-directory-facets.ts` exactly):
--   * B `talent_profile_field_values.value` is jsonb; the scalar is `value #>> '{}'`.
--   * B stores a MIX of canonical option SLUGS ("athletic") and LABELS
--     ("Athletic") for select facets, so matching is by NORMALIZED equality:
--     lower + collapse runs of [-_/whitespace] to a single space + trim (the
--     same `normalizeFacetValue` the TS reader + parity harness use).
--   * The facet OPTION the user filters by + the count buckets are the SLUG
--     vocab from B `directory_filter_config.filter_options` (T3.1) — same as the
--     TS `opt.id`. For each slug the candidate B-match set is
--         { norm(slug) }  ∪  { norm(matchLabelOption(b_options_labels, slug)) }
--     (the TS `directoryFacetSlugToBMatchSet`), where the B label list is the
--     canonical def's `options`. A stored B value counts toward a slug iff its
--     normalized form is in that slug's candidate set.
--   * Booleans (travel.willing) read B's jsonb scalar via the same token set the
--     TS `jsonScalarToBool` accepts (true/1/yes/t, false/0/no/f, plus json bool).
--
-- ONLY the value-store legs move. The name/location/taxonomy legs of the search
-- RPC and the height/gender/taxonomy/location legs of the facet RPCs never
-- touched the dropped tables and are preserved byte-for-byte. SECURITY / VOLATILITY
-- / signatures are all preserved so the TS callers + grants stay unchanged.
-- ============================================================================

BEGIN;

-- ── Bridge helpers (pure, IMMUTABLE) ─────────────────────────────────────────

-- normalizeFacetValue() parity: lower + collapse [-_/ whitespace]+ → " " + trim.
CREATE OR REPLACE FUNCTION public.directory_facet_normalize_value(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT btrim(regexp_replace(lower(btrim(coalesce(p_raw, ''))), '[-_/[:space:]]+', ' ', 'g'));
$function$;

-- slugify() parity (coerce-select-value.ts): lower, non-alphanumerics → "_",
-- strip leading/trailing "_". Used to replicate matchLabelOption's slug compare.
CREATE OR REPLACE FUNCTION public.directory_facet_slugify(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_raw, ''))), '[^a-z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g'
    ),
    '_'
  );
$function$;

-- Map the SYNTHETIC frozen registry `field_definitions.id` (passed by the TS
-- callers as `p_field_definition_id` / cross-filter `id`) → the canonical
-- System B `profile_field_definitions.id`, resolving via the registry's
-- legacy field key → B field_key (the 17-key A↔B bridge). Returns NULL for any
-- id without a bridged, non-deprecated B definition (the caller then skips that
-- facet — a no-op narrowing, matching the TS B-reader's "unbridged key → skip").
CREATE OR REPLACE FUNCTION public.directory_facet_b_def_id_for_legacy_id(p_legacy_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT pfd.id
  FROM (
    VALUES
      ('9d1a3d6f-0000-4000-a000-000000000003'::uuid, 'identity.dob'),
      ('9d1a3d6f-0000-4000-a000-000000000008'::uuid, 'physical.height_cm'),
      ('9d1a3d6f-0000-4000-a000-000000000009'::uuid, 'physical.eye_color'),
      ('9d1a3d6f-0000-4000-a000-00000000000b'::uuid, 'physical.hair_color'),
      ('9d1a3d6f-0000-4000-a000-00000000000c'::uuid, 'physical.hair_length'),
      ('9d1a3d6f-0000-4000-a000-00000000000d'::uuid, 'physical.body_type'),
      ('9d1a3d6f-0000-4000-a000-00000000000e'::uuid, 'physical.dress_size'),
      ('9d1a3d6f-0000-4000-a000-00000000000f'::uuid, 'physical.shoe_size_eu'),
      ('9d1a3d6f-0000-4000-a000-000000000010'::uuid, 'experience.level'),
      ('9d1a3d6f-0000-4000-a000-000000000011'::uuid, 'experience.years_total'),
      ('9d1a3d6f-0000-4000-a000-000000000012'::uuid, 'experience.notable_work'),
      ('9d1a3d6f-0000-4000-a000-000000000014'::uuid, 'experience.professional_highlights'),
      ('9d1a3d6f-0000-4000-a000-000000000015'::uuid, 'availability.status'),
      ('9d1a3d6f-0000-4000-a000-000000000016'::uuid, 'travel.willing'),
      ('9d1a3d6f-0000-4000-a000-000000000017'::uuid, 'travel.scope'),
      ('9d1a3d6f-0000-4000-a000-000000000018'::uuid, 'availability.available_for'),
      ('9d1a3d6f-0000-4000-a000-00000000001d'::uuid, 'media.website_url')
  ) AS bridge(legacy_id, b_field_key)
  JOIN public.profile_field_definitions pfd
    ON pfd.field_key = bridge.b_field_key
   AND pfd.deprecated_at IS NULL
  WHERE bridge.legacy_id = p_legacy_id
  LIMIT 1;
$function$;

-- ── 1. directory_search_public_talent_ids — value leg now reads System B ──────
-- The name/location/taxonomy legs are byte-identical to the dropped-table
-- version; ONLY the final UNION value leg is rewritten. It ILIKEs B's jsonb
-- scalar across the canonical B defs for the searchable bridged keys + the three
-- canonical social handle fields (creator.instagram_handle / tiktok_handle /
-- youtube_channel) — exactly the set `read-source-directory-search.ts` reads.
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

    -- VALUE leg — System B (`talent_profile_field_values`). Mirrors
    -- `read-source-directory-search.ts`: ILIKE B's jsonb scalar (`value #>> '{}'`)
    -- across the canonical B defs for the searchable BRIDGED keys (resolved via
    -- the A→B key bridge) PLUS the three canonical SOCIAL handle fields. The set
    -- of B field_keys below is the searchable-A-key set mapped to B:
    --   bridged: physical.body_type, physical.dress_size, physical.eye_color,
    --     physical.hair_color, physical.hair_length, physical.shoe_size_eu,
    --     experience.level, experience.notable_work,
    --     experience.professional_highlights, availability.status,
    --     availability.available_for, travel.scope, media.website_url
    --   social : creator.instagram_handle, creator.tiktok_handle,
    --     creator.youtube_channel
    -- (display_name / short_bio carry no value rows and are already searched on
    -- the talent_profiles columns above — correctly omitted.)
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
  ) x;
END;
$function$;

-- ── 2. directory_facet_scalar_base_ids — base set for boolean/text/gender
--       facets, with the boolean + text CROSS-FILTER legs repointed to System B.
--       The location/height/taxonomy/gender legs never touched the dropped
--       tables and are preserved byte-for-byte. The two cross-filter legs now
--       resolve each incoming SYNTHETIC filter id → its canonical B def and
--       match B's jsonb scalar with the same vocab/normalization the TS facet
--       value-store reader uses.
CREATE OR REPLACE FUNCTION public.directory_facet_scalar_base_ids(
  p_location_city_slug text, p_height_min integer, p_height_max integer,
  p_selected_taxonomy_ids uuid[], p_search text, p_gender_filter text[],
  p_boolean_filters jsonb, p_text_filters jsonb
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
    WHERE tt.kind::text NOT IN ('location_city', 'location_country')
  ),
  base_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND public.talent_is_site_visible_anywhere(tp.id)
      AND (
        p_location_city_slug IS NULL
        OR trim(p_location_city_slug) = ''
        OR EXISTS (
          SELECT 1
          FROM public.locations l
          WHERE l.archived_at IS NULL
            AND l.city_slug = trim(p_location_city_slug)
            AND (tp.residence_city_id = l.id OR tp.location_id = l.id)
        )
      )
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.display_name ILIKE '%' || trim(p_search) || '%'
        OR tp.first_name ILIKE '%' || trim(p_search) || '%'
        OR tp.last_name ILIKE '%' || trim(p_search) || '%'
        OR tp.short_bio ILIKE '%' || trim(p_search) || '%'
        OR tp.profile_code ILIKE '%' || trim(p_search) || '%'
      )
  ),
  other_kinds AS (
    SELECT sk.kind, array_agg(sk.id) AS term_ids
    FROM sel sk
    GROUP BY sk.kind
  ),
  constrained AS (
    SELECT b.id
    FROM base_tp b
    WHERE NOT EXISTS (
      SELECT 1
      FROM other_kinds ok
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = b.id
          AND tpt.taxonomy_term_id = ANY (ok.term_ids)
      )
    )
  ),
  gender_filtered AS (
    SELECT c.id
    FROM constrained c
    JOIN public.talent_profiles tp ON tp.id = c.id
    WHERE (
      p_gender_filter IS NULL
      OR coalesce(array_length(p_gender_filter, 1), 0) = 0
      OR (tp.gender IS NOT NULL AND (tp.gender)::text = ANY (p_gender_filter))
    )
  ),
  -- BOOLEAN cross-filter (System B). For every boolean facet selection, the
  -- talent must have a B value (resolved synthetic-id → B def) whose jsonb scalar
  -- coerces (jsonScalarToBool token set) to one of the requested booleans.
  bool_filtered AS (
    SELECT gf.id
    FROM gender_filtered gf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_boolean_filters, '[]'::jsonb)) bf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_field_values bv
        WHERE bv.talent_profile_id = gf.id
          AND bv.field_definition_id =
              public.directory_facet_b_def_id_for_legacy_id((bf->>'id')::uuid)
          AND (
            CASE lower(btrim(bv.value #>> '{}'))
              WHEN 'true' THEN true WHEN '1' THEN true WHEN 'yes' THEN true WHEN 't' THEN true
              WHEN 'false' THEN false WHEN '0' THEN false WHEN 'no' THEN false WHEN 'f' THEN false
              ELSE NULL
            END
          ) IN (
            SELECT (elem)::boolean
            FROM jsonb_array_elements_text(bf->'v') AS elem
          )
      )
    )
  ),
  -- TEXT cross-filter (System B). For every text facet selection, the talent must
  -- have a B value (resolved synthetic-id → B def) whose NORMALIZED jsonb scalar
  -- is in the normalized candidate set of one of the requested slugs. The
  -- candidate set per slug = { norm(slug) } ∪ { norm(label) for each B option
  -- label matchLabelOption-equivalent to the slug } — mirrors the TS
  -- `directoryFacetSlugToBMatchSet`.
  text_filtered AS (
    SELECT bf.id
    FROM bool_filtered bf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_text_filters, '[]'::jsonb)) tf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_field_values bv
        JOIN public.profile_field_definitions pfd
          ON pfd.id = bv.field_definition_id
        WHERE bv.talent_profile_id = bf.id
          AND bv.field_definition_id =
              public.directory_facet_b_def_id_for_legacy_id((tf->>'id')::uuid)
          AND public.directory_facet_normalize_value(bv.value #>> '{}') IN (
            -- candidate normalized set across all requested slugs
            SELECT public.directory_facet_normalize_value(slug.val)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            UNION
            SELECT public.directory_facet_normalize_value(lbl.label)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(pfd.options) = 'array' THEN pfd.options ELSE '[]'::jsonb END
            ) AS lbl(label)
            WHERE
              -- matchLabelOption(slug, label): exact/ci/slug equality
              lower(btrim(lbl.label)) = lower(btrim(slug.val))
              OR public.directory_facet_slugify(lbl.label) = public.directory_facet_slugify(slug.val)
          )
      )
    )
  )
  SELECT id FROM text_filtered;
$function$;

-- ── 3. directory_facet_boolean_field_value_counts — counts per boolean value,
--       reading System B. Resolves the synthetic `p_field_definition_id` → B def,
--       coerces B's jsonb scalar to a boolean (same token set as the cross-filter
--       + the TS jsonScalarToBool), groups by it. Returns (value_bool, count).
CREATE OR REPLACE FUNCTION public.directory_facet_boolean_field_value_counts(
  p_field_definition_id uuid, p_location_city_slug text, p_height_min integer,
  p_height_max integer, p_selected_taxonomy_ids uuid[], p_search text,
  p_gender_filter text[], p_boolean_filters jsonb, p_text_filters jsonb
)
RETURNS TABLE(value_bool boolean, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT vb.value_bool, count(DISTINCT sid)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_location_city_slug,
    p_height_min,
    p_height_max,
    p_selected_taxonomy_ids,
    p_search,
    p_gender_filter,
    p_boolean_filters,
    p_text_filters
  ) sid
  JOIN public.talent_profile_field_values bv
    ON bv.talent_profile_id = sid
   AND bv.field_definition_id =
       public.directory_facet_b_def_id_for_legacy_id(p_field_definition_id)
  CROSS JOIN LATERAL (
    SELECT (
      CASE lower(btrim(bv.value #>> '{}'))
        WHEN 'true' THEN true WHEN '1' THEN true WHEN 'yes' THEN true WHEN 't' THEN true
        WHEN 'false' THEN false WHEN '0' THEN false WHEN 'no' THEN false WHEN 'f' THEN false
        ELSE NULL
      END
    ) AS value_bool
  ) vb
  WHERE vb.value_bool IS NOT NULL
  GROUP BY vb.value_bool;
$function$;

-- ── 4. directory_facet_text_field_value_counts — counts per option SLUG,
--       reading System B. Resolves the synthetic `p_field_definition_id` → B def,
--       then for each canonical SLUG (from B `directory_filter_config.filter_
--       options`, falling back to the def `options` slugified) buckets the
--       matching B values by NORMALIZED candidate-set equality (the inverse of
--       the TS `directoryFacetSlugToBMatchSet`) and counts distinct talents.
--       Returns (value_text = canonical slug, count) so the TS `by.get(opt.id)`
--       (opt.id = slug) matches.
CREATE OR REPLACE FUNCTION public.directory_facet_text_field_value_counts(
  p_field_definition_id uuid, p_location_city_slug text, p_height_min integer,
  p_height_max integer, p_selected_taxonomy_ids uuid[], p_search text,
  p_gender_filter text[], p_boolean_filters jsonb, p_text_filters jsonb
)
RETURNS TABLE(value_text text, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bdef AS (
    SELECT pfd.id,
           pfd.options,
           pfd.directory_filter_config
    FROM public.profile_field_definitions pfd
    WHERE pfd.id = public.directory_facet_b_def_id_for_legacy_id(p_field_definition_id)
    LIMIT 1
  ),
  -- Canonical SLUG vocab for this facet: prefer B filter_options (T3.1 slugs),
  -- else slugify the def's option labels. One row per slug.
  slugs AS (
    SELECT DISTINCT s.slug
    FROM bdef,
    LATERAL (
      SELECT btrim(fo.val) AS slug
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(bdef.directory_filter_config->'filter_options') = 'array'
             THEN bdef.directory_filter_config->'filter_options' ELSE '[]'::jsonb END
      ) AS fo(val)
      WHERE btrim(fo.val) <> ''
      UNION ALL
      SELECT public.directory_facet_slugify(o.label) AS slug
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(bdef.options) = 'array' THEN bdef.options ELSE '[]'::jsonb END
      ) AS o(label)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(bdef.directory_filter_config->'filter_options') = 'array'
               THEN bdef.directory_filter_config->'filter_options' ELSE '[]'::jsonb END
        ) AS fo2(val)
        WHERE btrim(fo2.val) <> ''
      )
        AND public.directory_facet_slugify(o.label) <> ''
    ) s
  ),
  -- The normalized candidate B-match set per slug (TS directoryFacetSlugToBMatchSet).
  slug_match AS (
    SELECT slugs.slug, public.directory_facet_normalize_value(slugs.slug) AS norm_val
    FROM slugs
    UNION
    SELECT slugs.slug, public.directory_facet_normalize_value(lbl.label) AS norm_val
    FROM slugs
    CROSS JOIN bdef
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(bdef.options) = 'array' THEN bdef.options ELSE '[]'::jsonb END
    ) AS lbl(label)
    WHERE lower(btrim(lbl.label)) = lower(btrim(slugs.slug))
       OR public.directory_facet_slugify(lbl.label) = public.directory_facet_slugify(slugs.slug)
  ),
  base AS (
    SELECT sid
    FROM public.directory_facet_scalar_base_ids(
      p_location_city_slug,
      p_height_min,
      p_height_max,
      p_selected_taxonomy_ids,
      p_search,
      p_gender_filter,
      p_boolean_filters,
      p_text_filters
    ) sid
  ),
  -- Each (talent, normalized B value) over the base set for this facet's B def.
  vals AS (
    SELECT base.sid,
           public.directory_facet_normalize_value(bv.value #>> '{}') AS norm_val
    FROM base
    JOIN public.talent_profile_field_values bv
      ON bv.talent_profile_id = base.sid
     AND bv.field_definition_id = (SELECT id FROM bdef)
    WHERE coalesce(btrim(bv.value #>> '{}'), '') <> ''
  )
  SELECT sm.slug AS value_text, count(DISTINCT vals.sid)::bigint AS profile_count
  FROM slug_match sm
  JOIN vals ON vals.norm_val = sm.norm_val
  GROUP BY sm.slug;
$function$;

COMMIT;
