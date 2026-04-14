-- Fit labels used by deterministic interpret synonyms (aliases matched in `interpret-taxonomy-synonyms`).
-- Base seed taxonomy has no “woman/blond” in names/slugs; without these, queries like "woman" or "blond from ibiza" yield zero taxonomy IDs.
INSERT INTO public.taxonomy_terms (kind, slug, name_en, name_es, aliases, sort_order)
VALUES
  (
    'fit_label',
    'presenting-female',
    'Female presenting',
    'Presentación femenina',
    ARRAY['woman', 'women', 'female', 'girl', 'girls', 'mujer', 'mujeres', 'chica', 'chicas']::text[],
    5
  ),
  (
    'fit_label',
    'presenting-male',
    'Male presenting',
    'Presentación masculina',
    ARRAY['man', 'men', 'male', 'guy', 'guys', 'hombre', 'hombres', 'chico', 'chicos']::text[],
    6
  ),
  (
    'fit_label',
    'hair-blonde',
    'Blonde hair',
    'Cabello rubio',
    ARRAY['blonde', 'blond', 'rubio', 'rubia']::text[],
    15
  )
ON CONFLICT (kind, slug) DO NOTHING;
