-- Taxonomy v2 — search index: synonyms + ai_keywords + descendants RPC.
--
-- Cross-discovery uses search_synonyms (string-match search) and ai_keywords
-- (embedding-only signals). High-traffic terms get curated synonyms — we do
-- not blanket-stuff every term.
--
-- Also adds public.descendants_of(term_id) for recursive parent->descendants
-- filtering used by the directory.

BEGIN;

-- ─── Curated synonyms / ai_keywords for high-traffic terms ────────────────
-- Fire Dancer → fire performer, flame dancer, fire show
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['fire performer','flame dancer','fire show','fire act','fire spinner']::TEXT[],
       ai_keywords     = ARRAY['fire performance','poi spinning','flame artistry','specialty performer']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'fire-dancer';

-- Fire Performer (sibling) cross-references Fire Dancer
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['fire dancer','flame performer','fire show','fire act']::TEXT[],
       ai_keywords     = ARRAY['fire performance','specialty performer','flame artistry']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'fire-performer';

-- Bartender (canonical: Beverage Talent). Add cross-discovery for Event
-- Staff search.
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['mixologist','bar tender','cocktail server']::TEXT[],
       ai_keywords     = ARRAY['cocktails','bar service','beverages','spirits','mixology']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'bartender';

-- Bar Staff (category_group): expose synonyms so a search from Event Staff
-- side still finds Bartender.
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['bartender','barback','beverage server']::TEXT[]
 WHERE term_type = 'category_group' AND slug = 'bar-staff';

-- Travel Agent → travel advisor, trip planner
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['travel advisor','trip planner','itinerary planner','luxury travel']::TEXT[],
       ai_keywords     = ARRAY['vacation planning','luxury travel','itineraries','destinations']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'travel-agent';

-- Housekeeper / Villa Cleaner cross-pollination
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['villa cleaner','house cleaner','maid','domestic help']::TEXT[],
       ai_keywords     = ARRAY['housekeeping','villa cleaning','domestic service']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'housekeeper';

UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['housekeeper','villa cleaning','airbnb cleaning']::TEXT[],
       ai_keywords     = ARRAY['villa cleaning','property cleaning','vacation rental cleaning']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'villa-cleaner';

-- Promotional Model
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['promo model','event model','brand model']::TEXT[],
       ai_keywords     = ARRAY['brand activations','product launches','trade shows','sales']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'promotional-model';

-- Singer (generic + Pop Singer)
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['vocalist','vocal talent']::TEXT[],
       ai_keywords     = ARRAY['live music','vocals','performance']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'singer';

UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['singer','vocalist','pop vocalist']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'pop-singer';

-- Belly Dancer (specialty under Cultural Dancer)
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['oriental dancer','raqs sharqi','belly dance']::TEXT[],
       ai_keywords     = ARRAY['cultural performance','oriental dance']::TEXT[]
 WHERE term_type = 'specialty' AND slug = 'belly-dancer';

-- Drivers / VIP Driver
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['chauffeur','transportation','car service']::TEXT[],
       ai_keywords     = ARRAY['ground transportation','airport transfers','vip transport']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'private-driver';

UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['vip chauffeur','luxury driver']::TEXT[],
       ai_keywords     = ARRAY['vip transport','luxury chauffeur']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'vip-driver';

-- DJ (parent_category Music) — make sure it surfaces from event/nightlife search
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['disc jockey','party dj','event dj']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'dj';

-- Hostess (generic)
UPDATE public.taxonomy_terms
   SET search_synonyms = ARRAY['anfitriona','host','greeter']::TEXT[]
 WHERE term_type = 'talent_type' AND slug = 'hostess';

-- ─── Recursive descendants helper RPC ─────────────────────────────────────
-- Returns the set of taxonomy_term IDs that are descendants of the given
-- term, including the term itself. Walks parent_id transitively.
-- Used by directory filters: pass the selected parent_category id and
-- filter talent_profile_taxonomy.taxonomy_term_id IN (descendants_of(...)).
CREATE OR REPLACE FUNCTION public.descendants_of(p_term_id UUID)
RETURNS TABLE (id UUID)
LANGUAGE SQL
STABLE
AS $$
  WITH RECURSIVE descendants(id) AS (
    SELECT id FROM public.taxonomy_terms WHERE id = p_term_id
    UNION ALL
    SELECT t.id
      FROM public.taxonomy_terms t
      JOIN descendants d ON t.parent_id = d.id
     WHERE t.archived_at IS NULL
  )
  SELECT id FROM descendants;
$$;

COMMENT ON FUNCTION public.descendants_of(UUID) IS
  'Recursive descendants of a taxonomy_term. Used by directory parent->children filtering: filter "Performers" returns Fire Dancer, Salsa, etc.';

COMMIT;
