-- TUL-516 C7: latin-dancer Spanish label is gender-neutral (was masculine Bailarín Latino).
-- Valeria and every latin-dancer profile read name_es / name_i18n.es for the public trade line.
UPDATE public.taxonomy_terms
SET
  name_es = 'Baile latino',
  name_i18n = COALESCE(name_i18n, '{}'::jsonb) || jsonb_build_object('es', 'Baile latino', 'en', COALESCE(name_i18n->>'en', name_en, 'Latin Dancer'))
WHERE slug = 'latin-dancer'
  AND kind = 'talent_type';
