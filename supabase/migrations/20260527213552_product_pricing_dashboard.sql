-- L50 / Product Pricing Dashboard — Phase 1
--
-- Centralized source of truth for every commercial knob: tier prices across
-- currencies, product names/features, discount codes, time-bounded sales.
-- Powers /platform/admin/pricing and (in Phase 2) marketing surfaces.
--
-- Phase 1 = read-only dashboard + USD editing. Discounts table created now
-- but no UI until Phase 3. Time-bounded sale columns (valid_from/valid_until)
-- created now but no enforcement until Phase 5.
--
-- RLS posture: enabled on every table, NO PUBLIC POLICIES — only
-- service-role reads/writes. Marketing readers also use service-role
-- (prices are public; no per-user gating needed).

-- ============================================================================
-- 1. product_packages  — top-level family grouping (workspace / talent / client)
-- ============================================================================

CREATE TABLE public.product_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family        text NOT NULL CHECK (family IN ('workspace', 'talent', 'client')),
  slug          text NOT NULL UNIQUE,
  label         text NOT NULL,
  description   text,
  display_order int  NOT NULL DEFAULT 0,
  is_active     bool NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_packages_family
  ON public.product_packages (family, display_order)
  WHERE is_active;

ALTER TABLE public.product_packages ENABLE ROW LEVEL SECURITY;
-- No public policies. Service-role-only.

-- ============================================================================
-- 2. product_tiers  — individual plan tier (Studio, Agency, Talent Pro, …)
-- ============================================================================

CREATE TABLE public.product_tiers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid NOT NULL REFERENCES public.product_packages (id) ON DELETE CASCADE,
  slug              text NOT NULL,
  name              text NOT NULL,
  tagline           text,
  description       text,
  display_order     int  NOT NULL DEFAULT 0,
  is_active         bool NOT NULL DEFAULT true,
  is_featured       bool NOT NULL DEFAULT false,
  stripe_product_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, slug)
);

CREATE INDEX idx_product_tiers_package
  ON public.product_tiers (package_id, display_order)
  WHERE is_active;

CREATE INDEX idx_product_tiers_stripe_product
  ON public.product_tiers (stripe_product_id)
  WHERE stripe_product_id IS NOT NULL;

ALTER TABLE public.product_tiers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. product_prices  — one row per (tier × currency × interval)
-- ============================================================================
-- Stripe prices are immutable. Edit a price → backend creates a new Stripe
-- Price + archives the old one + updates stripe_price_id here. The old row
-- stays in the table with archived_at set, for audit trail.

CREATE TABLE public.product_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id         uuid NOT NULL REFERENCES public.product_tiers (id) ON DELETE CASCADE,
  currency        text NOT NULL CHECK (length(currency) = 3),
  interval        text NOT NULL CHECK (interval IN ('month', 'year', 'once', 'lifetime')),
  unit_amount     bigint NOT NULL CHECK (unit_amount >= 0),
  stripe_price_id text,
  is_active       bool NOT NULL DEFAULT true,
  archived_at     timestamptz,
  valid_from      timestamptz,
  valid_until     timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one ACTIVE non-time-bounded price per (tier × currency × interval).
-- Time-bounded sale prices are allowed alongside; the reader picks via window.
CREATE UNIQUE INDEX idx_product_prices_active_canonical
  ON public.product_prices (tier_id, currency, interval)
  WHERE is_active AND archived_at IS NULL AND valid_from IS NULL AND valid_until IS NULL;

CREATE INDEX idx_product_prices_tier_lookup
  ON public.product_prices (tier_id, currency, interval, is_active);

CREATE INDEX idx_product_prices_stripe
  ON public.product_prices (stripe_price_id)
  WHERE stripe_price_id IS NOT NULL;

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. product_features  — bulleted feature list per tier
-- ============================================================================

