-- T1-07: publishing an offering must not silently invent when someone works.
--
-- THE DEFECT. ensureDefaultBookingHours wrote Mon-Fri 09:00-17:00 UTC straight
-- into talent_booking_hours on first publish. Nobody agreed to those hours or
-- that timezone, and the public slots endpoint then offered them to strangers
-- as if a human had set them.
--
-- THE FIX. A publish (or a staff suggestion) writes a PROPOSAL, never hours.
-- An operator reviews it and accepts with their own timezone in one action.
-- An unreviewed profile keeps answering "no booking hours" to the public
-- endpoint, which is the honest answer.
--
-- Timestamp sorts after 20261230002200 (the latest journeys migration on this
-- branch). Do not use today's real calendar date for the filename prefix —
-- see the note in 20261230000700_journeys_atomic_rpcs.sql: migrations on this
-- branch are ordered by an artificial forward date, not by the day they were
-- authored.
--
-- Do not apply this file to production by hand unless the target is the
-- isolated qa-journeys branch. The production pointer is CI-gated; this
-- migration ships with the branch.

BEGIN;

-- ── talent_booking_hours_proposals ──────────────────────────────────────────
-- One open proposal per talent, mirroring the talent_booking_hours singleton
-- shape. `timezone` is nullable and NEVER defaults to UTC: an unresolved
-- timezone must stay visibly absent, not silently become the wrong one.

CREATE TABLE IF NOT EXISTS public.talent_booking_hours_proposals (
  talent_profile_id   UUID PRIMARY KEY
    REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  tenant_id            UUID NOT NULL
    REFERENCES public.agencies(id) ON DELETE CASCADE,
  timezone             TEXT,
  weekly               JSONB NOT NULL DEFAULT '{}'::jsonb,
  exceptions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  slot_minutes         INTEGER NOT NULL DEFAULT 30
    CHECK (slot_minutes > 0 AND slot_minutes <= 480),
  buffer_before_min    INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_before_min >= 0 AND buffer_before_min <= 240),
  buffer_after_min     INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_after_min >= 0 AND buffer_after_min <= 240),
  min_notice_min       INTEGER NOT NULL DEFAULT 120
    CHECK (min_notice_min >= 0),
  horizon_days         INTEGER NOT NULL DEFAULT 60
    CHECK (horizon_days > 0 AND horizon_days <= 365),
  source               TEXT NOT NULL
    CHECK (source IN ('publish_default', 'staff_suggestion')),
  status               TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'accepted', 'dismissed')),
  proposed_by_user_id  UUID,
  proposed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by_user_id   UUID,
  decided_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.talent_booking_hours_proposals IS
  'T1-07: a proposed weekly calendar awaiting operator review. Never read by the public slots endpoint. Accepted only through accept_booking_hours_proposal, which refuses when talent_booking_hours already has a row.';

COMMENT ON COLUMN public.talent_booking_hours_proposals.timezone IS
  'Nullable on purpose: an unresolved tenant timezone must stay null, never default to UTC.';

CREATE INDEX IF NOT EXISTS idx_talent_booking_hours_proposals_tenant
  ON public.talent_booking_hours_proposals (tenant_id);

ALTER TABLE public.talent_booking_hours_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_booking_hours_proposals_select_self ON public.talent_booking_hours_proposals;
CREATE POLICY talent_booking_hours_proposals_select_self ON public.talent_booking_hours_proposals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
      WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS talent_booking_hours_proposals_select_staff ON public.talent_booking_hours_proposals;
CREATE POLICY talent_booking_hours_proposals_select_staff ON public.talent_booking_hours_proposals
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

-- Writes are service_role only: no INSERT/UPDATE/DELETE policy for
-- authenticated at all, plus an explicit revoke so a future permissive grant
-- cannot quietly open a write path.
REVOKE ALL ON public.talent_booking_hours_proposals FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.talent_booking_hours_proposals FROM authenticated;
GRANT SELECT ON public.talent_booking_hours_proposals TO authenticated;
GRANT ALL ON public.talent_booking_hours_proposals TO service_role;

