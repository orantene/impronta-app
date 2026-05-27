-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  Default currency per actor (PR-E foundation)                    ║
-- ║  Decision-log L49 (2026-05-26)                                   ║
-- ║                                                                    ║
-- ║  Adds `default_currency TEXT NOT NULL DEFAULT 'EUR'` (ISO-4217)   ║
-- ║  on the two actors that get paid:                                 ║
-- ║    - agencies         → admin Business Financials display unit   ║
-- ║    - talent_profiles  → talent Money display unit                 ║
-- ║                                                                    ║
-- ║  We do NOT add it to profiles (auth-level user) because a single ║
-- ║  human can be both an agency owner AND a talent simultaneously,   ║
-- ║  and the two surfaces have different "paid in" currencies in      ║
-- ║  practice (e.g. talent paid in EUR, agency owner books US clients ║
-- ║  in USD). Per-role is more honest.                                ║
-- ║                                                                    ║
-- ║  v1 is display-only: the underlying snapshot rows are EUR-only.   ║
-- ║  When non-EUR snapshots start flowing, the financials surfaces    ║
-- ║  group rows by currency and the user's default_currency tab is    ║
-- ║  selected first.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'EUR'
    CHECK (length(default_currency) = 3);

COMMENT ON COLUMN public.agencies.default_currency IS
  'ISO-4217. Admin Business Financials selects this tab first when multiple currencies are present. Display-only at v1 — does not affect commission math.';

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'EUR'
    CHECK (length(default_currency) = 3);

COMMENT ON COLUMN public.talent_profiles.default_currency IS
  'ISO-4217. Talent Money selects this tab first when multiple currencies are present. Display-only at v1.';
