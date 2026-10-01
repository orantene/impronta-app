-- Maison v2 hero copy per language: the website headline and the tagline written in
-- each language the talent's site supports.
--
-- The plain fields (`identity.headline`, `identity.tagline`) keep the primary-language
-- text, the convention of every other `_i18n` pair. These two definitions hold the
-- per-language map as a field value, `{ "es": "...", "en": "..." }`, so a visitor on the
-- Spanish page reads the Spanish line and one on the English page the English line, and a
-- missing language falls back to the primary one.
--
-- Additive and idempotent: two definition rows, ON CONFLICT DO NOTHING. No column, no
-- data touched; a talent who never fills a language behaves exactly as before.

INSERT INTO public.profile_field_definitions (
  field_key, tier, section, kind,
  is_optional, is_sensitive, default_visibility,
  show_in_registration, show_in_edit_drawer, show_in_public, show_in_directory,
  admin_only, talent_editable, requires_review_on_change,
  is_searchable, display_order,
  label_i18n, helper_i18n, placeholder_i18n
) VALUES
(
  'identity.headline_i18n', 'global', 'identity', 'text',
  TRUE, FALSE, ARRAY['public', 'agency']::TEXT[],
  FALSE, FALSE, FALSE, FALSE,
  FALSE, TRUE, FALSE,
  FALSE, 106,
  '{"en": "Website headline by language", "es": "Titular del sitio por idioma"}'::jsonb,
  '{"en": "The headline written for each language. The plain headline is your main language.", "es": "El titular escrito para cada idioma. El titular simple es tu idioma principal."}'::jsonb,
  '{}'::jsonb
),
(
  'identity.tagline_i18n', 'global', 'identity', 'text',
  TRUE, FALSE, ARRAY['public', 'agency']::TEXT[],
  FALSE, FALSE, FALSE, FALSE,
  FALSE, TRUE, FALSE,
  FALSE, 101,
  '{"en": "Tagline by language", "es": "Lema por idioma"}'::jsonb,
  '{"en": "The tagline written for each language. The plain tagline is your main language.", "es": "El lema escrito para cada idioma. El lema simple es tu idioma principal."}'::jsonb,
  '{}'::jsonb
)
ON CONFLICT (field_key) DO NOTHING;
