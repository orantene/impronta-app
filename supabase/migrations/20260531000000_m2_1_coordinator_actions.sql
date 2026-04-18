-- M2.1 — Admin Workspace V3: coordinator engine actions.
-- Ref: docs/admin-workspace-spec.md §2.3, §2.3a, §4.3, §10; docs/admin-workspace-roadmap.md §M2.1.
--
-- Adds three SECURITY DEFINER RPCs that write to inquiry_coordinators +
-- inquiry_participants (thread membership) and emit canonical inquiry_events:
--
--   engine_add_secondary_coordinator
--   engine_remove_secondary_coordinator
--   engine_promote_to_primary
--
-- Why SQL RPCs (matching the Phase 2 pattern in 20260527000002_…):
--   public.inquiry_events REVOKEs INSERT/UPDATE/DELETE from authenticated, so
--   only SECURITY DEFINER helpers (engine_emit_event) may write the event
--   stream. Keeping the whole compound write (join-table + participants +
--   event) inside one RPC also gives us a single transactional unit + one
--   FOR UPDATE lock on the inquiry.
--
-- Rules enforced (spec §2.3a, §4.3):
--   • Primary removal directly is blocked — raises 'cannot_remove_primary'.
--     Callers promoteToPrimary(replacement) first, then removeSecondary(old).
--   • Thread membership is updated on every assignment/unassignment:
--       add    → inquiry_participants row created/reactivated (role=coordinator, status=active)
--       remove → existing row flipped to status='removed'
--           (inquiry_participants.status ENUM has no 'former_coordinator' value —
--            the logical "former coordinator" state lives in inquiry_coordinators.status)
--   • Every mutation is staff-gated (is_agency_staff()).
--   • Every mutation FOR UPDATEs the inquiry row so concurrent writers serialize.
--
-- Events emitted (visibility='staff_only', spec §4.3 — Phase 1 keeps internal
-- coordinator churn out of participant timelines):
--   secondary_coordinator_assigned
--   secondary_coordinator_unassigned
--   primary_coordinator_changed
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Schema change: drop `inquiry_participants_one_active_coordinator`
-- ─────────────────────────────────────────────────────────────────────────────
-- The partial unique index from 20260520101000_phase2_inquiry_participants.sql
-- (and re-asserted in 20260525000000_inquiry_participants_unique_membership.sql)
-- hard-capped active coordinators per inquiry at 1 — a Phase 2 assumption that
-- the Admin Workspace V3 multi-coordinator model (spec §2.3) invalidates.
--
-- `inquiry_participants_active_user_role_unique` on (inquiry_id, user_id, role)
-- WHERE status='active' still prevents the same user being double-active as a
-- coordinator on the same inquiry, which is the invariant we actually need.

BEGIN;

DROP INDEX IF EXISTS public.inquiry_participants_one_active_coordinator;

