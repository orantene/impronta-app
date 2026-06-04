-- Waitlist / Alternates for an inquiry (Deep-plan W9).
--
-- A coordinator keeps a RANKED list of alternate talents per inquiry (optionally
-- scoped to one requirement group). When a booked/invited talent declines or is
-- removed and the group is short, the coordinator can PROMOTE an alternate into
-- the roster (engine promoteAlternate adds the talent as an 'invited'
-- inquiry_participant in the same requirement group and deletes the alternate
-- row).
--
-- Admin-only coordination tool for this wave — no client/talent-facing surface.
-- This table is config/queue only; the roster stays canonical on
-- inquiry_participants. Promotion reuses the existing add-to-roster engine path.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_alternates (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id            UUID        NOT NULL
                                      REFERENCES public.inquiries(id) ON DELETE CASCADE,
  tenant_id             UUID        NOT NULL
                                      REFERENCES public.agencies(id) ON DELETE CASCADE,
  requirement_group_id  UUID        REFERENCES public.inquiry_requirement_groups(id) ON DELETE SET NULL,
  talent_profile_id     UUID        NOT NULL
                                      REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  rank                  INTEGER     NOT NULL DEFAULT 0,
  note                  TEXT,
  added_by_user_id      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A given talent can only appear once in an inquiry's waitlist.
  CONSTRAINT inquiry_alternates_inquiry_talent_uniq UNIQUE (inquiry_id, talent_profile_id)
);

COMMENT ON TABLE public.inquiry_alternates IS
  'Per-inquiry ranked waitlist of alternate talents (Deep-plan W9). Admin-only coordination queue; the roster stays canonical on inquiry_participants. promoteAlternate adds the talent as an invited participant in the same requirement group and deletes the row.';

-- Read paths: ranked per inquiry, and per (inquiry, group).
CREATE INDEX IF NOT EXISTS inquiry_alternates_inquiry_rank_idx
  ON public.inquiry_alternates (inquiry_id, rank, created_at);
CREATE INDEX IF NOT EXISTS inquiry_alternates_group_idx
  ON public.inquiry_alternates (requirement_group_id);

ALTER TABLE public.inquiry_alternates ENABLE ROW LEVEL SECURITY;

-- Workspace staff manage their own tenant's waitlist (same predicate the rest
-- of the per-tenant inquiry tables use).
DROP POLICY IF EXISTS inquiry_alternates_staff_all ON public.inquiry_alternates;
CREATE POLICY inquiry_alternates_staff_all ON public.inquiry_alternates
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- Platform admins have full access for support/ops.
DROP POLICY IF EXISTS inquiry_alternates_platform_admin_all ON public.inquiry_alternates;
CREATE POLICY inquiry_alternates_platform_admin_all ON public.inquiry_alternates
  FOR ALL
  USING       (public.is_platform_admin())
  WITH CHECK  (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.inquiry_alternates_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_alternates_touch_updated_at ON public.inquiry_alternates;
CREATE TRIGGER trg_inquiry_alternates_touch_updated_at
  BEFORE UPDATE ON public.inquiry_alternates
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_alternates_touch_updated_at();

COMMIT;