CREATE TABLE public.product_features (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id       uuid NOT NULL REFERENCES public.product_tiers (id) ON DELETE CASCADE,
  label         text NOT NULL,
  included      bool NOT NULL DEFAULT true,
  highlight     bool NOT NULL DEFAULT false,
  display_order int  NOT NULL DEFAULT 0,
  category      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_features_tier
  ON public.product_features (tier_id, display_order);

ALTER TABLE public.product_features ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. product_discounts  — coupon codes (Phase 3 UI; table created now)
-- ============================================================================

CREATE TABLE public.product_discounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text NOT NULL UNIQUE,
  name                     text NOT NULL,
  kind                     text NOT NULL CHECK (kind IN ('percent', 'fixed', 'free_months')),
  value                    numeric NOT NULL CHECK (value > 0),
  currency                 text CHECK (currency IS NULL OR length(currency) = 3),
  applies_to               jsonb NOT NULL DEFAULT '"all"'::jsonb,
  max_redemptions          int CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count         int NOT NULL DEFAULT 0,
  per_customer_limit       int NOT NULL DEFAULT 1 CHECK (per_customer_limit > 0),
  starts_at                timestamptz,
  ends_at                  timestamptz,
  stripe_coupon_id         text,
  stripe_promotion_code_id text,
  is_active                bool NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  -- Fixed-amount discounts must declare a currency; percent / free_months don't.
  CHECK (kind <> 'fixed' OR currency IS NOT NULL)
);

CREATE INDEX idx_product_discounts_active
  ON public.product_discounts (code)
  WHERE is_active;

ALTER TABLE public.product_discounts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- updated_at trigger — shared across all 5 tables
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_set_pricing_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_product_packages_updated_at
  BEFORE UPDATE ON public.product_packages
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

CREATE TRIGGER trg_product_tiers_updated_at
  BEFORE UPDATE ON public.product_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

CREATE TRIGGER trg_product_prices_updated_at
  BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

CREATE TRIGGER trg_product_features_updated_at
  BEFORE UPDATE ON public.product_features
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

CREATE TRIGGER trg_product_discounts_updated_at
  BEFORE UPDATE ON public.product_discounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_pricing_updated_at();

-- ============================================================================
-- Seed data
-- ============================================================================
-- Matches current production reality (4 Stripe products, 8 USD prices) as
-- of 2026-05-27, plus the new families/tiers the spec adds (Workspace.Hub,
-- Workspace.Free, Talent.Free, Talent.Max-rename-of-Portfolio, Client.*).
--
-- Stripe IDs come from the live env vars STRIPE_PRICE_* — same account
-- (`acct_1RnWGdRrZLyWJgP5`) the runtime is currently wired to. If the
-- account is rotated, the StripeAccountCard re-verify flow will surface
-- the drift and Phase 1's "Sync to Stripe" action can repopulate IDs.
--
-- ON CONFLICT DO NOTHING on every insert keeps this idempotent if the
-- migration is replayed.

INSERT INTO public.product_packages (slug, family, label, description, display_order) VALUES
  ('workspace', 'workspace', 'Tulala Workspace', 'Studios & agencies running the bookings pipeline.', 1),
  ('talent',    'talent',    'Tulala Talent',    'Individual talent profiles & personal pages.',       2),
  ('client',    'client',    'Tulala Client',    'Trust ladder for buyer-side accounts.',              3)
ON CONFLICT (slug) DO NOTHING;

-- Workspace tiers
INSERT INTO public.product_tiers (package_id, slug, name, tagline, display_order, is_featured, stripe_product_id)
SELECT
  (SELECT id FROM public.product_packages WHERE slug = 'workspace'),
  v.slug, v.name, v.tagline, v.display_order, v.is_featured, v.stripe_product_id
