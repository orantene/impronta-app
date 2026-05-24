-- Mature 2026 taxonomy polish.
--
-- The engine hierarchy is valid, but a few category_group rows had the same
-- English label as their leaf talent_type row. That made Platform Admin and
-- Tenant Admin screens look duplicated even though the rows represent
-- different hierarchy levels.
--
-- Soft-only cleanup: rename the group labels, preserve the leaf types,
-- preserve aliases/search synonyms, and do not touch profile assignments,
-- field mappings, media, or stored profile values.

BEGIN;

UPDATE public.taxonomy_terms
SET
  name_en = 'Commercial model types',
  name_es = COALESCE(name_es, 'Tipos de modelo comercial'),
  plural_name = 'Commercial model types',
  aliases = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY['Commercial Model', 'Commercial Models']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  search_synonyms = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(search_synonyms, '{}'::text[]) || ARRAY['commercial model', 'commercial models']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  updated_at = now()
WHERE slug = 'commercial-models'
  AND term_type = 'category_group';

UPDATE public.taxonomy_terms
SET
  name_en = 'Creator types',
  name_es = COALESCE(name_es, 'Tipos de creador'),
  plural_name = 'Creator types',
  aliases = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY['Content Creator', 'Content Creators']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  search_synonyms = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(search_synonyms, '{}'::text[]) || ARRAY['content creator', 'content creators', 'creator']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  updated_at = now()
WHERE slug = 'content-creators'
  AND term_type = 'category_group';

UPDATE public.taxonomy_terms
SET
  name_en = 'Musician types',
  name_es = COALESCE(name_es, 'Tipos de músico'),
  plural_name = 'Musician types',
  aliases = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY['Musician', 'Musicians']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  search_synonyms = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(search_synonyms, '{}'::text[]) || ARRAY['musician', 'musicians']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  updated_at = now()
WHERE slug = 'musicians'
  AND term_type = 'category_group';

UPDATE public.taxonomy_terms
SET
  name_en = 'Promo model types',
  name_es = COALESCE(name_es, 'Tipos de modelo promocional'),
  plural_name = 'Promo model types',
  aliases = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(aliases, '{}'::text[]) || ARRAY['Promotional Model', 'Promotional Models', 'Promo Model']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  search_synonyms = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(COALESCE(search_synonyms, '{}'::text[]) || ARRAY['promotional model', 'promotional models', 'promo model']) AS value
      WHERE btrim(value) <> ''
      ORDER BY value
    )
  ),
  updated_at = now()
WHERE slug = 'promotional-models'
  AND term_type = 'category_group';

COMMIT;
