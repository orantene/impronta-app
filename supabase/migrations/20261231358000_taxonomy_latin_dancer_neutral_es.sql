UPDATE public.taxonomy_terms
SET name_i18n = COALESCE(name_i18n, '{}'::jsonb) || jsonb_build_object('es', 'Baile latino')
WHERE slug = 'latin-dancer' AND kind = 'talent_type';
