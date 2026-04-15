-- Backfill map coordinates for common agency cities when still null (homepage map pins).
-- Centroids are approximate city centers; Places/admin can refine later.

UPDATE public.locations
SET
  latitude = -34.6037,
  longitude = -58.3816,
  updated_at = now()
WHERE city_slug = 'buenos-aires'
  AND (latitude IS NULL OR longitude IS NULL);

UPDATE public.locations
SET
  latitude = 21.1619,
  longitude = -86.8515,
  updated_at = now()
WHERE city_slug = 'cancun'
  AND (latitude IS NULL OR longitude IS NULL);

UPDATE public.locations
SET
  latitude = 20.6296,
  longitude = -87.0739,
  updated_at = now()
WHERE city_slug = 'playa-del-carmen'
  AND (latitude IS NULL OR longitude IS NULL);

UPDATE public.locations
SET
  latitude = 20.2114,
  longitude = -87.4651,
  updated_at = now()
WHERE city_slug = 'tulum'
  AND (latitude IS NULL OR longitude IS NULL);

UPDATE public.locations
SET
  latitude = 38.9067,
  longitude = 1.4206,
  updated_at = now()
WHERE city_slug = 'ibiza'
  AND (latitude IS NULL OR longitude IS NULL);
