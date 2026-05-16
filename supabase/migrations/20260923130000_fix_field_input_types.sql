-- ============================================================================
-- 20260923130000_fix_field_input_types.sql
--
-- UX fix from screenshots: several casting fields were free-TEXT when
-- they're obvious enums (Eye color, Hair color, Hair length, Skin
-- tone), and several SELECT fields had NO options ("No options
-- configured" — a broken control). Give them proper dropdown options
-- and the right kind so the editor renders usable pickers.
-- Idempotent: only rewrites the specific keys.
-- ============================================================================

-- 1. text -> select for the obvious physical enums
UPDATE profile_field_definitions SET kind='select',
  options='["Brown","Blue","Green","Hazel","Grey","Amber","Black","Other"]'::jsonb,
  updated_at=now()
WHERE field_key='physical.eye_color' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["Black","Dark brown","Brown","Light brown","Blonde","Red","Auburn","Grey","White","Other"]'::jsonb,
  updated_at=now()
WHERE field_key='physical.hair_color' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["Shaved","Short","Medium","Long","Extra long"]'::jsonb,
  updated_at=now()
WHERE field_key='physical.hair_length' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["Fair","Light","Medium","Olive","Tan","Brown","Dark","Deep"]'::jsonb,
  updated_at=now()
WHERE field_key='physical.skin_tone' AND deprecated_at IS NULL;

-- 2. populate options for SELECT fields that had none ("No options configured")
UPDATE profile_field_definitions SET
  options='["Full buyout","Limited usage","Social only","Editorial only","Negotiable"]'::jsonb,
  updated_at=now()
WHERE field_key='model.content_rights_available' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["Included","Add-on fee","Client handles","Negotiable"]'::jsonb, updated_at=now()
WHERE field_key='chef.cleanup_policy' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["Yes","No","Add-on"]'::jsonb, updated_at=now()
WHERE field_key='chef.cleanup_included' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["Solo","Duo","Group","Either"]'::jsonb, updated_at=now()
WHERE field_key='performer.solo_or_group' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["Solo","With band","With track","A cappella","DJ set"]'::jsonb, updated_at=now()
WHERE field_key='singer.performance_format' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["None","Standard","Commercial (CDL)","Chauffeur / hackney","International"]'::jsonb, updated_at=now()
WHERE field_key='transport.commercial_license_type' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["None","1–2 bags","3–4 bags","5+ bags","Van / large"]'::jsonb, updated_at=now()
WHERE field_key='transport.luggage_capacity' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET
  options='["Flat fee","Percentage","Tiered","Negotiable"]'::jsonb, updated_at=now()
WHERE field_key='travel.commission_model' AND deprecated_at IS NULL;
