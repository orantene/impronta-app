-- Phase 0 (Tulala Agent): entitlement truth in the public product catalog.
--
-- The AI intake agent will recommend plans. It must never recommend against
-- copy that contradicts what the product enforces or charges, so two seeded
-- claims are corrected here before any recommendation exists.
--
-- 1. "No commission on bookings" on the workspace Free tier — both the tagline
--    and the feature bullet. This is false. The canonical resolver
--    (web/src/lib/billing/commission.ts) takes the rate from
--    platform_commission_config: plan_tier_bps[plan] if present, else
--    default_take_bps, which 20261007000000_commission_talent_protected_split
--    set to 600 (6%) with a 300 bps client surcharge. No migration has ever
--    written a "free" key into plan_tier_bps, so Free has always been charged
--    6% like every other tier. /pricing already says "6% on a paid booking,
--    the same on every plan"; these two rows were the contradiction.
--
-- 2. "Up to 50 talent profiles" on the workspace Studio tier. The enforced cap
--    is 15 — PLAN_SEAT_CAPS.studio in web/src/lib/saas/plan-seat-caps.ts, which
--    backs agencies.talent_seat_limit and checkRosterSeatAvailability. A
--    customer reading 50 on the pricing page would be refused at profile 16.
--    That module's own header calls this the worst kind of bug: the product
--    calling the user a liar.
--
-- Copy only. No price is touched here on purpose: product_prices rows carry
-- live Stripe price IDs, so unit_amount and Stripe must move together and that
-- is a commercial decision, not a migration. See scripts/check-price-drift.mjs,
-- which reports the $29/$79-vs-$49/$149 divergence rather than guessing at it.
--
-- Every UPDATE matches the exact prior value, following
-- 20260723044317_pricing_tier_taglines_no_em_dash: replaying after someone has
-- edited a string in the platform dashboard is a no-op, never a clobber.
--
-- Rollback: restore the three prior values quoted in each WHERE clause.
-- Timestamp is 20261226000006, the next free slot after the house-lane series
-- (20261226000000..000005) already applied to remote; the repo's migration clock
-- runs ahead of wall time, so a `date -u` timestamp would sort before them.

BEGIN;

-- 1a. Free tier tagline — drop the false no-commission claim.
--     Two prior spellings are possible depending on whether
--     20260723044317 has been applied, so both are matched.
UPDATE public.product_tiers AS t
SET tagline = 'Try it free. Up to 5 profiles, friend-link access.'
FROM public.product_packages AS p
WHERE t.package_id = p.id
  AND p.slug = 'workspace'
  AND t.slug = 'free'
  AND t.tagline IN (
    'Try it free. Limited roster, no commission.',
    'Try it free — limited roster, no commission.'
  );

-- 1b. Free tier feature bullet — replace the false claim with a true one.
--     The honest differentiator for Free is that nothing is charged until a
--     booking is actually paid, which is a real property of the fee model and
--     applies on every plan.
UPDATE public.product_features AS f
SET label = 'No monthly fee, you only pay when a booking is paid'
FROM public.product_tiers AS t
JOIN public.product_packages AS p ON p.id = t.package_id
WHERE f.tier_id = t.id
  AND p.slug = 'workspace'
  AND t.slug = 'free'
  AND f.label = 'No commission on bookings';

-- 2. Studio roster cap — 50 advertised vs 15 enforced.
UPDATE public.product_features AS f
SET label = 'Up to 15 talent profiles'
FROM public.product_tiers AS t
JOIN public.product_packages AS p ON p.id = t.package_id
WHERE f.tier_id = t.id
  AND p.slug = 'workspace'
  AND t.slug = 'studio'
  AND f.label = 'Up to 50 talent profiles';

COMMIT;
