-- M1.2 — Admin Workspace V3: inquiry_requirement_groups + participant column.
-- Ref: docs/admin-workspace-spec.md §3.5, docs/admin-workspace-roadmap.md §M1.2.
--
-- Introduces the multi-role roster model:
--   • one or more requirement groups per inquiry (host, model, promoter, talent …)
--   • each talent participant will belong to exactly one group (engine rule, enforced in M5)
--   • requirement_group_id on inquiry_participants is nullable during transition —
--     M5.6 flips it to NOT NULL after all drill-downs and engine writes land.
--
-- Scope for M1.2 is strictly schema + backfill + read helper. No engine code, no UI.
--
-- Seed source for role_key: the spec calls it "taxonomy-governed." To avoid
-- expanding the public.taxonomy_kind enum (which would ripple across unrelated
-- schemas), this uses a tiny dedicated lookup `requirement_role_keys` keyed by
-- TEXT, with the 4 canonical values from the roadmap seeded on migrate.

-- =============================================================================
-- Lookup — requirement_role_keys
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.requirement_role_keys (
  key          TEXT        PRIMARY KEY,
  label_en     TEXT        NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0,
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.requirement_role_keys IS
  'Platform-controlled taxonomy of requirement group roles (hosts, models, promoters, talent …). Referenced by inquiry_requirement_groups.role_key.';

INSERT INTO public.requirement_role_keys (key, label_en, sort_order) VALUES
  ('talent',    'Talent',    10),
  ('hosts',     'Hosts',     20),
  ('models',    'Models',    30),
  ('promoters', 'Promoters', 40)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.requirement_role_keys ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can see role keys (needed for dropdowns in M4/M5).
DROP POLICY IF EXISTS requirement_role_keys_authenticated_read ON public.requirement_role_keys;
CREATE POLICY requirement_role_keys_authenticated_read ON public.requirement_role_keys
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Write: super_admin only. Agency staff can read but not modify the taxonomy.
DROP POLICY IF EXISTS requirement_role_keys_admin_write ON public.requirement_role_keys;
CREATE POLICY requirement_role_keys_admin_write ON public.requirement_role_keys
  FOR ALL
  USING       (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.app_role = 'super_admin'))
  WITH CHECK  (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.app_role = 'super_admin'));

-- =============================================================================
-- Table — inquiry_requirement_groups
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inquiry_requirement_groups (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id        UUID        NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  role_key          TEXT        NOT NULL REFERENCES public.requirement_role_keys(key) ON UPDATE CASCADE,
  quantity_required INT         NOT NULL CHECK (quantity_required > 0),
  notes             TEXT,
  sort_order        INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.inquiry_requirement_groups IS
  'One row per requirement group per inquiry (spec §3.5). Every talent participant will belong to exactly one group (enforced NOT NULL in M5.6).';

CREATE INDEX IF NOT EXISTS inquiry_requirement_groups_inquiry_idx
  ON public.inquiry_requirement_groups (inquiry_id);

-- updated_at maintenance.
CREATE OR REPLACE FUNCTION public.inquiry_requirement_groups_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_requirement_groups_touch_updated_at
  ON public.inquiry_requirement_groups;
CREATE TRIGGER trg_inquiry_requirement_groups_touch_updated_at
  BEFORE UPDATE ON public.inquiry_requirement_groups
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_requirement_groups_touch_updated_at();

-- =============================================================================
-- Participant column — inquiry_participants.requirement_group_id (nullable)
-- =============================================================================
ALTER TABLE public.inquiry_participants
  ADD COLUMN IF NOT EXISTS requirement_group_id UUID
    REFERENCES public.inquiry_requirement_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inquiry_participants_requirement_group_idx
  ON public.inquiry_participants (requirement_group_id);

-- =============================================================================
-- Backfill
--
-- Step 1. One default requirement group per inquiry:
--         role_key='talent', quantity_required = GREATEST(count(talent participants), 1),
--         sort_order=0. GREATEST protects the CHECK > 0 for inquiries with no talent yet.
-- Step 2. Assign every participant to its inquiry's group (role='talent' or otherwise).
--         The M5.6 NOT NULL gate requires every participant row to be grouped; assigning
--         non-talent rows to the default group is harmless (they're ignored by roster
--         counters which filter on role='talent').
-- Both steps are idempotent — safe to re-run.
-- =============================================================================

INSERT INTO public.inquiry_requirement_groups (inquiry_id, role_key, quantity_required, sort_order)
SELECT
  i.id,
  'talent',
  GREATEST(
    (SELECT COUNT(*) FROM public.inquiry_participants p
      WHERE p.inquiry_id = i.id AND p.role = 'talent'),
    1
  ),
  0
FROM public.inquiries i
WHERE NOT EXISTS (
  SELECT 1 FROM public.inquiry_requirement_groups g WHERE g.inquiry_id = i.id
);

UPDATE public.inquiry_participants p
SET requirement_group_id = g.id
FROM (
  SELECT DISTINCT ON (inquiry_id) id, inquiry_id
  FROM public.inquiry_requirement_groups
  ORDER BY inquiry_id, sort_order ASC, created_at ASC
) g
WHERE p.inquiry_id = g.inquiry_id
  AND p.requirement_group_id IS NULL;

-- =============================================================================
-- RLS — inquiry_requirement_groups
-- =============================================================================
ALTER TABLE public.inquiry_requirement_groups ENABLE ROW LEVEL SECURITY;

-- Staff: unrestricted.
DROP POLICY IF EXISTS inquiry_requirement_groups_staff_all ON public.inquiry_requirement_groups;
CREATE POLICY inquiry_requirement_groups_staff_all ON public.inquiry_requirement_groups
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Non-staff read: rows for inquiries the user can already see (client-owner or
-- active/invited participant). Same visibility model used by inquiry_coordinators
-- so we don't widen exposure.
DROP POLICY IF EXISTS inquiry_requirement_groups_select_visible ON public.inquiry_requirement_groups;
CREATE POLICY inquiry_requirement_groups_select_visible ON public.inquiry_requirement_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_requirement_groups.inquiry_id
        AND i.client_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = inquiry_requirement_groups.inquiry_id
        AND ip.user_id    = auth.uid()
        AND ip.status IN ('invited', 'active')
    )
  );
