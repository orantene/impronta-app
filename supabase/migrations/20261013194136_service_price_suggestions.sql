-- TUL-633: suggested starting prices for NEW talents' services (what a talent charges her clients).
-- Used only to pre-fill signup as "Suggested, tap to change". Not Tulala plan prices.
-- ADDITIVE ONLY. Draft rows are invisible to anon/authenticated until a super_admin approves them.

CREATE TABLE IF NOT EXISTS public.service_price_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code     text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  service_key      text NOT NULL CHECK (length(service_key) BETWEEN 1 AND 120),
  currency         text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor     integer NOT NULL CHECK (amount_minor > 0),
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  source_note      text,
  updated_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, service_key)
);

CREATE OR REPLACE FUNCTION public.service_price_suggestions_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS service_price_suggestions_touch ON public.service_price_suggestions;
CREATE TRIGGER service_price_suggestions_touch
  BEFORE UPDATE ON public.service_price_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.service_price_suggestions_touch();

ALTER TABLE public.service_price_suggestions ENABLE ROW LEVEL SECURITY;

-- Anyone may read APPROVED rows only; drafts stay private to super_admin.
DROP POLICY IF EXISTS service_price_suggestions_read_approved ON public.service_price_suggestions;
CREATE POLICY service_price_suggestions_read_approved
  ON public.service_price_suggestions FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- super_admin may read everything (incl. drafts) and write. No other write policy exists,
-- so anon and ordinary authenticated users cannot insert, update or delete.
DROP POLICY IF EXISTS service_price_suggestions_admin_all ON public.service_price_suggestions;
CREATE POLICY service_price_suggestions_admin_all
  ON public.service_price_suggestions FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

REVOKE ALL ON public.service_price_suggestions FROM anon;
GRANT SELECT ON public.service_price_suggestions TO anon;
REVOKE INSERT, UPDATE, DELETE ON public.service_price_suggestions FROM anon;

INSERT INTO public.service_price_suggestions
  (country_code, service_key, currency, amount_minor, duration_minutes, status, source_note)
