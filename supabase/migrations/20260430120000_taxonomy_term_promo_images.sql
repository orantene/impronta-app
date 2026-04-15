-- Optional marketing image per taxonomy term + placement keys for public surfaces (e.g. home browse-by-type).

BEGIN;

ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS promo_image_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS promo_placements TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.taxonomy_terms.promo_image_storage_path IS 'Key in storage bucket media-public; public URL via getPublicUrl.';
COMMENT ON COLUMN public.taxonomy_terms.promo_placements IS 'App-defined placement keys, e.g. home_browse_by_type.';

COMMIT;
