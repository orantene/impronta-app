-- ============================================================================
-- 20260923140000_physical_field_input_types.sql
--
-- UX pass (user direction): no free text where a picker/number is the
-- right control. The Physical / Casting block is the worst offender —
-- height, bust, waist, hips, inseam, weight, dress/suit/shoe sizes were
-- all free TEXT. Make measurements numeric (with unit suffix) and sizes
-- proper dropdowns. Descriptive/personal fields (identifying marks,
-- tattoo location notes) deliberately stay free text.
-- Idempotent (keyed updates).
-- ============================================================================

-- Numeric measurements -> number kind + unit suffix
UPDATE profile_field_definitions SET kind='number', unit='cm', updated_at=now()
WHERE field_key IN ('physical.height_cm','physical.bust_cm','physical.waist_cm',
                    'physical.hips_cm','physical.inseam_cm') AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='number', unit='kg', updated_at=now()
WHERE field_key='physical.weight_kg' AND deprecated_at IS NULL;

-- Sizes -> select pickers
UPDATE profile_field_definitions SET kind='select',
  options='["XXS","XS","S","M","L","XL","XXL"]'::jsonb, updated_at=now()
WHERE field_key='physical.dress_size' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["34","36","38","40","42","44","46","48","50"]'::jsonb, updated_at=now()
WHERE field_key='physical.suit_size' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["35","36","37","38","39","40","41","42","43","44","45","46","47","48"]'::jsonb, updated_at=now()
WHERE field_key='physical.shoe_size_eu' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["3","4","5","6","7","8","9","10","11","12","13"]'::jsonb, updated_at=now()
WHERE field_key='physical.shoe_size_uk' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["5","6","7","8","9","10","11","12","13","14","15"]'::jsonb, updated_at=now()
WHERE field_key='physical.shoe_size_us' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["Under 5 ft","5 ft 0–5 ft 3","5 ft 4–5 ft 7","5 ft 8–5 ft 11","6 ft 0–6 ft 3","6 ft 4+"]'::jsonb,
  updated_at=now()
WHERE field_key='physical.height_imperial' AND deprecated_at IS NULL;

-- Coverage enums -> select (were free text)
UPDATE profile_field_definitions SET kind='select',
  options='["None","Few / small","Visible","Extensive"]'::jsonb, updated_at=now()
WHERE field_key='physical.tattoos' AND deprecated_at IS NULL;

UPDATE profile_field_definitions SET kind='select',
  options='["None","Ears only","Visible","Multiple"]'::jsonb, updated_at=now()
WHERE field_key='physical.piercings' AND deprecated_at IS NULL;
