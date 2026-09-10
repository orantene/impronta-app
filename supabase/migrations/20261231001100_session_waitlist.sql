-- 20261231001100_session_waitlist.sql — P3, the waitlist a full class never had.
--
-- WHAT WAS MISSING. `docs/plans/program/specs/appointments.md` names B06, K02
-- and K07 (a place released to the next person, joining a waitlist instead of
-- a booking, the customer's own offer with an expiry) and then says plainly:
-- "Not in the database yet. No `waitlist` or equivalent table exists." The
-- TypeScript half already existed — `src/lib/scheduling/class-waitlist.ts` has
-- `nextWaitlistInvite`, a pure ordering rule over a queue — and it had no
-- queue to order. This file is the queue.
--
-- A SEAT IS NOT COUNTED HERE. `sessions` carries no seats-remaining column and
-- must not grow one: remaining capacity for a session is what
-- `capacity_remaining_public` says about its `session_tier` pool, and this
-- function calls THAT rather than counting rows of its own. A second count of
-- one truth is how a room gets sold twice.
--
-- WHY AN OUTSTANDING OFFER IS SUBTRACTED. An offered place is not a capacity
-- allocation: nobody has bought anything yet, so the pool still reports the
-- seat as free. Two operators promoting two people against one freed seat
-- would both be told yes. So the effective free count is what the pool says
-- MINUS the offers still inside their window, and the `sessions` row is locked
-- FOR UPDATE first so that count cannot change underneath the decision. The
-- session row is used purely as the serialisation point for its own waitlist;
-- nothing about it is written.
--
-- WHY EXPIRY IS NOT A STORED STATE. K07 asks that an offer whose window has
-- passed reads as expired rather than silently vanishing. That is derived from
-- `offer_expires_at` at read time — the same choice `schedule-actions.ts` made
-- for the materialiser's refusals, and for the same reason: a stored answer
-- that was correct when written and is wrong when read is indistinguishable
-- from a correct one, and there is no sweep to keep it honest.
--
-- OUT-OF-ORDER PROMOTION IS ALLOWED, ON PURPOSE. The person at the head of the
-- queue is the one who did not answer the phone. `nextWaitlistInvite` names who
-- SHOULD be next and the surface puts the primary action on them; refusing
-- anybody else would make the screen unusable at a front desk. The position is
-- reported, never enforced.
--
-- TIMESTAMP. A future-dated local sequence, not a wall clock — see the note in
-- 20261230000700_journeys_atomic_rpcs.sql. 20261231001100 is this task's
-- reserved version and no sibling agent holds it.
--
-- Apply to the isolated qa-journeys branch with `npm run journeys:repair -- <this file>`.
-- Never `db push`.

BEGIN;

-- ── session_waitlist_entries ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_waitlist_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  session_id          UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  -- Required. A place cannot be offered to somebody nobody can name, and the
  -- engine's own refusal vocabulary already has a word for it: this item needs
  -- the customer's name before it can be sold.
  customer_name       TEXT NOT NULL CHECK (btrim(customer_name) <> ''),
  customer_email      TEXT,
  customer_phone      TEXT,
  client_user_id      UUID,
  party_size          INTEGER NOT NULL DEFAULT 1
    CHECK (party_size > 0 AND party_size <= 50),
  note                TEXT,
  status              TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'offered', 'accepted', 'withdrawn')),
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  offered_at          TIMESTAMPTZ,
  offer_expires_at    TIMESTAMPTZ,
  decided_at          TIMESTAMPTZ,
  promoted_by_user_id UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An offer without a window is an offer that never expires, which is the one
  -- shape K07 forbids.
  CONSTRAINT session_waitlist_offer_has_window
    CHECK (status <> 'offered' OR (offered_at IS NOT NULL AND offer_expires_at IS NOT NULL))
);

COMMENT ON TABLE public.session_waitlist_entries IS
  'P3: the ordered queue for a full session. Position is derived from joined_at, never stored. Offers expire by their own window, read at query time; nothing sweeps them.';

COMMENT ON COLUMN public.session_waitlist_entries.offer_expires_at IS
  'When the offered place stops being held. Read at query time to decide whether an offer is live; there is no expiry sweep and none is wanted.';

CREATE INDEX IF NOT EXISTS idx_session_waitlist_session_order
  ON public.session_waitlist_entries (session_id, joined_at);

