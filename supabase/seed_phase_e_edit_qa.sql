-- Phase E — Edit-mode QA seed
--
-- Creates a real CMS-backed audit composition for the impronta tenant so
-- the 7 Batch-3-halfway sections can be tested through the actual CMS path:
--   - data-cms-section / data-section-id wrappers are present
--   - SelectionLayer can select each section
--   - InspectorDock can load + save each section
--   - Save action writes to cms_sections
--
-- Route: impronta.tulala.digital/p/audit-batch3
-- noindex = TRUE. Not linked from nav.
--
-- IDEMPOTENT:
--   cms_sections  → ON CONFLICT (tenant_id, name) DO NOTHING
--   cms_pages     → ON CONFLICT (tenant_id, locale, slug) DO UPDATE snapshot
--   cms_page_sections → ON CONFLICT (page_id, slot_key, sort_order, is_draft) DO NOTHING
--
-- Run from Supabase dashboard SQL editor (service role bypasses RLS).
-- The \set syntax below is psql-only. For the dashboard, replace :VAR with
-- the literal UUID strings — see the comment block at the top of each section.
-- ---------------------------------------------------------------------------

BEGIN;

-- Fixed IDs (copy-paste into dashboard if not using psql)
--   TENANT  = '00000000-0000-0000-0000-000000000001'
--   PAGE_ID = 'b4e8f2a1-0000-0000-0000-000000000001'
--   SEC_TT  = 'b4e8f2a1-0000-0001-0000-000000000001'  testimonials_trio
--   SEC_MAG = 'b4e8f2a1-0000-0001-0000-000000000002'  magazine_layout
--   SEC_MAS = 'b4e8f2a1-0000-0001-0000-000000000003'  masonry
--   SEC_DM  = 'b4e8f2a1-0000-0001-0000-000000000004'  destinations_mosaic
--   SEC_VR  = 'b4e8f2a1-0000-0001-0000-000000000005'  video_reel
--   SEC_BA  = 'b4e8f2a1-0000-0001-0000-000000000006'  before_after
--   SEC_SC  = 'b4e8f2a1-0000-0001-0000-000000000007'  scroll_carousel

-- ── 1. cms_sections ──────────────────────────────────────────────────────────

INSERT INTO public.cms_sections
  (id, tenant_id, section_type_key, name, status, schema_version, version, props_jsonb)
VALUES

-- testimonials_trio
(
  'b4e8f2a1-0000-0001-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'testimonials_trio',
  'Phase E QA — Testimonials trio',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "What clients say",
    "headline": "Calm rigor, on the record.",
    "items": [
      {"quote": "They handled the campaign like it was their own brand. Nothing slipped.", "author": "Liana V.", "context": "Brand director", "location": "Madrid"},
      {"quote": "The casting was right. The shoot was right. The timeline was right.", "author": "Marco P.", "context": "Creative director", "location": "Milan"},
      {"quote": "Our hardest week of the year, and we never had to chase them.", "author": "Sara D.", "context": "Agency producer", "location": "London"}
    ],
    "variant": "trio-card",
    "defaultAccent": "auto",
    "presentation": {}
  }'::jsonb
),

-- magazine_layout
(
  'b4e8f2a1-0000-0001-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'magazine_layout',
  'Phase E QA — Magazine layout',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "From the journal",
    "headline": "Stories from inside the studio.",
    "hero": {
      "title": "The casting note we keep returning to.",
      "excerpt": "What a five-line brief teaches us, and why we still re-read it before every shoot.",
      "category": "Practice",
      "imageUrl": "https://images.unsplash.com/photo-1604537466158-719b1972feb8?auto=format&fit=crop&w=1200&q=80",
      "imageAlt": "Studio frame",
      "href": "#"
    },
    "secondary": [
      {"title": "On punctuality", "excerpt": "Why on-time is the cheapest gift you can give a creative team.", "category": "Operations", "imageUrl": "https://images.unsplash.com/photo-1496359561663-f04c33d3f7df?auto=format&fit=crop&w=1200&q=80", "imageAlt": "Set", "href": "#"},
      {"title": "What editorial means here", "excerpt": "Three habits that separate brand work from editorial.", "category": "Voice", "imageUrl": "https://images.unsplash.com/photo-1521405617584-1d9ca2c01206?auto=format&fit=crop&w=1200&q=80", "imageAlt": "Frame", "href": "#"},
      {"title": "Hiring the second model first", "excerpt": "Why secondary casting determines the shoot more than the lead.", "category": "Casting", "imageUrl": "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=80", "imageAlt": "Casting", "href": "#"}
    ],
    "presentation": {}
  }'::jsonb
),

