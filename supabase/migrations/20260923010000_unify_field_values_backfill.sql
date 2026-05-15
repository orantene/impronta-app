-- ============================================================================
-- Unify field-value systems: backfill OLD `field_values` → NEW
-- `talent_profile_field_values`. The NEW system is the single source of
-- truth going forward; the OLD tables are dropped in the next migration
-- once readers (public profile, Discover cards, Discover filters) have
-- been re-pointed.
--
-- KEY BRIDGE — old `field_definitions.key` ⇄ new `profile_field_definitions.field_key`
-- Only includes keys with a clean 1:1 mapping. Non-mappable old keys
-- (availability_status, fit_labels, generic *_id columns, names that live
-- on talent_profiles, etc.) are intentionally dropped — pre-launch, lean
-- foundation, no value worth carrying that doesn't fit the new schema.
-- ============================================================================

-- 1. Direct value-shape mappings (text/number/boolean/date → jsonb).
WITH bridge(old_key, new_key) AS (
  VALUES
    ('body_type',         'physical.body_type'),
    ('clothing_size',     'physical.dress_size'),
    ('date_of_birth',     'identity.dob'),
    ('eye_color',         'physical.eye_color'),
    ('hair_color',        'physical.hair_color'),
    ('hair_length',       'physical.hair_length'),
    ('height_cm',         'physical.height_cm'),
    ('shoe_size',         'physical.shoe_size_eu'),
    ('years_experience',  'experience.years_total')
),
candidates AS (
  SELECT
    fv.talent_profile_id,
    pfd.id AS new_field_definition_id,
    -- Tenant is derived from the active roster row. Skip values whose
    -- talent isn't on any roster (orphans get dropped, which is fine
    -- pre-launch).
    (SELECT atr.tenant_id FROM public.agency_talent_roster atr
       WHERE atr.talent_profile_id = fv.talent_profile_id
         AND atr.status = 'active'
       LIMIT 1) AS tenant_id,
    CASE fd.value_type
      WHEN 'text'     THEN to_jsonb(fv.value_text)
      WHEN 'textarea' THEN to_jsonb(fv.value_text)
      WHEN 'number'   THEN to_jsonb(fv.value_number)
      WHEN 'boolean'  THEN to_jsonb(fv.value_boolean)
      WHEN 'date'     THEN to_jsonb(fv.value_date::text)
    END AS value
  FROM public.field_values fv
  JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
  JOIN bridge b ON b.old_key = fd.key
  JOIN public.profile_field_definitions pfd ON pfd.field_key = b.new_key
  WHERE
    (fd.value_type IN ('text','textarea') AND fv.value_text IS NOT NULL AND trim(fv.value_text) <> '')
    OR (fd.value_type = 'number'  AND fv.value_number IS NOT NULL)
    OR (fd.value_type = 'boolean' AND fv.value_boolean IS NOT NULL)
    OR (fd.value_type = 'date'    AND fv.value_date IS NOT NULL)
)
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT
  talent_profile_id, new_field_definition_id, tenant_id, value, 'live', 'platform'
FROM candidates
WHERE value IS NOT NULL AND tenant_id IS NOT NULL
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;

-- 2. Social URL → handle coercion.
--    `https://instagram.com/marta_reyes/` → `@marta_reyes`
--    Any URL ending in a path segment becomes `@<segment>`.
INSERT INTO public.talent_profile_field_values
  (talent_profile_id, field_definition_id, tenant_id, value, workflow_state, last_edited_role)
SELECT
  fv.talent_profile_id,
  pfd.id,
  (SELECT atr.tenant_id FROM public.agency_talent_roster atr
     WHERE atr.talent_profile_id = fv.talent_profile_id
       AND atr.status = 'active'
     LIMIT 1) AS tenant_id,
  to_jsonb(
    CASE
      WHEN fv.value_text ~ '^@' THEN fv.value_text
      ELSE '@' || regexp_replace(
        regexp_replace(fv.value_text, '/+$', ''),
        '^.*/([^/?#]+).*$',
        '\1'
      )
    END
  ),
  'live',
  'platform'
FROM public.field_values fv
JOIN public.field_definitions fd ON fd.id = fv.field_definition_id
JOIN public.profile_field_definitions pfd ON pfd.field_key = (
  CASE fd.key
    WHEN 'instagram_url' THEN 'creator.instagram_handle'
    WHEN 'tiktok_url'    THEN 'creator.tiktok_handle'
    WHEN 'youtube_url'   THEN 'creator.youtube_channel'
  END
)
WHERE fd.key IN ('instagram_url', 'tiktok_url', 'youtube_url')
  AND fv.value_text IS NOT NULL
  AND trim(fv.value_text) <> ''
  AND EXISTS (SELECT 1 FROM public.agency_talent_roster atr
              WHERE atr.talent_profile_id = fv.talent_profile_id AND atr.status = 'active')
ON CONFLICT (talent_profile_id, field_definition_id) DO NOTHING;