CREATE OR REPLACE FUNCTION public.talent_booking_hours_proposals_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_booking_hours_proposals_touch ON public.talent_booking_hours_proposals;
CREATE TRIGGER talent_booking_hours_proposals_touch
  BEFORE UPDATE ON public.talent_booking_hours_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.talent_booking_hours_proposals_touch();

-- ── accept_booking_hours_proposal ───────────────────────────────────────────
-- Copies a 'proposed' row into talent_booking_hours. Refuses 'hours_exist'
-- when a calendar is already there (a deliberate calendar must never be
-- overwritten by a stale proposal) and 'timezone_required' when neither the
-- proposal nor the operator's override carries a timezone. The ON CONFLICT
-- DO NOTHING on the target PK is the actual race guard: two concurrent
-- accepts (or an accept racing a direct hours save) cannot both win.

CREATE OR REPLACE FUNCTION public.accept_booking_hours_proposal(
  p_talent_profile_id UUID,
  p_actor_id           UUID,
  p_overrides          JSONB
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal public.talent_booking_hours_proposals%ROWTYPE;
  v_timezone TEXT;
  v_weekly JSONB;
  v_exceptions JSONB;
  v_slot_minutes INTEGER;
  v_buffer_before INTEGER;
  v_buffer_after INTEGER;
  v_min_notice INTEGER;
  v_horizon INTEGER;
  v_inserted INTEGER := 0;
BEGIN
  IF p_talent_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_proposal
    FROM public.talent_booking_hours_proposals
   WHERE talent_profile_id = p_talent_profile_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Deliberately NOT gated on v_proposal.status = 'proposed': the two
  -- refusals the caller needs to distinguish are hours_exist and
  -- timezone_required, both below. A proposal already accepted resolves to
  -- hours_exist via the conflict target; there is no separate "stale
  -- proposal" reason to invent.
  v_timezone := NULLIF(trim(COALESCE(p_overrides->>'timezone', v_proposal.timezone, '')), '');
  IF v_timezone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'timezone_required');
  END IF;

  v_weekly := COALESCE(p_overrides->'weekly', v_proposal.weekly);
  v_exceptions := COALESCE(p_overrides->'exceptions', v_proposal.exceptions);
  v_slot_minutes := COALESCE(NULLIF(p_overrides->>'slot_minutes', '')::integer, v_proposal.slot_minutes);
  v_buffer_before := COALESCE(NULLIF(p_overrides->>'buffer_before_min', '')::integer, v_proposal.buffer_before_min);
  v_buffer_after := COALESCE(NULLIF(p_overrides->>'buffer_after_min', '')::integer, v_proposal.buffer_after_min);
  v_min_notice := COALESCE(NULLIF(p_overrides->>'min_notice_min', '')::integer, v_proposal.min_notice_min);
  v_horizon := COALESCE(NULLIF(p_overrides->>'horizon_days', '')::integer, v_proposal.horizon_days);

  -- Lock semantics: talent_booking_hours PK is talent_profile_id, so the
  -- conflict target below IS the "hours already exist" check, race-free.
  INSERT INTO public.talent_booking_hours (
    talent_profile_id, tenant_id, timezone, weekly, exceptions,
    slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days
  ) VALUES (
    v_proposal.talent_profile_id, v_proposal.tenant_id, v_timezone, v_weekly, v_exceptions,
    v_slot_minutes, v_buffer_before, v_buffer_after, v_min_notice, v_horizon
  )
  ON CONFLICT (talent_profile_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hours_exist');
  END IF;

  UPDATE public.talent_booking_hours_proposals
     SET status = 'accepted',
         decided_by_user_id = p_actor_id,
         decided_at = now()
   WHERE talent_profile_id = p_talent_profile_id
     AND status = 'proposed';

  RETURN jsonb_build_object(
    'ok', true,
    'talent_profile_id', v_proposal.talent_profile_id,
    'timezone', v_timezone
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_booking_hours_proposal(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_hours_proposal(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.accept_booking_hours_proposal(uuid, uuid, jsonb) IS
  'T1-07: copy a proposed calendar into talent_booking_hours. Refuses hours_exist (row already there) and timezone_required (neither the proposal nor the override carries one). ON CONFLICT DO NOTHING on the hours PK is the race guard.';

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.accept_booking_hours_proposal(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.accept_booking_hours_proposal(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'accept_booking_hours_proposal is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

-- ── Executable proof ─────────────────────────────────────────────────────
-- Builds its own throwaway tenant + talent (no dependency on seeded fixture
-- data), exercises the proposal lifecycle end to end, and deletes everything
-- it created before COMMIT so nothing it wrote survives this migration.

DO $proof$
DECLARE
  v_tenant UUID;
  v_talent UUID;
  v_actor UUID := gen_random_uuid();
  v_result JSONB;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('t1-07-proof-' || substr(gen_random_uuid()::text, 1, 8), 'T1-07 Proof Tenant')
  RETURNING id INTO v_tenant;

  INSERT INTO public.talent_profiles (profile_code, created_by_agency_id, profile_kind)
  VALUES ('t1-07-proof-' || substr(gen_random_uuid()::text, 1, 8), v_tenant, 'person')
  RETURNING id INTO v_talent;

  -- 1. No proposal yet: accept refuses not_found.
  v_result := public.accept_booking_hours_proposal(v_talent, v_actor, '{}'::jsonb);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION 'expected not_found with no proposal, got %', v_result;
  END IF;

  -- 2. A proposal with a null timezone (publish_default, unresolved tenant tz)
  --    and no override: accept refuses timezone_required.
  INSERT INTO public.talent_booking_hours_proposals (
    talent_profile_id, tenant_id, timezone, weekly, source
  ) VALUES (
    v_talent, v_tenant, NULL, '{"1":[{"startMin":540,"endMin":1020}]}'::jsonb, 'publish_default'
  );

  v_result := public.accept_booking_hours_proposal(v_talent, v_actor, '{}'::jsonb);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'timezone_required' THEN
    RAISE EXCEPTION 'expected timezone_required with no timezone anywhere, got %', v_result;
  END IF;

  -- 3. The operator supplies a timezone via override: accept succeeds, hours
  --    row appears, proposal flips to accepted.
  v_result := public.accept_booking_hours_proposal(
    v_talent, v_actor, jsonb_build_object('timezone', 'America/Mexico_City')
  );
  IF (v_result->>'ok')::boolean IS NOT TRUE OR v_result->>'timezone' <> 'America/Mexico_City' THEN
    RAISE EXCEPTION 'expected accept to succeed with an override timezone, got %', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.talent_booking_hours
     WHERE talent_profile_id = v_talent AND timezone = 'America/Mexico_City'
  ) THEN
    RAISE EXCEPTION 'accept did not write talent_booking_hours';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.talent_booking_hours_proposals
     WHERE talent_profile_id = v_talent AND status = 'accepted' AND decided_by_user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'accept did not stamp the proposal as accepted';
  END IF;

  -- 4. A second accept attempt refuses hours_exist and does not touch the
  --    already-accepted proposal or the hours row.
  v_result := public.accept_booking_hours_proposal(
    v_talent, v_actor, jsonb_build_object('timezone', 'America/Cancun')
  );
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'hours_exist' THEN
    RAISE EXCEPTION 'expected hours_exist on a second accept, got %', v_result;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.talent_booking_hours
     WHERE talent_profile_id = v_talent AND timezone = 'America/Cancun'
  ) THEN
    RAISE EXCEPTION 'a refused accept overwrote an existing hours row';
  END IF;

  -- Cleanup: nothing this block created survives.
  DELETE FROM public.talent_booking_hours WHERE talent_profile_id = v_talent;
  DELETE FROM public.talent_booking_hours_proposals WHERE talent_profile_id = v_talent;
  DELETE FROM public.talent_profiles WHERE id = v_talent;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 't1-07 accept_booking_hours_proposal proof passed';
END
$proof$;

COMMIT;