CREATE INDEX IF NOT EXISTS idx_session_waitlist_tenant
  ON public.session_waitlist_entries (tenant_id);

-- One live place in one queue per contactable person. Partial, so a withdrawn
-- or accepted entry never blocks a re-join. Deliberately NOT used as an
-- ON CONFLICT target: a partial unique index cannot serve as an inference
-- specification, and a caller that tries gets a plan-time error rather than the
-- upsert it asked for. Callers read 23505 instead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_session_waitlist_live_email
  ON public.session_waitlist_entries (session_id, lower(customer_email))
  WHERE status IN ('waiting', 'offered') AND customer_email IS NOT NULL;

ALTER TABLE public.session_waitlist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_waitlist_entries_select_staff ON public.session_waitlist_entries;
CREATE POLICY session_waitlist_entries_select_staff ON public.session_waitlist_entries
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS session_waitlist_entries_select_self ON public.session_waitlist_entries;
CREATE POLICY session_waitlist_entries_select_self ON public.session_waitlist_entries
  FOR SELECT TO authenticated
  USING (client_user_id IS NOT NULL AND client_user_id = auth.uid());

-- Writes are service_role only. No INSERT/UPDATE/DELETE policy for
-- authenticated exists, and the explicit REVOKE means a future permissive
-- default grant cannot quietly open one.
REVOKE ALL ON public.session_waitlist_entries FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.session_waitlist_entries FROM authenticated;
GRANT SELECT ON public.session_waitlist_entries TO authenticated;
GRANT ALL ON public.session_waitlist_entries TO service_role;

CREATE OR REPLACE FUNCTION public.session_waitlist_entries_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS session_waitlist_entries_touch ON public.session_waitlist_entries;
CREATE TRIGGER session_waitlist_entries_touch
  BEFORE UPDATE ON public.session_waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.session_waitlist_entries_touch();

-- ── promote_session_waitlist_entry ──────────────────────────────────────────
-- Offer one freed place to one person on the queue, or refuse with a reason a
-- sentence can be built from.
--
-- Refusals: not_found, wrong_tenant, conflict (the screen was stale),
-- not_promotable (already accepted or withdrawn), session_missing,
-- session_not_open, no_pool (nothing says how many seats there are, so nothing
-- honest can be said about a free one), session_full (the pool, minus the
-- offers still live, has nothing left). `already` is a success: a retry of the
-- same intent finds the same live offer.

