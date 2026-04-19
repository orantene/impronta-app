-- SaaS Phase 7 / P7.1 — talent_representation_requests
--
-- Ref: docs/saas/phase-0/03-state-machines.md §6 (Representation request lifecycle),
--      docs/saas/phase-0/01-entity-ownership-map.md §4,
--      Plan §11–11.5 (L9, L41, L42, L44).
--
-- Unified governed request model. One table, one state machine, two reviewer
-- populations keyed by `target_type`:
--   'agency' → talent applies to an agency roster. Reviewer: staff of target_id
--              tenant with manage_talent_roster. Effectuation: upsert a pending
--              row in agency_talent_roster.
--   'hub'    → hub-visibility request. Reviewer: platform admin only.
--              Effectuation: flip agency_talent_roster.hub_visibility_status
--              to 'approved' on the talent's primary roster row under the hub.
--
-- Agency-invites-existing-talent is a **different** flow (§7) and does NOT
-- write to this table. This is self-selection / governed-request territory only.

BEGIN;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_representation_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who is being represented / published.
  talent_profile_id     UUID        NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,

  -- Target surface.
  target_type           TEXT        NOT NULL
                                      CHECK (target_type IN ('agency', 'hub')),
  --   target_type='agency' → references agencies(id).
  --   target_type='hub'    → references agencies(id) of the hub tenant
  --                           (e.g. Impronta hub = tenant #1). A future row
  --                           with a different target_id represents a
  --                           different hub surface (L44).
  target_id             UUID        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- State machine (Phase 0 §6).
  status                TEXT        NOT NULL DEFAULT 'requested'
                                      CHECK (status IN (
                                        'requested', 'under_review',
                                        'accepted', 'rejected', 'withdrawn'
                                      )),

  -- Reason surfaced to requester on rejection (optional on others).
  reviewer_reason       TEXT,

  -- Requester provenance.
  requested_by          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  requester_note        TEXT,

  -- Reviewer provenance (set on pick-up, approve, reject, withdraw-by-platform).
  reviewed_by           UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  picked_up_by          UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  picked_up_at          TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_representation_requests IS
  'Unified governed request model for talent→agency applications and hub visibility submissions. One state machine, reviewer population derived from target_type. Replaces the legacy separate hub_visibility_requests concept (docs/saas/phase-0/03-state-machines.md §6, L44).';

COMMENT ON COLUMN public.talent_representation_requests.target_type IS
  '''agency'' = talent self-applies to agency roster. ''hub'' = hub visibility submission (platform-reviewed). L42: agency admins CANNOT approve hub requests by default.';

COMMENT ON COLUMN public.talent_representation_requests.target_id IS
  'References agencies(id). For target_type=''hub'' this is the hub tenant (Impronta hub = tenant #1).';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- A talent cannot have two active (requested|under_review) rows for the same
-- (talent_profile_id, target_type, target_id). Historical rows allowed.
-- (Phase 0 §6 rule)
CREATE UNIQUE INDEX IF NOT EXISTS talent_representation_requests_active_uniq
  ON public.talent_representation_requests (talent_profile_id, target_type, target_id)
  WHERE status IN ('requested', 'under_review');

-- Reviewer queue lookup by target.
CREATE INDEX IF NOT EXISTS talent_representation_requests_target_idx
  ON public.talent_representation_requests (target_type, target_id, status);

-- Talent drill-down (their submission history).
CREATE INDEX IF NOT EXISTS talent_representation_requests_talent_idx
  ON public.talent_representation_requests (talent_profile_id, status);

-- Reviewer workload.
CREATE INDEX IF NOT EXISTS talent_representation_requests_open_queue_idx
  ON public.talent_representation_requests (target_type, status, requested_at)
  WHERE status IN ('requested', 'under_review');

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talent_representation_requests_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_representation_requests_touch_updated_at
  ON public.talent_representation_requests;
CREATE TRIGGER trg_talent_representation_requests_touch_updated_at
  BEFORE UPDATE ON public.talent_representation_requests
  FOR EACH ROW EXECUTE FUNCTION public.talent_representation_requests_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_representation_requests ENABLE ROW LEVEL SECURITY;

-- READ: visible to
--   (a) platform admins (always),
--   (b) the talent themselves (via their profile → talent_profiles.user_id),
--   (c) staff of the target tenant (applies to both 'agency' and 'hub' target
--       types — a hub's staff may review its hub requests; an agency's staff
--       may review their own agency applications).
DROP POLICY IF EXISTS talent_representation_requests_read
  ON public.talent_representation_requests;
CREATE POLICY talent_representation_requests_read
  ON public.talent_representation_requests
  FOR SELECT
  USING (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(target_id)
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_representation_requests.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- INSERT: created by
--   (a) the talent themselves,
--   (b) staff of the target tenant (agency admin submitting on behalf, or
--       platform staff creating on behalf),
--   (c) platform admins.
-- requested_by must match auth.uid() for normal inserts (app enforces this).
DROP POLICY IF EXISTS talent_representation_requests_insert
  ON public.talent_representation_requests;
CREATE POLICY talent_representation_requests_insert
  ON public.talent_representation_requests
  FOR INSERT
  WITH CHECK (
    public.is_platform_admin()
    OR public.is_staff_of_tenant(target_id)
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_representation_requests.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- UPDATE: transitions are gated by target_type.
--   'agency' → staff of target_id (reviewer role + manage_talent_roster is
--               checked in app; RLS gates tenant scope only).
--   'hub'    → platform admins ONLY (L42 — agency admins cannot approve hub).
--   Requesters may withdraw their own requests (app enforces the `withdrawn`
--   transition specifically; RLS only restricts who may touch the row at all).
DROP POLICY IF EXISTS talent_representation_requests_update
  ON public.talent_representation_requests;
CREATE POLICY talent_representation_requests_update
  ON public.talent_representation_requests
  FOR UPDATE
  USING (
    public.is_platform_admin()
    OR (
      target_type = 'agency'
      AND public.is_staff_of_tenant(target_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_representation_requests.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      target_type = 'agency'
      AND public.is_staff_of_tenant(target_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_representation_requests.talent_profile_id
        AND tp.user_id = auth.uid()
    )
  );

-- DELETE: platform admins only (normal flow uses `withdrawn`, not delete).
DROP POLICY IF EXISTS talent_representation_requests_delete
  ON public.talent_representation_requests;
CREATE POLICY talent_representation_requests_delete
  ON public.talent_representation_requests
  FOR DELETE
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Effectuation trigger: on `accepted` transition, mirror into
-- agency_talent_roster per target_type (Phase 0 §6 side-effect table).
--
-- We do side-effects in a BEFORE UPDATE trigger SECURITY DEFINER style so
-- platform reviewers approving hub requests can write agency_talent_roster
-- rows they don't own directly. Tenant integrity is preserved because the
-- effectuation follows target_id, not a caller-chosen tenant.
--
-- 'agency' effectuation:
--   Upsert agency_talent_roster (target_id, talent_profile_id) to
--   status='pending', source_type='freelancer_claimed' (talent applied),
--   agency_visibility='roster_only'.
--
-- 'hub' effectuation:
--   Set hub_visibility_status='approved' on the talent's primary roster row
--   under the hub tenant (target_id). If no such row exists, create one with
--   source_type='platform_assigned', status='active',
--   agency_visibility='roster_only'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.talent_representation_requests_effectuate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  IF NEW.target_type = 'agency' THEN
    -- Prefer an existing LIVE roster row (partial unique guarantees ≤1).
    UPDATE public.agency_talent_roster
       SET updated_at = now()
     WHERE tenant_id = NEW.target_id
       AND talent_profile_id = NEW.talent_profile_id
       AND status IN ('pending', 'active', 'inactive');

    IF NOT FOUND THEN
      -- No live row. Reactivate the most recent removed row if any, else insert.
      WITH latest_removed AS (
        SELECT id FROM public.agency_talent_roster
         WHERE tenant_id = NEW.target_id
           AND talent_profile_id = NEW.talent_profile_id
           AND status = 'removed'
         ORDER BY removed_at DESC NULLS LAST
         LIMIT 1
      )
      UPDATE public.agency_talent_roster r
         SET status     = 'pending',
             removed_at = NULL,
             removed_by = NULL,
             added_by   = COALESCE(NEW.reviewed_by, r.added_by),
             added_at   = now(),
             updated_at = now()
       WHERE r.id = (SELECT id FROM latest_removed);

      IF NOT FOUND THEN
        INSERT INTO public.agency_talent_roster (
          tenant_id, talent_profile_id,
          source_type, status, agency_visibility, hub_visibility_status,
          is_primary, added_by, added_at
        )
        VALUES (
          NEW.target_id, NEW.talent_profile_id,
          'freelancer_claimed', 'pending', 'roster_only', 'not_submitted',
          FALSE, NEW.reviewed_by, now()
        );
      END IF;
    END IF;

  ELSIF NEW.target_type = 'hub' THEN
    -- Flip hub_visibility_status on the talent's live roster row under this
    -- hub tenant. If none, create a platform-owned roster row.
    UPDATE public.agency_talent_roster
       SET hub_visibility_status = 'approved',
           updated_at = now()
     WHERE tenant_id = NEW.target_id
       AND talent_profile_id = NEW.talent_profile_id
       AND status IN ('pending', 'active');

    IF NOT FOUND THEN
      INSERT INTO public.agency_talent_roster (
        tenant_id, talent_profile_id,
        source_type, status, agency_visibility, hub_visibility_status,
        is_primary, added_by, added_at
      )
      VALUES (
        NEW.target_id, NEW.talent_profile_id,
        'platform_assigned', 'active', 'roster_only', 'approved',
        FALSE, NEW.reviewed_by, now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_representation_requests_effectuate
  ON public.talent_representation_requests;
CREATE TRIGGER trg_talent_representation_requests_effectuate
  AFTER UPDATE ON public.talent_representation_requests
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status <> 'accepted')
  EXECUTE FUNCTION public.talent_representation_requests_effectuate();

COMMIT;
