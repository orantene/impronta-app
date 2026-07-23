-- Talent Services — variants & add-ons (Lane D4).
--
-- Promotes per-offering OPTIONS (variants: size/tier/duration choices, one
-- picked) and EXTRAS (add-ons: zero or more stacked) from the attributes jsonb
-- sink to real tables, so the public selector, the engine's price resolution,
-- and offer-line expansion are schema-backed. MVP shape on purpose (label +
-- price + order): per-variant inventory/media/SKU stay in attributes until a
-- real seller needs them.

CREATE TABLE IF NOT EXISTS public.talent_offering_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  -- null = "base price" (the offering's own amount_cents applies).
  amount_cents int CHECK (amount_cents IS NULL OR amount_cents >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talent_offering_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  amount_cents int NOT NULL CHECK (amount_cents >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offering_variants_offering ON public.talent_offering_variants(offering_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_offering_addons_offering ON public.talent_offering_addons(offering_id, sort_order);

-- RLS mirrors talent_offerings: anon may read children of publicly visible
-- offerings; the owning talent may read their own; writes are service-role
-- server actions (app-layer auth, same as the parent table).
ALTER TABLE public.talent_offering_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_offering_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offering_variants_public_read ON public.talent_offering_variants;
CREATE POLICY offering_variants_public_read ON public.talent_offering_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      WHERE o.id = offering_id
        AND o.status = 'published'
        AND o.visibility IN ('public','on_request')
        AND o.moderation_state = 'approved'
    )
  );
DROP POLICY IF EXISTS offering_variants_owner_read ON public.talent_offering_variants;
CREATE POLICY offering_variants_owner_read ON public.talent_offering_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      JOIN public.talent_profiles tp ON tp.id = o.talent_profile_id
      WHERE o.id = offering_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS offering_addons_public_read ON public.talent_offering_addons;
CREATE POLICY offering_addons_public_read ON public.talent_offering_addons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      WHERE o.id = offering_id
        AND o.status = 'published'
        AND o.visibility IN ('public','on_request')
        AND o.moderation_state = 'approved'
    )
  );
DROP POLICY IF EXISTS offering_addons_owner_read ON public.talent_offering_addons;
CREATE POLICY offering_addons_owner_read ON public.talent_offering_addons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.talent_offerings o
      JOIN public.talent_profiles tp ON tp.id = o.talent_profile_id
      WHERE o.id = offering_id AND tp.user_id = auth.uid()
    )
  );
