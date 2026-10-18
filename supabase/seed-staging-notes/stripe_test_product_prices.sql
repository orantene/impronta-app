-- NOT A MIGRATION. NOT APPLIED. Staging Supabase + Stripe TEST keys only.
-- Never run against production (production rows carry LIVE price ids).
--
-- Why: TUL-829/830/831/832/833/835/837 (subscription checkout, plan change and
-- proration, cancel/resume, failed-payment dunning, ...) are blocked on staging
-- by "No Stripe price configured for plan talent_portfolio". Checkout resolves
-- the price from `product_prices` (web/src/lib/stripe/price-catalog.ts):
--   tier active + currency 'USD' + interval 'month'|'year' + is_active
--   + archived_at IS NULL + valid_from IS NULL + valid_until IS NULL
--   -> stripe_price_id
-- so each self-serve plan needs ONE canonical row per interval whose
-- stripe_price_id is a Stripe TEST-mode price id (price_...) on the STAGING
-- Stripe account that the staging STRIPE_SECRET_KEY (sk_test_...) belongs to.
--
-- Rows needed (plan key -> product_tiers.slug -> package), USD, month AND year:
--   talent_pro        -> talent.pro        month, year
--   talent_portfolio  -> talent.max        month, year   (the "Portfolio" tier)
--   website           -> workspace.website month, year   (only if that tier exists and is active)
--   studio            -> workspace.studio  month, year
--   agency            -> workspace.agency  month, year
-- (network is sales-assisted: no price. free tiers never reach Stripe.)
-- Yearly = 10 x monthly (DEC-9). Amounts below are the pricing-page placeholders
-- ($9/$15/$29/$79); set the real ones before applying. MXN is out of scope
-- until Oran decides MXN prices (checkout is USD with adaptive pricing).
--
-- Step 1 (outside SQL, TEST mode only): in the Stripe TEST dashboard for the
-- staging account create the products/prices (or reuse the QA fixtures) with
-- lookup_keys talent_pro_month, talent_pro_year, talent_portfolio_month,
-- talent_portfolio_year, studio_month, studio_year, agency_month, agency_year
-- (and website_*), recurring, currency usd. Copy each price id.
--
-- Step 2: fill the :price_id variables and run with psql against STAGING:
--   psql "$STAGING_DATABASE_URL" -v apply=no \
--     -v talent_pro_month=price_... -v talent_pro_year=price_... \
--     -v talent_max_month=price_... -v talent_max_year=price_... \
--     -v studio_month=price_... -v studio_year=price_... \
--     -v agency_month=price_... -v agency_year=price_... \
--     -v website_month=price_... -v website_year=price_... \
--     -f supabase/seed-staging-notes/stripe_test_product_prices.sql
-- It prints the resulting catalog and ROLLS BACK unless -v apply=yes.
--
-- Safety: validates the price-id shape only. A price id does not say test or
-- live, so the guard is the operator: STAGING database URL, ids copied from the
-- Stripe TEST dashboard, dry run (default) first.

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply no
\endif

BEGIN;

CREATE TEMP TABLE _seed (package_slug text, tier_slug text, interval text, unit_amount bigint, price_id text) ON COMMIT DROP;
INSERT INTO _seed VALUES
  ('talent',    'pro',     'month',  900, :'talent_pro_month'),
  ('talent',    'pro',     'year',  9000, :'talent_pro_year'),
  ('talent',    'max',     'month', 1500, :'talent_max_month'),
  ('talent',    'max',     'year', 15000, :'talent_max_year'),
  ('workspace', 'studio',  'month', 2900, :'studio_month'),
  ('workspace', 'studio',  'year', 29000, :'studio_year'),
  ('workspace', 'agency',  'month', 7900, :'agency_month'),
  ('workspace', 'agency',  'year', 79000, :'agency_year');
-- website is optional: only seeded when its variables are passed.
\if :{?website_month}
INSERT INTO _seed VALUES
  ('workspace', 'website', 'month', 900,  :'website_month'),
  ('workspace', 'website', 'year', 9000, :'website_year');
\endif

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _seed LOOP
    IF r.price_id !~ '^price_[A-Za-z0-9]+$' THEN
      RAISE EXCEPTION 'bad price id for %.% %', r.package_slug, r.tier_slug, r.interval;
    END IF;
  END LOOP;
  -- Price ids do not say test or live; the guard is the operator running this
  -- against the STAGING database URL with ids copied from the Stripe TEST dashboard.
END $$;

-- 1) Update the existing canonical row, if there is one.
UPDATE public.product_prices pp
SET stripe_price_id = s.price_id, unit_amount = s.unit_amount, updated_at = now()
FROM _seed s
JOIN public.product_packages p ON p.slug = s.package_slug
JOIN public.product_tiers t ON t.package_id = p.id AND t.slug = s.tier_slug
WHERE pp.tier_id = t.id AND pp.currency = 'USD' AND pp.interval = s.interval
  AND pp.is_active AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL;

-- 2) Insert the rows that did not exist.
INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id, notes)
SELECT t.id, 'USD', s.interval, s.unit_amount, s.price_id, 'staging Stripe TEST price (seed-staging-notes)'
FROM _seed s
JOIN public.product_packages p ON p.slug = s.package_slug
JOIN public.product_tiers t ON t.package_id = p.id AND t.slug = s.tier_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  WHERE pp.tier_id = t.id AND pp.currency = 'USD' AND pp.interval = s.interval
    AND pp.is_active AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

-- Tiers in the seed that do not exist in this database (nothing was written for them).
SELECT s.package_slug, s.tier_slug, 'MISSING TIER' AS problem
FROM _seed s
LEFT JOIN public.product_packages p ON p.slug = s.package_slug
LEFT JOIN public.product_tiers t ON t.package_id = p.id AND t.slug = s.tier_slug
WHERE t.id IS NULL
GROUP BY 1, 2;

-- Tiers that exist but are inactive (checkout ignores an inactive tier).
SELECT p.slug AS package, t.slug AS tier, t.is_active
FROM public.product_tiers t JOIN public.product_packages p ON p.id = t.package_id
WHERE (p.slug, t.slug) IN (SELECT package_slug, tier_slug FROM _seed) AND NOT t.is_active;

-- What checkout will now see.
SELECT p.slug AS package, t.slug AS tier, pp.interval, pp.unit_amount, pp.stripe_price_id
FROM public.product_prices pp
JOIN public.product_tiers t ON t.id = pp.tier_id
JOIN public.product_packages p ON p.id = t.package_id
WHERE (p.slug, t.slug) IN (SELECT package_slug, tier_slug FROM _seed)
  AND pp.currency = 'USD' AND pp.is_active AND pp.archived_at IS NULL
  AND pp.valid_from IS NULL AND pp.valid_until IS NULL
ORDER BY p.slug, t.slug, pp.interval;

SELECT (:'apply' = 'yes') AS will_commit \gset
\if :will_commit
  COMMIT;
\else
  ROLLBACK;
  \echo 'ROLLED BACK (dry run). Re-run with -v apply=yes after reviewing the output above.'
\endif
