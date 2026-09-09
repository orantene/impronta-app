-- M3: tax categories (structure only) + entitlement credit ledger + modifier groups.
-- Operator-entered rates only. Zero stays honest until configured.
-- Person-time stays off this ledger.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tax_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Operator-entered rate in basis points (1000 = 10%). NULL means unset / zero.
  rate_bps INTEGER CHECK (rate_bps IS NULL OR (rate_bps >= 0 AND rate_bps <= 100000)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

COMMENT ON TABLE public.tax_categories IS
  'Tax structure only. rate_bps is operator-entered; invent no jurisdiction rule. orders.tax_cents stays 0 until a rate is configured.';

CREATE TABLE IF NOT EXISTS public.catalog_modifier_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  offering_id UUID NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INTEGER CHECK (max_select IS NULL OR max_select >= 1),
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (max_select IS NULL OR max_select >= min_select)
);

CREATE TABLE IF NOT EXISTS public.catalog_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.catalog_modifier_groups(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  incompatible_with UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entitlement_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  lesson_package_id UUID REFERENCES public.lesson_packages(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN ('issued', 'reserved', 'consumed', 'restored', 'expired')),
  units INTEGER NOT NULL CHECK (units > 0),
  reserved_by_booking_id UUID REFERENCES public.agency_bookings(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entitlement_credits_customer_idx
  ON public.entitlement_credits (tenant_id, customer_id, state);

COMMENT ON TABLE public.entitlement_credits IS
  'Generalises lesson_packages: a credit may be reserved by a booking before attendance consumes it.';

ALTER TABLE public.tax_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_credits ENABLE ROW LEVEL SECURITY;

COMMIT;
