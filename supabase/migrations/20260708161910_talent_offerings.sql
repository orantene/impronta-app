-- Talent Services (storefront) — the unified offerings catalog.
-- One row per sellable/displayable "service" (kind: service|package|product).
-- Config layer ONLY: connects to money exclusively through
-- inquiry_offer_line_items.source_service_id (stamped with this id) and
-- inquiries.source_context. Charges always derive from the commission
-- snapshot, never from amount_cents.

BEGIN;

CREATE TABLE IF NOT EXISTS public.talent_offerings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id   uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id           uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  kind                text NOT NULL DEFAULT 'service'
                        CHECK (kind IN ('service','package','product')),
  title               text NOT NULL,
  description         text,
  -- Pricing: price_type mirrors inquiry_offer_line_items.pricing_unit 1:1.
  price_type          text NOT NULL DEFAULT 'flat_package'
                        CHECK (price_type IN ('hour','day','week','half_day','event',
                                              'per_person','per_contact','flat_package','custom')),
  -- exact = show the number · from = "from $X" · quote = no number (uncharge-able)
  price_display       text NOT NULL DEFAULT 'exact'
                        CHECK (price_display IN ('exact','from','quote')),
  amount_cents        bigint CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency            text NOT NULL DEFAULT 'USD',
  -- Selling mode the TALENT chooses per service:
  --   request = inquiry → chat → offer → booking (default, human-confirmed)
  --   instant = direct booking / reserve right away (requires a fixed price)
  booking_mode        text NOT NULL DEFAULT 'request'
                        CHECK (booking_mode IN ('request','instant')),
  -- Client may choose "pay at appointment" (cash/in person) instead of card.
  allow_pay_in_person boolean NOT NULL DEFAULT false,
  duration_minutes    int CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  category            text,
  -- null = unlimited (services); int = stock for products (Phase-3 checkout)
  inventory_qty       int CHECK (inventory_qty IS NULL OR inventory_qty >= 0),
  status              text NOT NULL DEFAULT 'published'
                        CHECK (status IN ('draft','published','archived')),
  visibility          text NOT NULL DEFAULT 'public'
                        CHECK (visibility IN ('public','agency_only','on_request')),
  -- Moderation is SILENT (never surfaced to the talent as a pending badge).
  moderation_state    text NOT NULL DEFAULT 'approved'
                        CHECK (moderation_state IN ('pending','approved','rejected')),
  is_featured         boolean NOT NULL DEFAULT false,
  sort_order          int NOT NULL DEFAULT 0,
  -- Long-tail sink: compliance notes, personalization specs, quote variables,
  -- variations/add-ons (MVP keeps them as jsonb sub-shapes, tables later).
  attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,
  title_i18n          jsonb,
  description_i18n    jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Instant booking demands a real fixed price (server guard duplicates this).
ALTER TABLE public.talent_offerings
  ADD CONSTRAINT talent_offerings_instant_needs_price
  CHECK (booking_mode <> 'instant'
         OR (amount_cents IS NOT NULL AND amount_cents > 0
             AND price_type <> 'custom' AND price_display = 'exact'));

CREATE INDEX IF NOT EXISTS idx_talent_offerings_profile_status
  ON public.talent_offerings (talent_profile_id, status, sort_order);
CREATE INDEX IF NOT EXISTS idx_talent_offerings_tenant
  ON public.talent_offerings (tenant_id) WHERE tenant_id IS NOT NULL;

-- Gallery: reuse media_assets wholesale (watermark/approval/public_url exist).
CREATE TABLE IF NOT EXISTS public.talent_offering_media (
  offering_id     uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  media_asset_id  uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  sort_order      int NOT NULL DEFAULT 0,
  PRIMARY KEY (offering_id, media_asset_id)
);

-- RLS: anon/public may read published, non-agency-only, approved offerings.
-- All writes go through service-role server actions with app-layer auth
-- (owner user_id match OR agency staff), mirroring services-menu-actions.
ALTER TABLE public.talent_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_offering_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY talent_offerings_public_read ON public.talent_offerings
  FOR SELECT USING (
    status = 'published'
    AND visibility IN ('public','on_request')
    AND moderation_state = 'approved'
  );

CREATE POLICY talent_offerings_owner_read ON public.talent_offerings
  FOR SELECT USING (
    talent_profile_id IN (
      SELECT tp.id FROM public.talent_profiles tp WHERE tp.user_id = auth.uid()
    )
  );

CREATE POLICY talent_offering_media_public_read ON public.talent_offering_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      WHERE o.id = offering_id
        AND o.status = 'published'
        AND o.visibility IN ('public','on_request')
        AND o.moderation_state = 'approved'
    )
  );

CREATE POLICY talent_offering_media_owner_read ON public.talent_offering_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      JOIN public.talent_profiles tp ON tp.id = o.talent_profile_id
      WHERE o.id = offering_id AND tp.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.talent_offerings IS
  'Talent Services storefront catalog (service|package|product). Config only — money flows through the inquiry/offer/booking rail via source_service_id.';

COMMIT;
