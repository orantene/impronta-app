-- ============================================================================
-- Unify field-values: extend the bridge to capture the 8 OLD keys that the
-- first pass dropped because no NEW field_definition existed.
--
-- We add 8 new field defs (all global tier — every talent benefits from
-- having availability status, scope of work, website, etc.) and then
-- backfill old values into them. After this migration runs, every
-- meaningful old field_values row for an Impronta-rostered talent is
-- preserved in the new system.
-- ============================================================================

-- 1. Insert 8 new field definitions matching the unmapped old keys.
--    Idempotent via ON CONFLICT (field_key) DO NOTHING.
INSERT INTO public.profile_field_definitions
  (field_key, label, tier, section, kind, placeholder, options, is_optional,
   default_visibility, show_in_registration, show_in_edit_drawer,
   show_in_public, show_in_directory, admin_only, talent_editable,
   field_group_id, display_order)
VALUES
  ('experience.level', 'Experience level', 'global', 'skills', 'select', null,
   '["junior","mid_level","senior","highly_experienced"]'::jsonb, true,
   ARRAY['public','agency']::text[], true, true, true, true, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='experience'), 50),

  ('experience.notable_work', 'Notable work', 'global', 'skills', 'textarea',
   'Highlight projects, brands, recurring gigs…', null, true,
   ARRAY['public','agency']::text[], false, true, true, false, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='experience'), 60),

  ('experience.professional_highlights', 'Professional highlights', 'global', 'skills', 'textarea',
   'Strengths, signature moves, unique skills…', null, true,
   ARRAY['public','agency']::text[], false, true, true, false, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='experience'), 70),

  ('availability.status', 'Booking availability', 'global', 'type-specific', 'select', null,
   '["active","by_request","paused","not_available"]'::jsonb, true,
   ARRAY['public','agency']::text[], false, true, true, true, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='availability'), 10),

  ('availability.available_for', 'Available for', 'global', 'type-specific', 'textarea',
   'What kinds of work / events you take on…', null, true,
   ARRAY['public','agency']::text[], false, true, true, false, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='availability'), 20),

  ('travel.willing', 'Willing to travel', 'global', 'travel', 'toggle', null, null, true,
   ARRAY['public','agency']::text[], false, true, true, true, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='service-area-travel'), 80),

  ('travel.scope', 'Travel scope', 'global', 'travel', 'select', null,
   '["local","regional","national","international"]'::jsonb, true,
   ARRAY['public','agency']::text[], false, true, true, true, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='service-area-travel'), 90),

  ('media.website_url', 'Personal website', 'global', 'social', 'text',
   'https://your-site.com', null, true,
   ARRAY['public','agency']::text[], false, true, true, false, false, true,
   (SELECT id FROM public.profile_field_groups WHERE slug='media-portfolio'), 100)
ON CONFLICT (field_key) DO NOTHING;

-- 2. Backfill old values into the newly-added defs.
WITH bridge(old_key, new_key) AS (
  VALUES
    ('availability_status',     'availability.status'),
    ('available_for',           'availability.available_for'),
    ('experience_level',        'experience.level'),
    ('notable_work',            'experience.notable_work'),
    ('professional_highlights', 'experience.professional_highlights'),
    ('travel_scope',            'travel.scope'),
    ('website_url',             'media.website_url'),
    ('willing_to_travel',       'travel.willing')
),
candidates AS (
  SELECT
    fv.talent_profile_id,
    pfd.id AS new_field_definition_id,
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
