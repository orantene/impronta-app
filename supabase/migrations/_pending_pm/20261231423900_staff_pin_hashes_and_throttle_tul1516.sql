-- TUL-1516 (P0 G0.5a): manager / register PIN hashes leave agencies.settings, and wrong PINs are throttled.
--
-- Before: bcrypt hashes lived in agencies.settings.people.pins, a JSON blob that every workspace
-- member can read through the agencies SELECT policy, and nothing limited wrong guesses (a 4 to 6
-- digit PIN has at most one million values).
--
-- After:
--   * public.staff_pin_hashes  (tenant_id, user_id) -> pin_hash. RLS on, NO policy, no grant to
--     anon/authenticated: only the service role and the SECURITY DEFINER functions below touch it.
--   * public.staff_pin_attempts: one row per WRONG attempt. Five wrong attempts in a rolling five
--     minutes lock that person's PIN until the oldest of them ages out; the sixth attempt is
--     refused WITHOUT looking at the PIN (so a right guess cannot be confirmed while locked).
--   * pos_set_staff_pin writes the table; pos_unlock_till and pos_approve_custom_amount verify
--     through pos_check_staff_pin. pos_switch_operator goes through pos_unlock_till, so it is covered.
--   * Existing hashes are copied across and then removed from the settings blob.
--
-- Throttled replies keep reason 'pin_invalid' (every screen already has a sentence for it) and add
-- "throttled": true so the caller can tell a lockout from a typo.
--
-- Code in this PR works before this migration is applied (the table is treated as "no rows" and the
-- legacy blob is still honoured). Held in _pending_pm: it is applied by the PM, never by an agent.

-- ── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.staff_pin_hashes (
  tenant_id  uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  pin_hash   text        NOT NULL CHECK (char_length(pin_hash) > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

ALTER TABLE public.staff_pin_hashes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_pin_hashes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_pin_hashes TO service_role;

CREATE TABLE IF NOT EXISTS public.staff_pin_attempts (
  id           bigserial   PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_pin_attempts_window_idx
  ON public.staff_pin_attempts (tenant_id, user_id, attempted_at DESC);

ALTER TABLE public.staff_pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_pin_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.staff_pin_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.staff_pin_attempts_id_seq TO service_role;

-- ── move the existing hashes out of the settings blob ───────────────────────

INSERT INTO public.staff_pin_hashes (tenant_id, user_id, pin_hash)
SELECT a.id, e.key::uuid, e.value
  FROM public.agencies a,
       LATERAL jsonb_each_text(a.settings #> '{people,pins}') AS e(key, value)
 WHERE jsonb_typeof(a.settings #> '{people,pins}') = 'object'
   AND e.value <> ''
   AND e.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE public.agencies
   SET settings = settings #- '{people,pins}'
 WHERE jsonb_typeof(settings #> '{people,pins}') IS NOT NULL;

-- ── the one PIN check ───────────────────────────────────────────────────────
-- Returns 'ok' | 'pin_invalid' | 'pin_throttled'. Every wrong PIN (including "no PIN set") is
-- recorded; a right PIN clears the person's record.

CREATE OR REPLACE FUNCTION public.pos_check_staff_pin(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_pin       text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash     text;
  v_settings jsonb;
  v_fails    integer;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RETURN 'pin_invalid';
  END IF;

  -- One check at a time per person, so two parallel guesses cannot both slip under the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_user_id::text, 0));

  -- A person who is not an ACTIVE member of this workspace has no usable PIN, whatever hash is
  -- left behind (removed, suspended, pending). Covers unlock, switch operator and approvals.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_memberships m
     WHERE m.tenant_id = p_tenant_id AND m.profile_id = p_user_id AND m.status = 'active'
  ) THEN
    RETURN 'pin_invalid';
  END IF;

  DELETE FROM public.staff_pin_attempts
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id
     AND attempted_at < now() - interval '1 day';

  SELECT count(*) INTO v_fails
    FROM public.staff_pin_attempts
   WHERE tenant_id = p_tenant_id AND user_id = p_user_id
     AND attempted_at > now() - interval '5 minutes';
  IF v_fails >= 5 THEN
    RETURN 'pin_throttled';
  END IF;

  SELECT h.pin_hash INTO v_hash
    FROM public.staff_pin_hashes h
   WHERE h.tenant_id = p_tenant_id AND h.user_id = p_user_id;
  IF v_hash IS NULL THEN
    -- Legacy blob, for a hash written between the code deploy and this migration.
    SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings FROM public.agencies WHERE id = p_tenant_id;
    v_hash := public.pos_staff_pin_hash(v_settings, p_user_id);
  END IF;

  IF v_hash IS NULL OR p_pin IS NULL OR extensions.crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    INSERT INTO public.staff_pin_attempts (tenant_id, user_id) VALUES (p_tenant_id, p_user_id);
    RETURN 'pin_invalid';
  END IF;

  DELETE FROM public.staff_pin_attempts WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.pos_check_staff_pin(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_check_staff_pin(uuid, uuid, text) TO service_role;

-- ── PIN setter: writes the protected table ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_set_staff_pin(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF NOT public.pos_membership_is_manager(p_tenant_id, p_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_hash := extensions.crypt(p_pin, extensions.gen_salt('bf'));

  INSERT INTO public.staff_pin_hashes (tenant_id, user_id, pin_hash, updated_at)
  VALUES (p_tenant_id, p_user_id, v_hash, now())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET pin_hash = EXCLUDED.pin_hash, updated_at = now();

  -- A new PIN starts with a clean record.
  DELETE FROM public.staff_pin_attempts WHERE tenant_id = p_tenant_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_staff_pin(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_set_staff_pin(uuid, uuid, uuid, text) TO service_role;

-- ── unlock: PIN check goes through the throttle ─────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_unlock_till(
  p_tenant_id uuid,
  p_device_key text,
  p_user_id uuid,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_device_sessions%ROWTYPE;
  v_check text;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR char_length(btrim(COALESCE(p_device_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  v_check := public.pos_check_staff_pin(p_tenant_id, p_user_id, p_pin);
  IF v_check = 'pin_throttled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid', 'throttled', true);
  ELSIF v_check <> 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid');
  END IF;

  SELECT * INTO v_row
    FROM public.pos_device_sessions
   WHERE tenant_id = p_tenant_id AND device_key = p_device_key
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.pos_device_sessions (tenant_id, device_key, operator_user_id, unlocked_at, locked_at, last_seen_at)
    VALUES (p_tenant_id, p_device_key, p_user_id, now(), NULL, now())
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pos_device_sessions
       SET operator_user_id = p_user_id,
           locked_at = NULL,
           unlocked_at = now(),
           last_seen_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('ok', true, 'session_id', v_row.id, 'operator_user_id', v_row.operator_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_unlock_till(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_unlock_till(uuid, text, uuid, text) TO service_role;

-- ── manager approval: PIN check goes through the throttle ───────────────────

CREATE OR REPLACE FUNCTION public.pos_approve_custom_amount(
  p_tenant_id uuid,
  p_order_id uuid,
  p_line_id uuid,
  p_operation_key text,
  p_approver uuid,
  p_pin text,
  p_method text DEFAULT 'pin'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line public.order_lines%ROWTYPE;
  v_check text;
  v_existing public.pos_approvals%ROWTYPE;
  v_approval_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_line_id IS NULL
     OR p_approver IS NULL OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF COALESCE(p_method, 'pin') NOT IN ('pin', 'session') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.pos_approvals
   WHERE tenant_id = p_tenant_id AND operation_key = p_operation_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'approval_id', v_existing.id, 'already', true);
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT * INTO v_line
    FROM public.order_lines
   WHERE id = p_line_id AND order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_line.kind IS DISTINCT FROM 'custom' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF EXISTS (SELECT 1 FROM public.pos_approvals WHERE line_id = p_line_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_approved');
  END IF;

  IF NOT public.pos_membership_is_manager(p_tenant_id, p_approver) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;

  v_check := public.pos_check_staff_pin(p_tenant_id, p_approver, p_pin);
  IF v_check = 'pin_throttled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid', 'throttled', true);
  ELSIF v_check <> 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid');
  END IF;

  INSERT INTO public.pos_approvals (
    tenant_id, order_id, line_id, kind, approver_user_id, method, operation_key
  ) VALUES (
    p_tenant_id, p_order_id, p_line_id, 'custom_amount', p_approver, COALESCE(p_method, 'pin'), p_operation_key
  )
  RETURNING id INTO v_approval_id;

  RETURN jsonb_build_object('ok', true, 'approval_id', v_approval_id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_approve_custom_amount(uuid, uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_approve_custom_amount(uuid, uuid, uuid, text, uuid, text, text) TO service_role;

-- ── proof ───────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.staff_pin_hashes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_pin_hashes', 'SELECT')
     OR has_table_privilege('anon', 'public.staff_pin_attempts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.staff_pin_attempts', 'SELECT') THEN
    RAISE EXCEPTION 'TUL-1516: PIN tables must not be readable by anon or authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.pos_check_staff_pin(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_check_staff_pin(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TUL-1516: pos_check_staff_pin must be service_role only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.agencies WHERE jsonb_typeof(settings #> '{people,pins}') IS NOT NULL) THEN
    RAISE EXCEPTION 'TUL-1516: PIN hashes are still in agencies.settings';
  END IF;
END
$$;