FROM (VALUES
  ('free',   'Free',   'Try it free — limited roster, no commission.',     1, false, NULL),
  ('studio', 'Studio', 'Solo studios & small agencies — full pipeline.',   2, true,  'prod_USqz7caN3C05as'),
  ('agency', 'Agency', 'Full agencies — unlimited roster, white-label.',   3, false, 'prod_USqzOU4yezKAUy'),
  ('hub',    'Hub',    'Multi-workspace networks & federated rosters.',    4, false, NULL)
) AS v(slug, name, tagline, display_order, is_featured, stripe_product_id)
ON CONFLICT (package_id, slug) DO NOTHING;

-- Talent tiers
INSERT INTO public.product_tiers (package_id, slug, name, tagline, display_order, is_featured, stripe_product_id)
SELECT
  (SELECT id FROM public.product_packages WHERE slug = 'talent'),
  v.slug, v.name, v.tagline, v.display_order, v.is_featured, v.stripe_product_id
FROM (VALUES
  ('free', 'Free', 'Public profile on tulala.digital/t/<slug>.',          1, false, NULL),
  ('pro',  'Pro',  'Premium profile, lead routing, analytics.',           2, true,  'prod_USqzcrGmeunlEV'),
  ('max',  'Max',  'Personal page builder, custom domain, unlimited media.', 3, false, 'prod_USqzxqy3QIXKg4')
) AS v(slug, name, tagline, display_order, is_featured, stripe_product_id)
ON CONFLICT (package_id, slug) DO NOTHING;

-- Client trust ladder. Verification fees are one-off; modeled as interval='once'.
INSERT INTO public.product_tiers (package_id, slug, name, tagline, display_order, is_featured, stripe_product_id)
SELECT
  (SELECT id FROM public.product_packages WHERE slug = 'client'),
  v.slug, v.name, v.tagline, v.display_order, false, NULL
FROM (VALUES
  ('basic',    'Basic',    'Default — email verified.',                       1),
  ('verified', 'Verified', 'ID verified — green badge.',                      2),
  ('silver',   'Silver',   'Funded account — preferred contact priority.',    3),
  ('gold',     'Gold',     'Premium funded account — top-of-inbox routing.',  4)
) AS v(slug, name, tagline, display_order)
ON CONFLICT (package_id, slug) DO NOTHING;

-- Workspace prices (Studio + Agency, USD month + year)
-- Studio:  $49/mo  ($490/yr)
-- Agency:  $149/mo ($1,490/yr)
INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'workspace' AND t.slug = 'studio'),
  'USD', 'month', 4900, 'price_1TTvHTRrZLyWJgP5rs0thGmh'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'workspace' AND t.slug = 'studio'
    AND pp.currency = 'USD' AND pp.interval = 'month'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'workspace' AND t.slug = 'studio'),
  'USD', 'year', 49000, 'price_1TTvHURrZLyWJgP5SIcZDGNJ'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'workspace' AND t.slug = 'studio'
    AND pp.currency = 'USD' AND pp.interval = 'year'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'workspace' AND t.slug = 'agency'),
  'USD', 'month', 14900, 'price_1TTvHVRrZLyWJgP5eL41Skdg'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'workspace' AND t.slug = 'agency'
    AND pp.currency = 'USD' AND pp.interval = 'month'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'workspace' AND t.slug = 'agency'),
  'USD', 'year', 149000, 'price_1TTvHWRrZLyWJgP5NwUM0Qce'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'workspace' AND t.slug = 'agency'
    AND pp.currency = 'USD' AND pp.interval = 'year'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

-- Talent prices (Pro + Max, USD month + year)
-- Talent Pro:  $12/mo ($120/yr)
-- Talent Max:  $29/mo ($290/yr)  (renamed from "Portfolio")
INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'talent' AND t.slug = 'pro'),
  'USD', 'month', 1200, 'price_1TTvHXRrZLyWJgP5EOtMgn5K'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'talent' AND t.slug = 'pro'
    AND pp.currency = 'USD' AND pp.interval = 'month'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'talent' AND t.slug = 'pro'),
  'USD', 'year', 12000, 'price_1TTvHYRrZLyWJgP5UImvuf0Z'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'talent' AND t.slug = 'pro'
    AND pp.currency = 'USD' AND pp.interval = 'year'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'talent' AND t.slug = 'max'),
  'USD', 'month', 2900, 'price_1TTvHZRrZLyWJgP5NCTVDHep'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'talent' AND t.slug = 'max'
    AND pp.currency = 'USD' AND pp.interval = 'month'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

