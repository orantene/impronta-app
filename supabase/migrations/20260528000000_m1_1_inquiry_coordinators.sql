-- M1.1 — Admin Workspace V3: inquiry_coordinators join table (schema blocker).
-- Ref: docs/admin-workspace-spec.md §2.6, docs/admin-workspace-roadmap.md §M1.1.
--
-- Introduces the multi-coordinator model:
--   • exactly one primary+active coordinator per inquiry (enforced by partial unique index)
--   • 0..N secondary coordinators
--   • removed coordinators retained with status='former_coordinator'
--
-- `inquiries.coordinator_id` stays as the materialized "primary coordinator" pointer
-- during transition. Bidirectional trigger keeps the two in sync so existing read
-- paths keep working until they migrate to this table (cutover: M8.2).
--
-- Deviations from spec §2.6 illustrative SQL (intentional, documented):
--   1. FK on user_id targets public.profiles(id), not auth.users(id) — matches
--      the convention used by every other user_id column in this schema (including
--      inquiries.coordinator_id). profiles.id mirrors auth.users.id.
--   2. ON DELETE RESTRICT for user_id per spec (history preservation). This blocks
--      profile deletion for anyone who was ever a coordinator; acceptable for
--      Phase 1, revisit when a user-deletion flow is added.

-- =============================================================================
-- Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inquiry_coordinators (
  inquiry_id   UUID        NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE RESTRICT,
  role         TEXT        NOT NULL CHECK (role   IN ('primary', 'secondary')),
  status       TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'former_coordinator')),
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (inquiry_id, user_id)
);

COMMENT ON TABLE public.inquiry_coordinators IS
  'Multi-coordinator join per admin-workspace-spec §2.6. inquiries.coordinator_id stays materialized via sync trigger until M8.2 cutover.';

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_coordinators_primary_unique
  ON public.inquiry_coordinators (inquiry_id)
  WHERE role = 'primary' AND status = 'active';

CREATE INDEX IF NOT EXISTS inquiry_coordinators_inquiry_idx
  ON public.inquiry_coordinators (inquiry_id);

CREATE INDEX IF NOT EXISTS inquiry_coordinators_user_idx
  ON public.inquiry_coordinators (user_id);

-- =============================================================================
-- Backfill — every inquiry with a coordinator_id gets a primary+active row.
-- Safe to re-run: ON CONFLICT DO NOTHING handles any partially-applied state.
-- =============================================================================
INSERT INTO public.inquiry_coordinators (inquiry_id, user_id, role, status, assigned_at)
SELECT id,
       coordinator_id,
       'primary',
       'active',
       COALESCE(coordinator_assigned_at, created_at, now())
FROM public.inquiries
WHERE coordinator_id IS NOT NULL
ON CONFLICT (inquiry_id, user_id) DO NOTHING;

-- =============================================================================
-- Bidirectional sync triggers
-- =============================================================================

-- Direction A: inquiry_coordinators changes → inquiries.coordinator_id.
-- Finds the single primary+active row (guaranteed ≤1 by partial unique index) and
-- mirrors its user_id onto inquiries.coordinator_id. Sets NULL if no primary exists.
CREATE OR REPLACE FUNCTION public.inquiry_coordinators_sync_inquiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inquiry_id UUID := COALESCE(NEW.inquiry_id, OLD.inquiry_id);
  v_primary    UUID;
BEGIN
  SELECT user_id INTO v_primary
  FROM public.inquiry_coordinators
  WHERE inquiry_id = v_inquiry_id
    AND role       = 'primary'
    AND status     = 'active'
  LIMIT 1;

  -- Only write when value actually changes — avoids unnecessary work and prevents
  -- spurious Direction-B trigger firings.
  UPDATE public.inquiries
  SET coordinator_id = v_primary
  WHERE id = v_inquiry_id
    AND coordinator_id IS DISTINCT FROM v_primary;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiry_coordinators_sync_inquiry ON public.inquiry_coordinators;
CREATE TRIGGER trg_inquiry_coordinators_sync_inquiry
  AFTER INSERT OR UPDATE OR DELETE ON public.inquiry_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.inquiry_coordinators_sync_inquiry();

-- Direction B: inquiries.coordinator_id changes → inquiry_coordinators.
-- Demotes the existing primary (status → former_coordinator) and installs the new
-- one. Backward-compat for legacy writers that still UPDATE inquiries.coordinator_id
-- directly. Guards against recursion from Direction A via pg_trigger_depth().
CREATE OR REPLACE FUNCTION public.inquiries_sync_coordinator_table()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react to actual changes, and skip when this trigger was fired by our
  -- own Direction-A sync (which writes inquiries.coordinator_id as a read-model
  -- refresh, not an authoring action).
  IF NEW.coordinator_id IS NOT DISTINCT FROM OLD.coordinator_id THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Demote any existing primary+active row for this inquiry.
  UPDATE public.inquiry_coordinators
  SET status = 'former_coordinator'
  WHERE inquiry_id = NEW.id
    AND role       = 'primary'
    AND status     = 'active';

  -- Install the new primary. If the user was a former secondary/primary, flip
  -- them back to primary+active in place; otherwise create a fresh row.
  IF NEW.coordinator_id IS NOT NULL THEN
    INSERT INTO public.inquiry_coordinators (
      inquiry_id, user_id, role, status, assigned_at, assigned_by
    )
    VALUES (
      NEW.id, NEW.coordinator_id, 'primary', 'active', now(), auth.uid()
    )
    ON CONFLICT (inquiry_id, user_id) DO UPDATE
      SET role        = 'primary',
          status      = 'active',
          assigned_at = EXCLUDED.assigned_at,
          assigned_by = EXCLUDED.assigned_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_sync_coordinator_table ON public.inquiries;
CREATE TRIGGER trg_inquiries_sync_coordinator_table
  AFTER UPDATE OF coordinator_id ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.inquiries_sync_coordinator_table();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.inquiry_coordinators ENABLE ROW LEVEL SECURITY;

-- Staff: unrestricted access. Mirrors public.inquiries staff_all policy.
DROP POLICY IF EXISTS inquiry_coordinators_staff_all ON public.inquiry_coordinators;
CREATE POLICY inquiry_coordinators_staff_all ON public.inquiry_coordinators
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());

-- Non-staff read: rows for inquiries the user can already see (client-owner or
-- participant). This mirrors the visibility granted by existing inquiries RLS,
-- so we don't widen exposure — just propagate it to the join table.
DROP POLICY IF EXISTS inquiry_coordinators_select_visible ON public.inquiry_coordinators;
CREATE POLICY inquiry_coordinators_select_visible ON public.inquiry_coordinators
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_coordinators.inquiry_id
        AND i.client_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = inquiry_coordinators.inquiry_id
        AND ip.user_id    = auth.uid()
        AND ip.status IN ('invited', 'active')
    )
  );