-- masonry
(
  'b4e8f2a1-0000-0001-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'masonry',
  'Phase E QA — Masonry',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "Selected frames",
    "headline": "From recent campaigns.",
    "items": [
      {"src": "https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1200&q=80", "alt": "", "caption": "Editorial · Tulum"},
      {"src": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80", "alt": "", "caption": "Commercial · Mexico City"},
      {"src": "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80", "alt": ""},
      {"src": "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=1200&q=80", "alt": "", "caption": "Lookbook · Ibiza"},
      {"src": "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=1200&q=80", "alt": ""},
      {"src": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1200&q=80", "alt": "", "caption": "Editorial · Playa del Carmen"}
    ],
    "columnsDesktop": 3,
    "gap": "standard",
    "presentation": {}
  }'::jsonb
),

-- destinations_mosaic
(
  'b4e8f2a1-0000-0001-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'destinations_mosaic',
  'Phase E QA — Destinations mosaic',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "Where we work",
    "headline": "Five destinations on a first-name basis.",
    "copy": "Local fixers, the right hours of light, and which permits actually require an interview.",
    "items": [
      {"label": "Tulum", "region": "Mexico", "tagline": "Beach editorial, jungle interiors.", "imageUrl": "https://images.unsplash.com/photo-1568659585776-cd1a2abf1e62?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"label": "Mexico City", "region": "Mexico", "tagline": "Urban frames, brutalist architecture.", "imageUrl": "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"label": "Cancun", "region": "Mexico", "tagline": "Resorts, swim, accessory work.", "imageUrl": "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"label": "Ibiza", "region": "Spain", "tagline": "Summer drops, sun-drenched campaigns.", "imageUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"label": "Playa del Carmen", "region": "Mexico", "tagline": "Lookbook quiet, white-sand frames.", "imageUrl": "https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=1200&q=80", "href": "#"}
    ],
    "footnote": "Day rates and call sheets vary by destination.",
    "variant": "portrait-mosaic",
    "presentation": {}
  }'::jsonb
),

-- video_reel
(
  'b4e8f2a1-0000-0001-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'video_reel',
  'Phase E QA — Video reel',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "Reel",
    "headline": "A minute, edited.",
    "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "posterUrl": "https://images.unsplash.com/photo-1535016120720-40c646be5580?auto=format&fit=crop&w=1200&q=80",
    "chapters": [
      {"time": 0, "label": "Opening"},
      {"time": 18, "label": "Tulum editorial"},
      {"time": 36, "label": "Mexico City brand"},
      {"time": 52, "label": "Closing frame"}
    ],
    "ratio": "16/9",
    "controls": true,
    "loop": false,
    "muted": true,
    "autoplay": false,
    "presentation": {}
  }'::jsonb
),

-- before_after
(
  'b4e8f2a1-0000-0001-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'before_after',
  'Phase E QA — Before after',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "Process",
    "headline": "Before / after.",
    "beforeUrl": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80",
    "afterUrl": "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=1200&q=80",
    "beforeAlt": "Raw frame",
    "afterAlt": "Final frame",
    "beforeLabel": "Raw",
    "afterLabel": "Final",
    "initialPosition": 50,
    "ratio": "4/3",
    "presentation": {}
  }'::jsonb
),

-- scroll_carousel
(
  'b4e8f2a1-0000-0001-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'scroll_carousel',
  'Phase E QA — Scroll carousel',
  'published'::public.cms_section_status,
  1, 1,
  '{
    "eyebrow": "Currently shooting",
    "headline": "This week, on set.",
    "slides": [
      {"title": "Loulou Studios SS26", "caption": "Tulum · Editorial", "imageUrl": "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"title": "Belmond Maroma", "caption": "Cancun · Brand", "imageUrl": "https://images.unsplash.com/photo-1444723121867-7a241cacace9?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"title": "Studio Six.", "caption": "Mexico City · Lookbook", "imageUrl": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"title": "Cala Blanca", "caption": "Ibiza · Resort", "imageUrl": "https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"title": "Casa Aurelia", "caption": "Playa del Carmen · Editorial", "imageUrl": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80", "href": "#"},
      {"title": "Brand X Hostessing", "caption": "Mexico City · Live", "imageUrl": "https://images.unsplash.com/photo-1491349174775-aaafddd81942?auto=format&fit=crop&w=1200&q=80", "href": "#"}
    ],
    "cardWidthVw": 32,
    "showProgress": true,
    "presentation": {}
  }'::jsonb
)

