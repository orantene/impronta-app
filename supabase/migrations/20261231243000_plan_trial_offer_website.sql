-- Trial door for the Website tier (docs/plans/onboarding/trial-and-card.md).
-- The onboarding doors (custom domain, remove badge, fourth page, AI logo,
-- image regenerations) sell Website with a 7-day trial. Additive: one row,
-- no-op when an admin already created it from /platform/admin/pricing.
-- Website stays unsellable until product_tiers.website.is_active flips and a
-- Stripe price exists; until then the doors fall back to Agency (14 days).
INSERT INTO public.plan_trial_offers
  (audience, plan_key, trial_days, is_enabled, cta_headline, cta_subtext)
VALUES
  ('workspace', 'website', 7, TRUE,
     'Try Website free for 7 days',
     'Your own domain, no Tulala badge, more pages and AI logo tries.')
ON CONFLICT (audience, plan_key) DO NOTHING;