-- =============================================================================
-- 1. engine_add_secondary_coordinator
-- =============================================================================
CREATE OR REPLACE FUNCTION public.engine_add_secondary_coordinator(
  p_inquiry_id    UUID,
  p_user_id       UUID,
  p_actor_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq RECORD;
BEGIN
  -- Auth guard: caller must be the authenticated user AND agency staff.
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Lock inquiry row so concurrent coordinator changes serialize.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- If the user is already the active primary, this call is nonsensical —
  -- refuse it rather than silently demoting them.
  IF EXISTS (
    SELECT 1 FROM public.inquiry_coordinators
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id
      AND role       = 'primary'
      AND status     = 'active'
  ) THEN
    RAISE EXCEPTION 'already_primary';
  END IF;

  -- Install (or reactivate) the secondary coordinator row.
  -- The PK (inquiry_id, user_id) makes this ON CONFLICT unambiguous: if this
  -- user was previously any coordinator on this inquiry we flip them back to
  -- active secondary instead of creating a duplicate.
  INSERT INTO public.inquiry_coordinators (
    inquiry_id, user_id, role, status, assigned_at, assigned_by
  ) VALUES (
    p_inquiry_id, p_user_id, 'secondary', 'active', now(), p_actor_user_id
  )
  ON CONFLICT (inquiry_id, user_id) DO UPDATE
    SET role        = 'secondary',
        status      = 'active',
        assigned_at = EXCLUDED.assigned_at,
        assigned_by = EXCLUDED.assigned_by;

  -- Thread membership (spec §4.3): UPDATE-then-INSERT to avoid ON CONFLICT
  -- ambiguity between the two partial unique indexes covering (inquiry_id,
  -- user_id, role). If a historical coordinator participant row for this user
  -- exists (status='declined' / 'removed'), flip it back to 'active'.
  UPDATE public.inquiry_participants
    SET status      = 'active',
        removed_at  = NULL,
        accepted_at = COALESCE(accepted_at, now()),
        updated_at  = now()
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id
      AND role       = 'coordinator';

  IF NOT FOUND THEN
    INSERT INTO public.inquiry_participants (
      inquiry_id, user_id, role, status, accepted_at, added_by_user_id
    ) VALUES (
      p_inquiry_id, p_user_id, 'coordinator', 'active', now(), p_actor_user_id
    );
  END IF;

  -- Emit: secondary_coordinator_assigned (staff-only; internal org churn).
  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'secondary_coordinator_assigned',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object('target_user_id', p_user_id)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_add_secondary_coordinator(UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_add_secondary_coordinator(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- 2. engine_remove_secondary_coordinator
-- =============================================================================
-- Refuses to remove an active primary (spec §2.3a). To replace the primary,
-- callers must promoteToPrimary(replacement) first, then removeSecondary(old).
CREATE OR REPLACE FUNCTION public.engine_remove_secondary_coordinator(
  p_inquiry_id    UUID,
  p_user_id       UUID,
  p_actor_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq      RECORD;
  v_role   TEXT;
  v_status TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  SELECT role, status
    INTO v_role, v_status
    FROM public.inquiry_coordinators
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not_coordinator';
  END IF;

  -- Spec §2.3a — a primary coordinator cannot be removed directly.
  IF v_role = 'primary' AND v_status = 'active' THEN
    RAISE EXCEPTION 'cannot_remove_primary';
  END IF;

  -- Idempotent: already-removed secondary → no-op, no event.
  IF v_status = 'former_coordinator' THEN
    RETURN;
  END IF;

  -- Flip the join-table row to former_coordinator (row retained per spec §4.3).
  UPDATE public.inquiry_coordinators
    SET status = 'former_coordinator'
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id
      AND role       = 'secondary'
      AND status     = 'active';

  -- Flip the thread-membership row to removed (inquiry_participants.status
  -- ENUM has no 'former_coordinator' — 'removed' is the right analogue).
  UPDATE public.inquiry_participants
    SET status     = 'removed',
        removed_at = now(),
        updated_at = now()
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id
      AND role       = 'coordinator'
      AND status     IN ('invited', 'active');

  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'secondary_coordinator_unassigned',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object('target_user_id', p_user_id)
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_remove_secondary_coordinator(UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_remove_secondary_coordinator(UUID, UUID, UUID) TO authenticated;

-- =============================================================================
-- 3. engine_promote_to_primary
-- =============================================================================
-- Two-step swap (demote old primary → promote new primary) because the partial
-- unique index `inquiry_coordinators_primary_unique` on (inquiry_id)
-- WHERE role='primary' AND status='active' is evaluated per-row, not deferred.
-- A single-statement CASE update could transiently hold two primary+active
-- rows and fail the index check.
CREATE OR REPLACE FUNCTION public.engine_promote_to_primary(
  p_inquiry_id    UUID,
  p_user_id       UUID,
  p_actor_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq             RECORD;
  v_old_primary   UUID;
  v_target_role   TEXT;
  v_target_status TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Target must be an active secondary coordinator on this inquiry.
  SELECT role, status
    INTO v_target_role, v_target_status
    FROM public.inquiry_coordinators
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'not_coordinator';
  END IF;

  -- Idempotent: user is already the active primary → no-op, no event.
  IF v_target_role = 'primary' AND v_target_status = 'active' THEN
    RETURN;
  END IF;

  IF v_target_status <> 'active' THEN
    RAISE EXCEPTION 'target_not_active';
  END IF;

  -- Snapshot the current primary (if any) BEFORE mutating.
  SELECT user_id
    INTO v_old_primary
    FROM public.inquiry_coordinators
    WHERE inquiry_id = p_inquiry_id
      AND role       = 'primary'
      AND status     = 'active';

  -- Step 1: demote the current primary to secondary. Skipped when there is
  -- no active primary (edge case: unknown-world rows) — step 2 still runs.
  IF v_old_primary IS NOT NULL THEN
    UPDATE public.inquiry_coordinators
      SET role = 'secondary'
      WHERE inquiry_id = p_inquiry_id
        AND user_id    = v_old_primary
        AND role       = 'primary'
        AND status     = 'active';
  END IF;

  -- Step 2: promote the target to primary.
  UPDATE public.inquiry_coordinators
    SET role = 'primary'
    WHERE inquiry_id = p_inquiry_id
      AND user_id    = p_user_id
      AND status     = 'active';

  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'primary_coordinator_changed',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object(
      'old_primary_user_id', v_old_primary,
      'new_primary_user_id', p_user_id
    )
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_promote_to_primary(UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_promote_to_primary(UUID, UUID, UUID) TO authenticated;

COMMIT;