INSERT INTO public.product_prices (tier_id, currency, interval, unit_amount, stripe_price_id)
SELECT
  (SELECT t.id FROM public.product_tiers t
   JOIN public.product_packages p ON p.id = t.package_id
   WHERE p.slug = 'talent' AND t.slug = 'max'),
  'USD', 'year', 29000, 'price_1TTvHZRrZLyWJgP57SmkhN8C'
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_prices pp
  JOIN public.product_tiers t ON t.id = pp.tier_id
  JOIN public.product_packages p ON p.id = t.package_id
  WHERE p.slug = 'talent' AND t.slug = 'max'
    AND pp.currency = 'USD' AND pp.interval = 'year'
    AND pp.archived_at IS NULL AND pp.valid_from IS NULL AND pp.valid_until IS NULL
);

-- Seed feature bullets — match what the current marketing surfaces show.
-- These are conservative starter sets; Phase 4 adds the editor UI.
INSERT INTO public.product_features (tier_id, label, included, highlight, display_order, category)
SELECT t.id, v.label, true, v.highlight, v.display_order, 'core'
FROM public.product_tiers t
JOIN public.product_packages p ON p.id = t.package_id
JOIN (VALUES
  ('workspace', 'free',   'Up to 5 talent profiles',              true,  1),
  ('workspace', 'free',   'Public roster page',                    false, 2),
  ('workspace', 'free',   'No commission on bookings',             true,  3),
  ('workspace', 'studio', 'Up to 50 talent profiles',              true,  1),
  ('workspace', 'studio', 'Full inquiry → booking pipeline',       true,  2),
  ('workspace', 'studio', 'Messages, offers, contracts',           false, 3),
  ('workspace', 'studio', 'Multi-currency invoicing',              false, 4),
  ('workspace', 'agency', 'Unlimited talent profiles',             true,  1),
  ('workspace', 'agency', 'White-label public surface',            true,  2),
  ('workspace', 'agency', 'Media inventory + watermarking',        false, 3),
  ('workspace', 'agency', 'Team seats + roles',                    false, 4),
  ('workspace', 'hub',    'Multi-workspace federation',            true,  1),
  ('workspace', 'hub',    'Shared talent across rosters',          true,  2),
  ('workspace', 'hub',    'Network-level billing & reporting',     false, 3),
  ('talent',    'free',   'Public profile at tulala.digital/t/…',  true,  1),
  ('talent',    'free',   'Receive direct inquiries',              false, 2),
  ('talent',    'pro',    'Premium profile layout',                true,  1),
  ('talent',    'pro',    'Lead-routing preferences',              true,  2),
  ('talent',    'pro',    'Inbox + analytics',                     false, 3),
  ('talent',    'max',    'Personal page builder',                 true,  1),
  ('talent',    'max',    'Custom domain (your-name.com)',         true,  2),
  ('talent',    'max',    'Unlimited media uploads',               false, 3),
  ('client',    'basic',    'Email-verified contact',              false, 1),
  ('client',    'verified', 'ID-verified badge',                   true,  1),
  ('client',    'silver',   'Funded account hold',                 true,  1),
  ('client',    'silver',   'Preferred inbox routing',             false, 2),
  ('client',    'gold',     'Premium funded account hold',         true,  1),
  ('client',    'gold',     'Top-of-inbox routing across talent',  true,  2)
) AS v(pkg_slug, tier_slug, label, highlight, display_order)
  ON p.slug = v.pkg_slug AND t.slug = v.tier_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_features pf
  WHERE pf.tier_id = t.id AND pf.label = v.label
);
