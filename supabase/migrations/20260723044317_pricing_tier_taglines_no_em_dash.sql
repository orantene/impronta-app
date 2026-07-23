-- Remove em dashes from the public workspace tier taglines.
--
-- These three strings are seeded data (20260527213552_product_pricing_dashboard)
-- but they render as public marketing copy: the homepage pricing teaser and the
-- /pricing page both read `product_tiers.tagline`. The product copy standard is
-- no em dashes in user-facing text, so the sentences are rewritten rather than
-- having the character swapped out.
--
-- Each UPDATE matches the exact previous value, so replaying this migration
-- after someone has edited a tagline in the dashboard is a no-op instead of a
-- clobber.

UPDATE public.product_tiers AS t
SET tagline = 'Try it free. Limited roster, no commission.'
FROM public.product_packages AS p
WHERE t.package_id = p.id
  AND p.slug = 'workspace'
  AND t.slug = 'free'
  AND t.tagline = 'Try it free — limited roster, no commission.';

UPDATE public.product_tiers AS t
SET tagline = 'Solo studios and small agencies. The full pipeline.'
FROM public.product_packages AS p
WHERE t.package_id = p.id
  AND p.slug = 'workspace'
  AND t.slug = 'studio'
  AND t.tagline = 'Solo studios & small agencies — full pipeline.';

UPDATE public.product_tiers AS t
SET tagline = 'Full agencies. Unlimited roster, white-label.'
FROM public.product_packages AS p
WHERE t.package_id = p.id
  AND p.slug = 'workspace'
  AND t.slug = 'agency'
  AND t.tagline = 'Full agencies — unlimited roster, white-label.';
