-- M2.2 — Admin Workspace V3: requirement group engine actions.
-- Ref: docs/admin-workspace-spec.md §3.5, §3.6 (post-booking lock), §3.7;
--      docs/admin-workspace-roadmap.md §M2.2.
--
-- Adds four SECURITY DEFINER RPCs that own every write to the
-- inquiry_requirement_groups table and the participants.requirement_group_id
-- column, plus the canonical event emissions:
--
--   engine_add_requirement_group
--   engine_update_requirement_group
--   engine_remove_requirement_group      (blocks when group_has_participants)
--   engine_assign_participant_to_group   (participant→group reassignment)
--
-- Why SQL RPCs (matching the Phase 2 pattern established in
-- 20260527000002_engine_rpcs_emit_events.sql and M2.1):
--   public.inquiry_events REVOKEs INSERT from `authenticated`, so only
--   SECURITY DEFINER helpers (engine_emit_event) may write the event stream.
--   Keeping the compound write (requirement_groups / participants + event)
--   in one RPC gives us a single transactional unit and one inquiry FOR
--   UPDATE lock per call.
--
-- Rules enforced (spec §3.6, §3.7):
--   • Every mutation is staff-gated via is_agency_staff().
--   • auth.uid() must match the declared actor (defence in depth vs RPC
--     spoofing).
--   • Post-booking lock: RAISE 'inquiry_booked_use_adjustment_flow' when
--     inquiries.status = 'booked' for add/update/remove group AND for
--     participant-group reassignment. (§3.6 non-negotiable.)
--   • Remove is blocked when ANY talent participant in status IN
--     ('invited','active') is still assigned to the group — RAISE
--     'group_has_participants'. Reassign first.
--   • Participant reassignment:
--       - participant must exist and belong to this inquiry
--       - participant.role must be 'talent' (non-talent participants are
--         never counted toward fulfillment and do not move between groups)
--       - group_id must resolve to a row on the same inquiry
--     Violations RAISE 'participant_not_on_inquiry' / 'not_talent_participant' /
--     'group_not_on_inquiry'.
--
-- Events emitted (visibility='staff_only' — internal operational churn,
-- not participant-facing):
--   requirement_group_added
--   requirement_group_updated
--   requirement_group_removed
--   participant_group_changed

BEGIN;