VALUES
('MX','lashes:classic-lash-set','MXN',90000,120,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','lashes:volume-lash-set','MXN',120000,150,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','lashes:lash-lift','MXN',70000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','lashes:lash-refill','MXN',60000,75,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','nails:manicure','MXN',25000,45,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','nails:gel-manicure','MXN',35000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','nails:acrylic-set','MXN',55000,90,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','nails:pedicure','MXN',35000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','brows:brow-shaping','MXN',25000,30,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','brows:brow-lamination','MXN',60000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','brows:brow-tint','MXN',20000,30,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','hair:haircut','MXN',35000,45,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','hair:color','MXN',120000,120,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','hair:blowout','MXN',30000,45,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','hair:hair-treatment','MXN',60000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','makeup:day-makeup','MXN',80000,60,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','makeup:event-makeup','MXN',120000,90,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('MX','makeup:bridal-makeup','MXN',250000,120,'approved','Current Mexico onboarding pack price (essentials.ts BEAUTY_PACKS), unchanged.'),
('US','lashes:classic-lash-set','USD',12000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','lashes:volume-lash-set','USD',16000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','lashes:lash-lift','USD',8000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','lashes:lash-refill','USD',7000,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','nails:manicure','USD',3500,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','nails:gel-manicure','USD',5000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','nails:acrylic-set','USD',7000,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','nails:pedicure','USD',5000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','brows:brow-shaping','USD',3000,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','brows:brow-lamination','USD',7500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','brows:brow-tint','USD',2500,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','hair:haircut','USD',5500,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','hair:color','USD',15000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','hair:blowout','USD',5000,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','hair:hair-treatment','USD',8000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','makeup:day-makeup','USD',9000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','makeup:event-makeup','USD',13000,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('US','makeup:bridal-makeup','USD',25000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency.'),
('CA','lashes:classic-lash-set','USD',11500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 159 CAD (note only).'),
('CA','lashes:volume-lash-set','USD',15000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 210 CAD (note only).'),
('CA','lashes:lash-lift','USD',7500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 103 CAD (note only).'),
('CA','lashes:lash-refill','USD',6500,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 90 CAD (note only).'),
('CA','nails:manicure','USD',3300,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 46 CAD (note only).'),
('CA','nails:gel-manicure','USD',4800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 66 CAD (note only).'),
('CA','nails:acrylic-set','USD',6500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 90 CAD (note only).'),
('CA','nails:pedicure','USD',4800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 66 CAD (note only).'),
('CA','brows:brow-shaping','USD',2800,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 39 CAD (note only).'),
('CA','brows:brow-lamination','USD',7000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 97 CAD (note only).'),
('CA','brows:brow-tint','USD',2400,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 33 CAD (note only).'),
('CA','hair:haircut','USD',5200,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 72 CAD (note only).'),
('CA','hair:color','USD',14000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 193 CAD (note only).'),
('CA','hair:blowout','USD',4800,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 66 CAD (note only).'),
('CA','hair:hair-treatment','USD',7500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 103 CAD (note only).'),
('CA','makeup:day-makeup','USD',8500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 117 CAD (note only).'),
('CA','makeup:event-makeup','USD',12500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 172 CAD (note only).'),
('CA','makeup:bridal-makeup','USD',24000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 330 CAD (note only).'),
('GB','lashes:classic-lash-set','USD',12500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 98 GBP (note only).'),
('GB','lashes:volume-lash-set','USD',17000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 133 GBP (note only).'),
('GB','lashes:lash-lift','USD',8500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 66 GBP (note only).'),
('GB','lashes:lash-refill','USD',7500,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 58 GBP (note only).'),
('GB','nails:manicure','USD',3700,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 29 GBP (note only).'),
('GB','nails:gel-manicure','USD',5200,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 41 GBP (note only).'),
('GB','nails:acrylic-set','USD',7500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 58 GBP (note only).'),
('GB','nails:pedicure','USD',5200,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 41 GBP (note only).'),
('GB','brows:brow-shaping','USD',3200,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 25 GBP (note only).'),
('GB','brows:brow-lamination','USD',8000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 62 GBP (note only).'),
('GB','brows:brow-tint','USD',2600,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 20 GBP (note only).'),
('GB','hair:haircut','USD',5800,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 45 GBP (note only).'),
('GB','hair:color','USD',16000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 125 GBP (note only).'),
('GB','hair:blowout','USD',5200,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 41 GBP (note only).'),
('GB','hair:hair-treatment','USD',8500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 66 GBP (note only).'),
('GB','makeup:day-makeup','USD',9500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 74 GBP (note only).'),
('GB','makeup:event-makeup','USD',13500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 105 GBP (note only).'),
('GB','makeup:bridal-makeup','USD',26000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 200 GBP (note only).'),
('CH','lashes:classic-lash-set','USD',18000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 153 CHF (note only).'),
('CH','lashes:volume-lash-set','USD',24000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 200 CHF (note only).'),
('CH','lashes:lash-lift','USD',12000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 102 CHF (note only).'),
('CH','lashes:lash-refill','USD',10500,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 89 CHF (note only).'),
('CH','nails:manicure','USD',5200,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 44 CHF (note only).'),
('CH','nails:gel-manicure','USD',7500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 64 CHF (note only).'),
('CH','nails:acrylic-set','USD',10500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 89 CHF (note only).'),
('CH','nails:pedicure','USD',7500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 64 CHF (note only).'),
('CH','brows:brow-shaping','USD',4500,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 38 CHF (note only).'),
('CH','brows:brow-lamination','USD',11000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 94 CHF (note only).'),
('CH','brows:brow-tint','USD',3800,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 32 CHF (note only).'),
('CH','hair:haircut','USD',8000,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 68 CHF (note only).'),
('CH','hair:color','USD',22500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 191 CHF (note only).'),
('CH','hair:blowout','USD',7500,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 64 CHF (note only).'),
('CH','hair:hair-treatment','USD',12000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 102 CHF (note only).'),
('CH','makeup:day-makeup','USD',13500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 115 CHF (note only).'),
('CH','makeup:event-makeup','USD',19500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 166 CHF (note only).'),
('CH','makeup:bridal-makeup','USD',37500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 320 CHF (note only).'),
('ES','lashes:classic-lash-set','USD',9500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 87 EUR (note only).'),
('ES','lashes:volume-lash-set','USD',13000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 120 EUR (note only).'),
('ES','lashes:lash-lift','USD',6500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 60 EUR (note only).'),
('ES','lashes:lash-refill','USD',5600,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 52 EUR (note only).'),
('ES','nails:manicure','USD',2800,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 26 EUR (note only).'),
('ES','nails:gel-manicure','USD',4000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 37 EUR (note only).'),
('ES','nails:acrylic-set','USD',5600,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 52 EUR (note only).'),
('ES','nails:pedicure','USD',4000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 37 EUR (note only).'),
('ES','brows:brow-shaping','USD',2400,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 22 EUR (note only).'),
('ES','brows:brow-lamination','USD',6000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 55 EUR (note only).'),
('ES','brows:brow-tint','USD',2000,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 18 EUR (note only).'),
('ES','hair:haircut','USD',4400,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 40 EUR (note only).'),
('ES','hair:color','USD',12000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 110 EUR (note only).'),
('ES','hair:blowout','USD',4000,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 37 EUR (note only).'),
('ES','hair:hair-treatment','USD',6500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 60 EUR (note only).'),
('ES','makeup:day-makeup','USD',7000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 64 EUR (note only).'),
('ES','makeup:event-makeup','USD',10500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 97 EUR (note only).'),
('ES','makeup:bridal-makeup','USD',20000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 184 EUR (note only).'),
('AU','lashes:classic-lash-set','USD',12500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 188 AUD (note only).'),
('AU','lashes:volume-lash-set','USD',17000,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 260 AUD (note only).'),
('AU','lashes:lash-lift','USD',8500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 128 AUD (note only).'),
('AU','lashes:lash-refill','USD',7500,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 112 AUD (note only).'),
('AU','nails:manicure','USD',3700,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 56 AUD (note only).'),
('AU','nails:gel-manicure','USD',5200,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 78 AUD (note only).'),
('AU','nails:acrylic-set','USD',7500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 112 AUD (note only).'),
('AU','nails:pedicure','USD',5200,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 78 AUD (note only).'),
('AU','brows:brow-shaping','USD',3200,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 48 AUD (note only).'),
('AU','brows:brow-lamination','USD',8000,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 120 AUD (note only).'),
('AU','brows:brow-tint','USD',2600,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 39 AUD (note only).'),
('AU','hair:haircut','USD',5800,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 87 AUD (note only).'),
('AU','hair:color','USD',16000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 240 AUD (note only).'),
('AU','hair:blowout','USD',5200,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 78 AUD (note only).'),
('AU','hair:hair-treatment','USD',8500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 128 AUD (note only).'),
('AU','makeup:day-makeup','USD',9500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 142 AUD (note only).'),
('AU','makeup:event-makeup','USD',13500,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 200 AUD (note only).'),
('AU','makeup:bridal-makeup','USD',26000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 390 AUD (note only).'),
('CO','lashes:classic-lash-set','USD',4200,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 168,000 COP (note only).'),
('CO','lashes:volume-lash-set','USD',5600,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 224,000 COP (note only).'),
('CO','lashes:lash-lift','USD',2800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 112,000 COP (note only).'),
('CO','lashes:lash-refill','USD',2400,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 96,000 COP (note only).'),
('CO','nails:manicure','USD',1200,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 48,000 COP (note only).'),
('CO','nails:gel-manicure','USD',1800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 72,000 COP (note only).'),
('CO','nails:acrylic-set','USD',2400,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 96,000 COP (note only).'),
('CO','nails:pedicure','USD',1800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 72,000 COP (note only).'),
('CO','brows:brow-shaping','USD',1000,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 40,000 COP (note only).'),
('CO','brows:brow-lamination','USD',2600,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 104,000 COP (note only).'),
('CO','brows:brow-tint','USD',900,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 36,000 COP (note only).'),
('CO','hair:haircut','USD',1900,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 76,000 COP (note only).'),
('CO','hair:color','USD',5200,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 208,000 COP (note only).'),
('CO','hair:blowout','USD',1800,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 72,000 COP (note only).'),
('CO','hair:hair-treatment','USD',2800,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 112,000 COP (note only).'),
('CO','makeup:day-makeup','USD',3100,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 124,000 COP (note only).'),
('CO','makeup:event-makeup','USD',4600,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 184,000 COP (note only).'),
('CO','makeup:bridal-makeup','USD',9000,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 360,000 COP (note only).'),
('AR','lashes:classic-lash-set','USD',3600,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 43,000 ARS (note only).'),
('AR','lashes:volume-lash-set','USD',4800,150,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 58,000 ARS (note only).'),
('AR','lashes:lash-lift','USD',2400,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 29,000 ARS (note only).'),
('AR','lashes:lash-refill','USD',2100,75,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 25,000 ARS (note only).'),
('AR','nails:manicure','USD',1000,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 12,000 ARS (note only).'),
('AR','nails:gel-manicure','USD',1500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 18,000 ARS (note only).'),
('AR','nails:acrylic-set','USD',2100,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 25,000 ARS (note only).'),
('AR','nails:pedicure','USD',1500,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 18,000 ARS (note only).'),
('AR','brows:brow-shaping','USD',900,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 10,800 ARS (note only).'),
('AR','brows:brow-lamination','USD',2200,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 26,000 ARS (note only).'),
('AR','brows:brow-tint','USD',800,30,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 9,600 ARS (note only).'),
('AR','hair:haircut','USD',1600,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 19,200 ARS (note only).'),
('AR','hair:color','USD',4500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 54,000 ARS (note only).'),
('AR','hair:blowout','USD',1500,45,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 18,000 ARS (note only).'),
('AR','hair:hair-treatment','USD',2400,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 29,000 ARS (note only).'),
('AR','makeup:day-makeup','USD',2700,60,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 32,000 ARS (note only).'),
('AR','makeup:event-makeup','USD',3900,90,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 47,000 ARS (note only).'),
('AR','makeup:bridal-makeup','USD',7500,120,'draft','Public price ranges, mid-market, 2026 (Claude draft, needs owner approval). Stored in USD, the talent-supported currency. Local equivalent about 90,000 ARS (note only).')
ON CONFLICT (country_code, service_key) DO NOTHING;
