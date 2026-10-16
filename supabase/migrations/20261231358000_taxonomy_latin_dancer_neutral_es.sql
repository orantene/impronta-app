-- Applied to prod 2026-10-14 (or earlier); file landed for ledger parity (no re-apply needed).
UPDATE public.taxonomy_terms
SET name_i18n = COALESCE(name_i18n, '{}'::jsonb) || jsonb_build_object('es', 'Baile latino')
WHERE slug = 'latin-dancer' AND kind = 'talent_type';