-- =============================================================================
-- 1. engine_add_requirement_group
-- =============================================================================
CREATE OR REPLACE FUNCTION public.engine_add_requirement_group(
  p_inquiry_id        UUID,
  p_role_key          TEXT,
  p_quantity_required INT,
  p_notes             TEXT,
  p_actor_user_id     UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq          RECORD;
  v_group_id   UUID;
  v_next_sort  INT;
BEGIN
  -- Auth guard.
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- quantity_required > 0 is also a table CHECK, but reject early with a clean
  -- message instead of a generic constraint violation.
  IF p_quantity_required IS NULL OR p_quantity_required <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.requirement_role_keys
    WHERE key = p_role_key AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_role_key';
  END IF;

  -- Lock the inquiry row — concurrent add/remove calls serialize.
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Spec §3.6 — post-booking lock. Non-negotiable.
  IF inq.status = 'booked' THEN
    RAISE EXCEPTION 'inquiry_booked_use_adjustment_flow';
  END IF;

  -- Append to the end of the group list by default.
  SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO v_next_sort
    FROM public.inquiry_requirement_groups
    WHERE inquiry_id = p_inquiry_id;

  INSERT INTO public.inquiry_requirement_groups (
    inquiry_id, role_key, quantity_required, notes, sort_order
  ) VALUES (
    p_inquiry_id, p_role_key, p_quantity_required, p_notes, v_next_sort
  )
  RETURNING id INTO v_group_id;

  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'requirement_group_added',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object(
      'group_id',          v_group_id,
      'role_key',          p_role_key,
      'quantity_required', p_quantity_required,
      'sort_order',        v_next_sort
    )
  );

  RETURN v_group_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_add_requirement_group(UUID, TEXT, INT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_add_requirement_group(UUID, TEXT, INT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 2. engine_update_requirement_group
-- =============================================================================
-- Patch-style update: NULL params mean "don't touch this field". All three
-- patchable fields are optional; a caller passing all three NULL is a no-op
-- that still emits an event (intentional — so callers can't silently fall
-- out of the observability stream). Callers that want no-op suppression
-- should skip the call client-side.
CREATE OR REPLACE FUNCTION public.engine_update_requirement_group(
  p_group_id          UUID,
  p_role_key          TEXT,  -- NULL = unchanged
  p_quantity_required INT,   -- NULL = unchanged
  p_notes             TEXT,  -- NULL = unchanged (explicit clear = empty string)
  p_actor_user_id     UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grp  RECORD;
  inq  RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO grp FROM public.inquiry_requirement_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT * INTO inq FROM public.inquiries WHERE id = grp.inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.status = 'booked' THEN
    RAISE EXCEPTION 'inquiry_booked_use_adjustment_flow';
  END IF;

  IF p_role_key IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.requirement_role_keys
      WHERE key = p_role_key AND archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'invalid_role_key';
    END IF;
  END IF;

  IF p_quantity_required IS NOT NULL AND p_quantity_required <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  UPDATE public.inquiry_requirement_groups
    SET role_key          = COALESCE(p_role_key, role_key),
        quantity_required = COALESCE(p_quantity_required, quantity_required),
        notes             = COALESCE(p_notes, notes)
    WHERE id = p_group_id;

  PERFORM public.engine_emit_event(
    grp.inquiry_id,
    'requirement_group_updated',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object(
      'group_id',                p_group_id,
      'role_key_changed',        p_role_key          IS NOT NULL,
      'quantity_changed',        p_quantity_required IS NOT NULL,
      'notes_changed',           p_notes             IS NOT NULL,
      'new_role_key',            p_role_key,
      'new_quantity_required',   p_quantity_required
    )
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_update_requirement_group(UUID, TEXT, INT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_update_requirement_group(UUID, TEXT, INT, TEXT, UUID) TO authenticated;

-- =============================================================================
-- 3. engine_remove_requirement_group
-- =============================================================================
-- Spec §3.7: "A group cannot be removed while participants are assigned to it.
-- Engine returns `{ success: false, reason: 'group_has_participants' }`."
--
-- We only count talent participants in ('invited','active') — removed/declined
-- rows that happen to still reference the group (because we used ON DELETE SET
-- NULL on the FK, not cascade) are not blocking. Non-talent rows are never
-- counted because they'll never be moved between requirement groups in Phase 1.
CREATE OR REPLACE FUNCTION public.engine_remove_requirement_group(
  p_group_id      UUID,
  p_actor_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  grp RECORD;
  inq RECORD;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO grp FROM public.inquiry_requirement_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT * INTO inq FROM public.inquiries WHERE id = grp.inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.status = 'booked' THEN
    RAISE EXCEPTION 'inquiry_booked_use_adjustment_flow';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inquiry_participants
    WHERE inquiry_id           = grp.inquiry_id
      AND requirement_group_id = p_group_id
      AND role                 = 'talent'
      AND status               IN ('invited', 'active')
  ) THEN
    RAISE EXCEPTION 'group_has_participants';
  END IF;

  DELETE FROM public.inquiry_requirement_groups WHERE id = p_group_id;

  PERFORM public.engine_emit_event(
    grp.inquiry_id,
    'requirement_group_removed',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object(
      'group_id',          p_group_id,
      'role_key',          grp.role_key,
      'quantity_required', grp.quantity_required
    )
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_remove_requirement_group(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_remove_requirement_group(UUID, UUID) TO authenticated;

-- =============================================================================
-- 4. engine_assign_participant_to_group
-- =============================================================================
-- Move a talent participant from their current group to p_group_id. If the
-- participant is already in the target group, no-op (no event, no log). If
-- p_group_id is NULL we explicitly reject — Phase 1 does not allow clearing
-- the group (spec §3.7: "Adding a participant requires a requirement_group_id").
CREATE OR REPLACE FUNCTION public.engine_assign_participant_to_group(
  p_participant_id UUID,
  p_group_id       UUID,
  p_actor_user_id  UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  part        RECORD;
  grp         RECORD;
  inq         RECORD;
  v_old_group UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.is_agency_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_required';
  END IF;

  SELECT * INTO part FROM public.inquiry_participants WHERE id = p_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'participant_not_found'; END IF;

  IF part.role <> 'talent' THEN
    RAISE EXCEPTION 'not_talent_participant';
  END IF;

  SELECT * INTO grp FROM public.inquiry_requirement_groups WHERE id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;

  -- Group must belong to the participant's inquiry (no cross-inquiry moves).
  IF grp.inquiry_id <> part.inquiry_id THEN
    RAISE EXCEPTION 'group_not_on_inquiry';
  END IF;

  -- Lock the inquiry and apply post-booking + frozen gates.
  SELECT * INTO inq FROM public.inquiries WHERE id = part.inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;
  IF inq.status = 'booked' THEN
    RAISE EXCEPTION 'inquiry_booked_use_adjustment_flow';
  END IF;

  v_old_group := part.requirement_group_id;

  -- No-op short-circuit. Returns without an event so repeated UI submissions
  -- don't flood the stream.
  IF v_old_group IS NOT DISTINCT FROM p_group_id THEN
    RETURN;
  END IF;

  UPDATE public.inquiry_participants
    SET requirement_group_id = p_group_id,
        updated_at           = now()
    WHERE id = p_participant_id;

  PERFORM public.engine_emit_event(
    part.inquiry_id,
    'participant_group_changed',
    p_actor_user_id,
    'admin',
    'staff_only',
    jsonb_build_object(
      'participant_id', p_participant_id,
      'old_group_id',   v_old_group,
      'new_group_id',   p_group_id
    )
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_assign_participant_to_group(UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_assign_participant_to_group(UUID, UUID, UUID) TO authenticated;

COMMIT;