ON CONFLICT (tenant_id, name) DO NOTHING;


-- ── 2. cms_pages ─────────────────────────────────────────────────────────────
-- Build the published_page_snapshot from the just-inserted cms_sections rows.

INSERT INTO public.cms_pages
  (id, tenant_id, slug, locale, template_key, title, status, noindex,
   body, published_at, published_page_snapshot)
SELECT
  'b4e8f2a1-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'audit-batch3',
  'en',
  'standard_page',
  'Phase E Edit QA — Batch 3',
  'published'::public.cms_page_status,
  TRUE,
  '',
  now(),
  jsonb_build_object(
    'version',               1,
    'publishedAt',           to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'pageVersion',           1,
    'locale',                'en',
    'templateSchemaVersion', 1,
    'fields', jsonb_build_object(
      'title',           'Phase E Edit QA — Batch 3',
      'metaDescription', null,
      'introTagline',    null
    ),
    'slots', jsonb_build_array(
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      0,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000001',
        'sectionTypeKey', 'testimonials_trio',
        'schemaVersion',  1,
        'name',           'Phase E QA — Testimonials trio',
        'props', s1.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      1,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000002',
        'sectionTypeKey', 'magazine_layout',
        'schemaVersion',  1,
        'name',           'Phase E QA — Magazine layout',
        'props', s2.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      2,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000003',
        'sectionTypeKey', 'masonry',
        'schemaVersion',  1,
        'name',           'Phase E QA — Masonry',
        'props', s3.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      3,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000004',
        'sectionTypeKey', 'destinations_mosaic',
        'schemaVersion',  1,
        'name',           'Phase E QA — Destinations mosaic',
        'props', s4.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      4,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000005',
        'sectionTypeKey', 'video_reel',
        'schemaVersion',  1,
        'name',           'Phase E QA — Video reel',
        'props', s5.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      5,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000006',
        'sectionTypeKey', 'before_after',
        'schemaVersion',  1,
        'name',           'Phase E QA — Before after',
        'props', s6.props_jsonb
      ),
      jsonb_build_object(
        'slotKey',        'body',
        'sortOrder',      6,
        'sectionId',      'b4e8f2a1-0000-0001-0000-000000000007',
        'sectionTypeKey', 'scroll_carousel',
        'schemaVersion',  1,
        'name',           'Phase E QA — Scroll carousel',
        'props', s7.props_jsonb
      )
    )
  )
FROM
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000001'::uuid) s1,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000002'::uuid) s2,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000003'::uuid) s3,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000004'::uuid) s4,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000005'::uuid) s5,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000006'::uuid) s6,
  (SELECT props_jsonb FROM public.cms_sections WHERE id = 'b4e8f2a1-0000-0001-0000-000000000007'::uuid) s7
ON CONFLICT (tenant_id, locale, slug)
DO UPDATE SET
  status                  = 'published'::public.cms_page_status,
  noindex                 = TRUE,
  published_at            = now(),
  published_page_snapshot = EXCLUDED.published_page_snapshot;


-- ── 3. cms_page_sections (live junction, is_draft=FALSE) ─────────────────────

INSERT INTO public.cms_page_sections
  (tenant_id, page_id, section_id, slot_key, sort_order, is_draft)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000001', 'body', 0, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000002', 'body', 1, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000003', 'body', 2, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000004', 'body', 3, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000005', 'body', 4, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000006', 'body', 5, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0000-0000-000000000001', 'b4e8f2a1-0000-0001-0000-000000000007', 'body', 6, FALSE)
ON CONFLICT (page_id, slot_key, sort_order, is_draft) DO NOTHING;

COMMIT;

-- ── Verification (run after to confirm) ─────────────────────────────────────
-- SELECT slug, status, noindex,
--        jsonb_array_length(published_page_snapshot->'slots') AS slot_count
--   FROM public.cms_pages
--  WHERE id = 'b4e8f2a1-0000-0000-0000-000000000001';
--
-- SELECT section_type_key, name, status
--   FROM public.cms_sections
--  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
--    AND name LIKE 'Phase E QA%'
--  ORDER BY section_type_key;