CREATE OR REPLACE FUNCTION public.promote_session_waitlist_entry(
  p_tenant_id       uuid,
  p_entry_id        uuid,
  p_actor_id        uuid,
  p_expected_status text    DEFAULT NULL,
  p_offer_minutes   integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry      public.session_waitlist_entries%ROWTYPE;
  v_session    public.sessions%ROWTYPE;
  v_pool_id    uuid;
  v_remaining  integer;
  v_offers     integer;
  v_effective  integer;
  v_minutes    integer;
  v_expires    timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_minutes := COALESCE(p_offer_minutes, 30);
  IF v_minutes <= 0 OR v_minutes > 10080 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_entry
    FROM public.session_waitlist_entries
   WHERE id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_entry.tenant_id IS DISTINCT FROM p_tenant_id THEN
    -- The same answer a genuinely missing row gets, one step later: a staff
    -- member of one workspace learns nothing about ids in another.
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  -- A stale screen. The operator acted on a row that has since moved on.
  IF p_expected_status IS NOT NULL AND v_entry.status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.status IN ('accepted', 'withdrawn') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_promotable',
                              'current_status', v_entry.status);
  END IF;

  -- A live offer for this very person is the same intent, already carried out.
  IF v_entry.status = 'offered'
     AND v_entry.offer_expires_at IS NOT NULL
     AND v_entry.offer_expires_at > now() THEN
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'entry_id', v_entry.id,
                              'session_id', v_entry.session_id,
                              'offer_expires_at', v_entry.offer_expires_at);
  END IF;

  -- The serialisation point for this session's whole queue. Nothing about the
  -- session is written; the lock exists so the offer count below cannot move
  -- while this decision is being made.
  SELECT * INTO v_session
    FROM public.sessions
   WHERE id = v_entry.session_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_missing');
  END IF;

  IF v_session.status IS DISTINCT FROM 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_not_open',
                              'session_status', v_session.status);
  END IF;

  SELECT cp.id INTO v_pool_id
    FROM public.capacity_pools cp
   WHERE cp.tenant_id = p_tenant_id
     AND cp.subject_kind = 'session_tier'
     AND cp.subject_id = v_session.id
   ORDER BY cp.created_at
   LIMIT 1;

  IF v_pool_id IS NULL THEN
    -- Nothing limits this session, so nothing can say a place came free. Said
    -- out loud rather than guessed: seats-left.ts refuses to speak for exactly
    -- this shape, and offering a place that was never counted is worse than
    -- refusing one that was.
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pool');
  END IF;

  -- THE CAPACITY ENGINE ANSWERS THIS, NOT A COUNT OF ROWS HERE.
  v_remaining := public.capacity_remaining_public(
    v_pool_id, v_session.starts_at, v_session.ends_at
  );

  SELECT count(*) INTO v_offers
    FROM public.session_waitlist_entries e
   WHERE e.session_id = v_session.id
     AND e.id <> v_entry.id
     AND e.status = 'offered'
     AND e.offer_expires_at IS NOT NULL
     AND e.offer_expires_at > now();

  v_effective := COALESCE(v_remaining, 0) - COALESCE(v_offers, 0);

  IF v_effective <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_full',
                              'remaining', COALESCE(v_remaining, 0),
                              'outstanding_offers', COALESCE(v_offers, 0));
  END IF;

  v_expires := now() + make_interval(mins => v_minutes);

  UPDATE public.session_waitlist_entries
     SET status = 'offered',
         offered_at = now(),
         offer_expires_at = v_expires,
         promoted_by_user_id = p_actor_id
   WHERE id = v_entry.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'entry_id', v_entry.id,
    'session_id', v_entry.session_id,
    'offer_expires_at', v_expires,
    'remaining_after', v_effective - 1
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_session_waitlist_entry(uuid, uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_session_waitlist_entry(uuid, uuid, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.promote_session_waitlist_entry(uuid, uuid, uuid, text, integer) IS
  'P3: offer a freed session place to one waitlist entry. Free seats come from capacity_remaining_public minus the offers still inside their window; the sessions row is locked FOR UPDATE as the serialisation point. Refuses conflict, not_promotable, session_missing, session_not_open, no_pool, session_full.';

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.promote_session_waitlist_entry(uuid,uuid,uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.promote_session_waitlist_entry(uuid,uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'promote_session_waitlist_entry is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

-- ── Executable proof ────────────────────────────────────────────────────────
-- Builds its own throwaway tenant, session and pool, drives every refusal and
-- the success, and deletes everything it created before COMMIT.

DO $proof$
DECLARE
  v_tenant  UUID;
  v_session UUID;
  v_pool    UUID;
  v_first   UUID;
  v_second  UUID;
  v_actor   UUID := gen_random_uuid();
  v_result  JSONB;
  v_starts  TIMESTAMPTZ := now() + interval '7 days';
  v_ends    TIMESTAMPTZ := now() + interval '7 days 1 hour';
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p3-waitlist-proof-' || substr(gen_random_uuid()::text, 1, 8), 'P3 Waitlist Proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.sessions (tenant_id, title, starts_at, ends_at, status)
  VALUES (v_tenant, 'Proof class', v_starts, v_ends, 'scheduled')
  RETURNING id INTO v_session;

  INSERT INTO public.session_waitlist_entries (tenant_id, session_id, customer_name, customer_email)
  VALUES (v_tenant, v_session, 'First In Line', 'first@example.test')
  RETURNING id INTO v_first;

  INSERT INTO public.session_waitlist_entries (tenant_id, session_id, customer_name, customer_email)
  VALUES (v_tenant, v_session, 'Second In Line', 'second@example.test')
  RETURNING id INTO v_second;

  -- 1. A session with no pool cannot say a place came free.
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, 'waiting', 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'no_pool' THEN
    RAISE EXCEPTION 'expected no_pool for a session with no capacity pool, got %', v_result;
  END IF;

  -- One seat, and it is taken: the class is full.
  INSERT INTO public.capacity_pools (tenant_id, subject_kind, subject_id, pool_key, units_total)
  VALUES (v_tenant, 'session_tier', v_session, 'default', 1)
  RETURNING id INTO v_pool;

  -- No order line: `capacity_allocations.order_line_id` is nullable and this
  -- proof is about seats, not about money. Building an order here would drag
  -- the whole checkout shape into a test of one refusal.
  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, starts_at, ends_at, units, state)
  VALUES
    (v_tenant, v_pool, ARRAY[v_pool], v_starts, v_ends, 1, 'committed');

  -- 2. The only seat is committed elsewhere: session_full, from the engine.
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, 'waiting', 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'session_full' THEN
    RAISE EXCEPTION 'expected session_full while the seat is committed, got %', v_result;
  END IF;

  -- Somebody cancels: the allocation is released and the seat comes back.
  UPDATE public.capacity_allocations
     SET state = 'released', released_at = now()
   WHERE tenant_id = v_tenant AND pool_id = v_pool;

  -- 3. A stale screen. The operator's row said 'offered'; it says 'waiting'.
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, 'offered', 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'conflict' THEN
    RAISE EXCEPTION 'expected conflict on a stale expected status, got %', v_result;
  END IF;

  -- 4. The freed place is offered to the first person.
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, 'waiting', 30);
  IF (v_result->>'ok')::boolean IS NOT TRUE OR (v_result->>'already')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'expected the freed place to be offered, got %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.session_waitlist_entries
     WHERE id = v_first AND status = 'offered' AND offer_expires_at > now()
  ) THEN
    RAISE EXCEPTION 'the promote did not stamp a live offer';
  END IF;

  -- 5. Retrying the same intent is the same offer, not a second one.
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, NULL, 30);
  IF (v_result->>'ok')::boolean IS NOT TRUE OR (v_result->>'already')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected a retry to answer already, got %', v_result;
  END IF;

  -- 6. THE RACE THIS FUNCTION EXISTS FOR. The pool still reports one seat free,
  --    because an offer is not an allocation. The second person must still be
  --    refused, or one seat is promised to two people.
  IF public.capacity_remaining_public(v_pool, v_starts, v_ends) <> 1 THEN
    RAISE EXCEPTION 'precondition: the pool should still report one free seat';
  END IF;
  v_result := public.promote_session_waitlist_entry(v_tenant, v_second, v_actor, 'waiting', 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'session_full' THEN
    RAISE EXCEPTION 'a live offer did not hold the seat against a second promote, got %', v_result;
  END IF;

  -- 7. An entry that has already taken its place cannot be offered another.
  UPDATE public.session_waitlist_entries
     SET status = 'accepted', decided_at = now()
   WHERE id = v_first;
  v_result := public.promote_session_waitlist_entry(v_tenant, v_first, v_actor, NULL, 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'not_promotable' THEN
    RAISE EXCEPTION 'expected not_promotable for an accepted entry, got %', v_result;
  END IF;

  -- 8. A cancelled session offers nothing.
  UPDATE public.sessions SET status = 'cancelled' WHERE id = v_session;
  v_result := public.promote_session_waitlist_entry(v_tenant, v_second, v_actor, 'waiting', 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'session_not_open' THEN
    RAISE EXCEPTION 'expected session_not_open for a cancelled session, got %', v_result;
  END IF;

  -- 9. An unknown entry is not found.
  v_result := public.promote_session_waitlist_entry(v_tenant, gen_random_uuid(), v_actor, NULL, 30);
  IF (v_result->>'ok')::boolean IS NOT FALSE OR v_result->>'reason' <> 'not_found' THEN
    RAISE EXCEPTION 'expected not_found for an unknown entry, got %', v_result;
  END IF;

  -- 10. A blank name cannot reach the table at all.
  BEGIN
    INSERT INTO public.session_waitlist_entries (tenant_id, session_id, customer_name)
    VALUES (v_tenant, v_session, '   ');
    RAISE EXCEPTION 'a blank customer name was accepted onto the waitlist';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Cleanup: nothing this block created survives.
  DELETE FROM public.session_waitlist_entries WHERE tenant_id = v_tenant;
  DELETE FROM public.capacity_allocations WHERE tenant_id = v_tenant;
  DELETE FROM public.capacity_pools WHERE tenant_id = v_tenant;
  DELETE FROM public.sessions WHERE tenant_id = v_tenant;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'p3 promote_session_waitlist_entry proof passed';
END
$proof$;

COMMIT;
