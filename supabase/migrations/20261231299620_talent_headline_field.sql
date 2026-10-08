-- Maison v2 release 2.7 (hero): the talent's own HEADLINE, a profile field.
--
-- The hero's big line ("Manos que hablan por ti.") is a short value proposition
-- the talent writes once in her profile and every design can show. It lives in
-- the field catalog like `identity.tagline` (System B, `talent_profile_field_values`),
-- so it needs no column: this migration only registers the definition.
--
-- Additive and idempotent: one new row, ON CONFLICT DO NOTHING. No data is
-- touched, no existing field changes, and a site whose talent never writes a
-- headline keeps working (the hero seeds a line from her trade, else shows her
-- name). `experience.years_total` and `identity.tagline` already exist.

INSERT INTO public.profile_field_definitions (
  field_key, tier, section, kind,
  is_optional, is_sensitive, default_visibility,
  show_in_registration, show_in_edit_drawer, show_in_public, show_in_directory,
  admin_only, talent_editable, requires_review_on_change,
  is_searchable, display_order,
  label_i18n, helper_i18n, placeholder_i18n
) VALUES (
  'identity.headline', 'global', 'identity', 'text',
  TRUE, FALSE, ARRAY['public', 'agency']::TEXT[],
  FALSE, TRUE, TRUE, FALSE,
  FALSE, TRUE, FALSE,
  FALSE, 105,
  '{"en": "Website headline", "es": "Titular del sitio"}'::jsonb,
  '{"en": "The big line at the top of your website. Short and about what clients get.", "es": "La frase grande al inicio de tu sitio. Corta y sobre lo que recibe tu clienta o cliente."}'::jsonb,
  '{"en": "e.g. Hands that speak for you.", "es": "p. ej. Manos que hablan por ti."}'::jsonb
)
ON CONFLICT (field_key) DO NOTHING;
