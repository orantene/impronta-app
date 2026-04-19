-- SaaS Phase 1 / P1.A.4 — public.agency_entitlements (plan limits + feature gates)
--                          + public.agency_usage_counters (metering)
--                          + tenant #1 defaults.
--
-- Ref: docs/saas/phase-0/01-entity-ownership-map.md §4,
--      docs/saas/phase-0/04-settings-inheritance.md §1 Layer 2,
--      Plan §4 (Ownership Model), §13 (Settings Inheritance).
--
-- Phase 8 wires billing (Stripe) to mutate entitlements. Phase 1 just creates
-- the tables and seeds generous defaults for tenant #1 so all current flows
-- keep running.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agency_entitlements (
  tenant_id                  UUID        PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  plan_key                   TEXT        NOT NULL DEFAULT 'legacy',
  ai_enabled                 BOOLEAN     NOT NULL DEFAULT FALSE,
  advanced_analytics         BOOLEAN     NOT NULL DEFAULT FALSE,
  white_label_email          BOOLEAN     NOT NULL DEFAULT FALSE,
  custom_css_allowed         BOOLEAN     NOT NULL DEFAULT FALSE,
  hub_participation_allowed  BOOLEAN     NOT NULL DEFAULT TRUE,
  max_staff_count            INT         NOT NULL DEFAULT 10,
  max_active_roster_size     INT         NOT NULL DEFAULT 500,
  max_domains                INT         NOT NULL DEFAULT 1,
  max_locales                INT         NOT NULL DEFAULT 2,
  max_custom_fields          INT         NOT NULL DEFAULT 0,
  support_tier               TEXT        NOT NULL DEFAULT 'standard'
                                           CHECK (support_tier IN ('standard','priority','enterprise')),
  trial_ends_at              TIMESTAMPTZ,
  plan_effective_from        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agency_entitlements IS
  'Plan-level defaults (Layer 2 of settings inheritance, deliverable 4). Platform writes only — agency cannot raise its own limits. Phase 8 wires billing mutations.';

ALTER TABLE public.agency_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_entitlements_staff_all ON public.agency_entitlements;
CREATE POLICY agency_entitlements_staff_all ON public.agency_entitlements
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

CREATE OR REPLACE FUNCTION public.agency_entitlements_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_entitlements_touch_updated_at ON public.agency_entitlements;
CREATE TRIGGER trg_agency_entitlements_touch_updated_at
  BEFORE UPDATE ON public.agency_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.agency_entitlements_touch_updated_at();

-- ---------------------------------------------------------------------------
-- agency_usage_counters — Zone 5 (derived). Never hand-edited.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agency_usage_counters (
  tenant_id     UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  counter_key   TEXT        NOT NULL,
  counter_value BIGINT      NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, counter_key)
);

COMMENT ON TABLE public.agency_usage_counters IS
  'Metering counters (Zone 5, derived). System-only writes. Never hand-edit. Populated by background jobs per Plan §21.';

ALTER TABLE public.agency_usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_usage_counters_staff_all ON public.agency_usage_counters;
CREATE POLICY agency_usage_counters_staff_all ON public.agency_usage_counters
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- ---------------------------------------------------------------------------
-- Seed tenant #1 entitlements + zero-counter baseline.
-- Generous defaults: tenant #1 is the incumbent; all existing features must
-- keep working. Platform billing (Phase 8) may tighten these later.
-- ---------------------------------------------------------------------------

INSERT INTO public.agency_entitlements (
  tenant_id, plan_key,
  ai_enabled, advanced_analytics, hub_participation_allowed,
  max_staff_count, max_active_roster_size, max_domains, max_locales, max_custom_fields,
  support_tier
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'legacy',
  TRUE, TRUE, TRUE,
  50, 2000, 5, 5, 100,
  'enterprise'
)
ON CONFLICT (tenant_id) DO UPDATE
  SET plan_key                   = EXCLUDED.plan_key,
      ai_enabled                 = EXCLUDED.ai_enabled,
      advanced_analytics         = EXCLUDED.advanced_analytics,
      hub_participation_allowed  = EXCLUDED.hub_participation_allowed,
      max_staff_count            = EXCLUDED.max_staff_count,
      max_active_roster_size     = EXCLUDED.max_active_roster_size,
      max_domains                = EXCLUDED.max_domains,
      max_locales                = EXCLUDED.max_locales,
      max_custom_fields          = EXCLUDED.max_custom_fields,
      support_tier               = EXCLUDED.support_tier,
      updated_at                 = now();

-- Initialise counters to zero; background job will refresh actuals later.
INSERT INTO public.agency_usage_counters (tenant_id, counter_key, counter_value)
VALUES
  ('00000000-0000-0000-0000-000000000001'::UUID, 'staff_count',            0),
  ('00000000-0000-0000-0000-000000000001'::UUID, 'active_roster_size',     0),
  ('00000000-0000-0000-0000-000000000001'::UUID, 'custom_fields_count',    0),
  ('00000000-0000-0000-0000-000000000001'::UUID, 'monthly_inquiries',      0)
ON CONFLICT (tenant_id, counter_key) DO NOTHING;

COMMIT;
