-- 20261231002600_waitlist_acceptance_takes_the_seat.sql — D-105.
-- One seat could be given to two people. This is the seat being taken.
--
-- WHAT WAS WRONG
-- ══════════════
-- `20261231001100_session_waitlist.sql` holds a released place for exactly as
-- long as an offer is inside its window, and it does that with arithmetic of
-- its own: the pool's remaining count MINUS the entries whose status is
-- 'offered' and whose `offer_expires_at` is still in the future. That is sound
-- while the offer is live. It falls apart the instant the offer is taken,
-- because accepting wrote nothing anywhere except the word 'accepted' on the
-- entry. Two things then happened at the same moment:
--
--   * the entry stopped counting as an outstanding offer, and
--   * the pool went on reporting the seat as free, because no allocation had
--     ever been written against it.
--
-- So the subtraction went away and nothing took its place. Reproduced against
-- the isolated branch: promote A succeeds and reports zero remaining; promote
-- B is refused as session_full; set A to accepted; capacity_remaining_public
-- answers 1 again; promote B now succeeds. One seat, two people, and the
-- header of that migration claims this function exists so that cannot happen.
--
-- THE DECISION, AND WHY
-- ═════════════════════
-- Acceptance takes a real seat out of the capacity engine, in the same
-- transaction that marks the entry accepted, and the entry names the
-- allocation it holds.
--
-- An ACCEPTED ENTRY HOLDS AN ALLOCATION. It does not create a booking. The
-- waitlist sits upstream of money: there is no order, no order line and no
-- price anywhere on it, and making acceptance mint a booking would mean
-- inventing an order shape this queue does not have and opening a second write
-- path into `agency_bookings` beside the one the inquiry spine already owns.
-- What acceptance actually establishes is a capacity fact, and
-- `capacity_allocations` already IS that fact: k units of this pool over this
-- window. Its `order_line_id` is nullable precisely so a seat can be held
-- before any money exists, and the seat can later be adopted by a real booking
-- by stamping the order line onto the allocation it already holds, rather than
-- reserving a second one on top of it.
--
-- COMMITTED, NOT HELD. A hold expires. An expiring hold would hand the seat
-- back on its own while the entry still read 'accepted' to every operator
-- looking at the screen, which is the same defect this migration closes,
-- wearing a different hat. Acceptance is final until somebody cancels it, so
-- the allocation is committed the moment it is taken.
--
-- THE ENGINE'S RESERVE PATH, NOT NEW ARITHMETIC. The seat is taken through
-- `_capacity_reserve_locked` — the same internal the reserve path uses — and
-- then `commit_capacity`. That gets the ancestor rule, the lazy reap and the
-- root-first chain lock for free, and it means the engine, not this function,
-- is the thing that finally says no. `promote` remains advisory: it decides
-- who is offered a place from a read; acceptance is where the seat is actually
-- won or lost, under the pool lock, against everything else competing for it.
--
-- LOCK ORDER. Entry row, then the `sessions` row, then the pool chain
-- root-first inside `_capacity_reserve_locked`. `promote` takes the first two
-- in that same order and stops; the plain reserve path takes only the third.
-- No caller takes a pool lock before a session lock, so there is no cycle to
-- deadlock on.
--
-- THE WHOLE LIFE OF AN ENTRY
--   waiting              nothing is held; the pool is untouched.
--   offered, live        no allocation. The offer is subtracted from the free
--                        count by `promote` for as long as its window lasts.
--   offered, expired     nothing was ever written, so nothing has to be given
--                        back. The subtraction lapses by itself and the next
--                        person can be offered the place. No sweep, as before.
--   offered, declined    `decline_session_waitlist_offer` puts the entry on
--                        'withdrawn'. Same story: nothing to release.
--   accepted             holds a committed allocation for `party_size` units.
--                        The subtraction and the allocation change hands in
--                        one transaction, so the free count never blips up.
--   cancelled after      `cancel_session_waitlist_seat` releases the
--     acceptance         allocation and withdraws the entry, so the seat comes
--                        back and the next person can be offered it.
--
-- A STRUCTURAL GUARANTEE, NOT A CONVENTION. `session_waitlist_accepted_holds_a_seat`
-- makes 'accepted' without an allocation unrepresentable. A hand-written
-- UPDATE that flips the word — which is exactly what reproduced this defect —
-- is refused by the table itself, not by a rule somebody has to remember. The
-- allocation id is deliberately KEPT on a withdrawn row: the allocation is
-- released, and where the seat went is worth being able to read afterwards.
--
-- OFFERS ARE COUNTED IN SEATS NOW, NOT IN PEOPLE. The old subtraction was
-- `count(*)`, while an entry can be for a party of several and acceptance
-- takes `party_size` units. A family of four holding one unit of the count is
-- the same oversell in miniature, so the replacement sums `party_size` and
-- requires the asking entry's own party to fit.
--
-- TIMESTAMP. 20261231002600 is this task's reserved version. 20261231001100 is
-- already applied to the isolated branch, so the function is replaced here
-- rather than edited in place.
--
-- Apply to the isolated qa-journeys branch with `npm run journeys:repair -- <this file>`.
-- Never `db push`.

BEGIN;

-- ── the seat an accepted entry holds ────────────────────────────────────────

ALTER TABLE public.session_waitlist_entries
  ADD COLUMN IF NOT EXISTS accepted_allocation_id UUID
    REFERENCES public.capacity_allocations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.session_waitlist_entries.accepted_allocation_id IS
  'The capacity allocation this entry took when it accepted its place. Required while the status is accepted, and kept afterwards so a released seat can still be traced to whoever had it.';

CREATE INDEX IF NOT EXISTS idx_session_waitlist_accepted_allocation
  ON public.session_waitlist_entries (accepted_allocation_id)
  WHERE accepted_allocation_id IS NOT NULL;

-- The defect, made unrepresentable. An entry cannot read 'accepted' unless a
-- seat is named against it.
ALTER TABLE public.session_waitlist_entries
  DROP CONSTRAINT IF EXISTS session_waitlist_accepted_holds_a_seat;
ALTER TABLE public.session_waitlist_entries
  ADD CONSTRAINT session_waitlist_accepted_holds_a_seat
  CHECK (status <> 'accepted' OR accepted_allocation_id IS NOT NULL);

-- ── promote, replaced ───────────────────────────────────────────────────────
-- Same contract, two corrections: outstanding offers are summed in SEATS, and
-- the asking entry's own party has to fit in what is left.

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
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF p_expected_status IS NOT NULL AND v_entry.status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.status IN ('accepted', 'withdrawn') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_promotable',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.status = 'offered'
     AND v_entry.offer_expires_at IS NOT NULL
     AND v_entry.offer_expires_at > now() THEN
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'entry_id', v_entry.id,
                              'session_id', v_entry.session_id,
                              'offer_expires_at', v_entry.offer_expires_at);
  END IF;

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
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pool');
  END IF;

  -- THE CAPACITY ENGINE ANSWERS THIS, NOT A COUNT OF ROWS HERE. An accepted
  -- entry is now inside this number, as a committed allocation, so it no
  -- longer has to be remembered separately below.
  v_remaining := public.capacity_remaining_public(
    v_pool_id, v_session.starts_at, v_session.ends_at
  );

  -- Seats, not people: an offer to a party of four holds four.
  SELECT COALESCE(SUM(e.party_size), 0) INTO v_offers
    FROM public.session_waitlist_entries e
   WHERE e.session_id = v_session.id
     AND e.id <> v_entry.id
     AND e.status = 'offered'
     AND e.offer_expires_at IS NOT NULL
     AND e.offer_expires_at > now();

  v_effective := COALESCE(v_remaining, 0) - COALESCE(v_offers, 0);

  IF v_effective < v_entry.party_size THEN
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
    'remaining_after', v_effective - v_entry.party_size
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.promote_session_waitlist_entry(uuid, uuid, uuid, text, integer) IS
  'P3/D-105: offer a freed session place to one waitlist entry. Free seats come from capacity_remaining_public minus the SEATS still inside a live offer window; an accepted entry is already inside the pool count because it holds a committed allocation. Advisory: the seat is finally won under the pool lock in accept_session_waitlist_offer.';

-- ── accept_session_waitlist_offer ───────────────────────────────────────────
-- Take the offered place. The seat and the word 'accepted' are written in one
-- transaction or neither is.
--
-- Refusals: invalid, not_found, wrong_tenant, conflict, not_offered (nobody
-- has offered this person anything yet), offer_expired (the window closed;
-- the place may already be somebody else's), not_promotable (withdrawn),
-- session_missing, session_not_open, no_pool, session_full (the engine itself
-- refused the seat, which is the only refusal here that is authoritative),
-- unavailable. `already` is a success: a retry finds the seat this entry
-- already holds.

CREATE OR REPLACE FUNCTION public.accept_session_waitlist_offer(
  p_tenant_id       uuid,
  p_entry_id        uuid,
  p_actor_id        uuid,
  p_expected_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry     public.session_waitlist_entries%ROWTYPE;
  v_session   public.sessions%ROWTYPE;
  v_pool_id   uuid;
  v_alloc     public.capacity_allocations%ROWTYPE;
  v_commit    jsonb;
  v_remaining integer;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_id IS NULL THEN
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
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  -- Already taken, by this very entry. The seat is the proof, not the word.
  IF v_entry.status = 'accepted' AND v_entry.accepted_allocation_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true,
                              'entry_id', v_entry.id,
                              'session_id', v_entry.session_id,
                              'allocation_id', v_entry.accepted_allocation_id,
                              'units', v_entry.party_size);
  END IF;

  IF p_expected_status IS NOT NULL AND v_entry.status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.status = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_promotable',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.status <> 'offered' THEN
    -- Nothing was offered, so there is nothing to accept. Said out loud rather
    -- than quietly reserving a seat somebody's turn had not reached.
    RETURN jsonb_build_object('ok', false, 'reason', 'not_offered',
                              'current_status', v_entry.status);
  END IF;

  IF v_entry.offer_expires_at IS NULL OR v_entry.offer_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'offer_expired',
                              'offer_expires_at', v_entry.offer_expires_at);
  END IF;

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
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pool');
  END IF;

  -- THE SEAT. The engine's own reserve, so the ancestor rule, the reap and the
  -- root-first chain lock all apply, and a race against a plain checkout is
  -- settled by the same lock rather than by two counts agreeing. It RAISES on
  -- refusal; CP005/CP006 are caught below and become session_full.
  BEGIN
    v_alloc := public._capacity_reserve_locked(
      v_pool_id,
      v_session.starts_at,
      v_session.ends_at,
      v_entry.party_size,
      60,        -- a floor-legal TTL; committed on the next line regardless
      NULL,      -- no order line: the waitlist is upstream of money
      p_actor_id
    );
  EXCEPTION
    WHEN SQLSTATE 'CP005' OR SQLSTATE 'CP006' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'session_full',
                                'units', v_entry.party_size);
    WHEN SQLSTATE 'CP003' OR SQLSTATE 'CP004' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'no_pool');
  END;

  -- Committed, not left on a TTL: a hold that lapsed would hand the seat back
  -- while the entry still read 'accepted', which is D-105 again.
  v_commit := public.commit_capacity(ARRAY[v_alloc.id]);
  IF (v_commit->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'commit_capacity refused the seat just reserved: %', v_commit;
  END IF;

  UPDATE public.session_waitlist_entries
     SET status = 'accepted',
         decided_at = now(),
         accepted_allocation_id = v_alloc.id
   WHERE id = v_entry.id;

  v_remaining := public.capacity_remaining_public(
    v_pool_id, v_session.starts_at, v_session.ends_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'entry_id', v_entry.id,
    'session_id', v_entry.session_id,
    'allocation_id', v_alloc.id,
    'units', v_entry.party_size,
    'remaining_after', COALESCE(v_remaining, 0)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.accept_session_waitlist_offer(uuid, uuid, uuid, text) IS
  'D-105: take an offered session place. Reserves and commits a capacity allocation for the entry party through the engine, and marks the entry accepted, in one transaction. Refuses not_offered, offer_expired, not_promotable, conflict, session_missing, session_not_open, no_pool, session_full.';

-- ── decline_session_waitlist_offer ──────────────────────────────────────────
-- The offered place is given back to the queue before its window runs out.
-- Nothing was ever allocated for an offer, so nothing has to be released; what
-- this buys over waiting for the expiry is that the next person can be offered
-- the place NOW rather than in twenty-nine minutes.

CREATE OR REPLACE FUNCTION public.decline_session_waitlist_offer(
  p_tenant_id       uuid,
  p_entry_id        uuid,
  p_actor_id        uuid,
  p_expected_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.session_waitlist_entries%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_id IS NULL THEN
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
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF v_entry.status = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'entry_id', v_entry.id);
  END IF;

  IF p_expected_status IS NOT NULL AND v_entry.status IS DISTINCT FROM p_expected_status THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict',
                              'current_status', v_entry.status);
  END IF;

  -- An accepted entry holds a seat. Withdrawing it here would leave the
  -- allocation committed with nobody named against it, so that path has its
  -- own function and this one refuses.
  IF v_entry.status = 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted');
  END IF;

  UPDATE public.session_waitlist_entries
     SET status = 'withdrawn',
         decided_at = now(),
         offer_expires_at = NULL,
         offered_at = NULL
   WHERE id = v_entry.id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'entry_id', v_entry.id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.decline_session_waitlist_offer(uuid, uuid, uuid, text) IS
  'D-105: give an offered place back to the queue before its window closes. Refuses already_accepted, which is cancel_session_waitlist_seat.';

-- ── cancel_session_waitlist_seat ────────────────────────────────────────────
-- Somebody who took a place gives it up. The allocation is released through
-- the engine's own clamp, so the seat comes back and the next person on the
-- queue can be offered it.

CREATE OR REPLACE FUNCTION public.cancel_session_waitlist_seat(
  p_tenant_id uuid,
  p_entry_id  uuid,
  p_actor_id  uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry     public.session_waitlist_entries%ROWTYPE;
  v_session   public.sessions%ROWTYPE;
  v_pool_id   uuid;
  v_release   jsonb;
  v_remaining integer;
BEGIN
  IF p_tenant_id IS NULL OR p_entry_id IS NULL THEN
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
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF v_entry.status = 'withdrawn' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'entry_id', v_entry.id);
  END IF;

  IF v_entry.status <> 'accepted' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_accepted',
                              'current_status', v_entry.status);
  END IF;

  -- Same order as everywhere else: entry, then session, then the pool the
  -- release touches.
  SELECT * INTO v_session
    FROM public.sessions
   WHERE id = v_entry.session_id
     AND tenant_id = p_tenant_id
   FOR UPDATE;

  v_release := public.release_capacity(ARRAY[v_entry.accepted_allocation_id]);
  IF (v_release->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'release_capacity refused the seat: %', v_release;
  END IF;

  -- The allocation id stays: the seat is released, and where it went is worth
  -- being able to read afterwards.
  UPDATE public.session_waitlist_entries
     SET status = 'withdrawn',
         decided_at = now()
   WHERE id = v_entry.id;

  IF FOUND AND v_session.id IS NOT NULL THEN
    SELECT cp.id INTO v_pool_id
      FROM public.capacity_pools cp
     WHERE cp.tenant_id = p_tenant_id
       AND cp.subject_kind = 'session_tier'
       AND cp.subject_id = v_session.id
     ORDER BY cp.created_at
     LIMIT 1;
    IF v_pool_id IS NOT NULL THEN
      v_remaining := public.capacity_remaining_public(
        v_pool_id, v_session.starts_at, v_session.ends_at
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false,
                            'entry_id', v_entry.id,
                            'released_allocation_id', v_entry.accepted_allocation_id,
                            'remaining_after', v_remaining);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.cancel_session_waitlist_seat(uuid, uuid, uuid) IS
  'D-105: give up a place that was accepted. Releases the committed allocation through release_capacity and withdraws the entry, so the seat comes back to the queue.';

-- ── grants ──────────────────────────────────────────────────────────────────
-- CREATE FUNCTION grants EXECUTE to PUBLIC, and PUBLIC is a separate grant from
-- any role grant. FROM PUBLIC is the operative statement.

REVOKE ALL ON FUNCTION public.accept_session_waitlist_offer(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_session_waitlist_offer(uuid, uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.decline_session_waitlist_offer(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decline_session_waitlist_offer(uuid, uuid, uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.cancel_session_waitlist_seat(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_session_waitlist_seat(uuid, uuid, uuid)
  TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.accept_session_waitlist_offer(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.accept_session_waitlist_offer(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cancel_session_waitlist_seat(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cancel_session_waitlist_seat(uuid,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.decline_session_waitlist_offer(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.decline_session_waitlist_offer(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'a session waitlist write RPC is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

-- ── Executable proof ────────────────────────────────────────────────────────
-- The reviewer's exact sequence, plus the two cases they did not run. Builds
-- its own throwaway tenant and deletes everything before COMMIT.

DO $proof$
DECLARE
  v_tenant  UUID;
  v_session UUID;
  v_pool    UUID;
  v_a       UUID;
  v_b       UUID;
  -- A REAL user, or none. `capacity_allocations.created_by` is a foreign key
  -- onto auth.users, so an invented actor id would make the seat unreservable
  -- for a reason that has nothing to do with capacity. NULL is a legitimate
  -- actor here: nobody signed in has to be behind an acceptance.
  v_actor   UUID := (SELECT u.id FROM auth.users u LIMIT 1);
  v_r       JSONB;
  v_alloc   UUID;
  v_starts  TIMESTAMPTZ := now() + interval '11 days';
  v_ends    TIMESTAMPTZ := now() + interval '11 days 1 hour';
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('d105-proof-' || substr(gen_random_uuid()::text, 1, 8), 'D105 Proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.sessions (tenant_id, title, starts_at, ends_at, status)
  VALUES (v_tenant, 'One seat class', v_starts, v_ends, 'scheduled')
  RETURNING id INTO v_session;

  INSERT INTO public.capacity_pools (tenant_id, subject_kind, subject_id, pool_key, units_total)
  VALUES (v_tenant, 'session_tier', v_session, 'default', 1)
  RETURNING id INTO v_pool;

  INSERT INTO public.session_waitlist_entries (tenant_id, session_id, customer_name, customer_email)
  VALUES (v_tenant, v_session, 'Person A', 'a@example.test') RETURNING id INTO v_a;
  INSERT INTO public.session_waitlist_entries (tenant_id, session_id, customer_name, customer_email)
  VALUES (v_tenant, v_session, 'Person B', 'b@example.test') RETURNING id INTO v_b;

  -- 1. The word alone can no longer be written.
  BEGIN
    UPDATE public.session_waitlist_entries SET status = 'accepted', decided_at = now() WHERE id = v_a;
    RAISE EXCEPTION 'an entry was marked accepted while holding no seat';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- 2. A place is offered to A, and B is refused while the offer is live.
  v_r := public.promote_session_waitlist_entry(v_tenant, v_a, v_actor, 'waiting', 30);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected the place to be offered to A, got %', v_r;
  END IF;
  v_r := public.promote_session_waitlist_entry(v_tenant, v_b, v_actor, 'waiting', 30);
  IF v_r->>'reason' <> 'session_full' THEN
    RAISE EXCEPTION 'expected B refused while A holds a live offer, got %', v_r;
  END IF;

  -- 3. A accepts. THE SEAT IS TAKEN in the same transaction.
  v_r := public.accept_session_waitlist_offer(v_tenant, v_a, v_actor, 'offered');
  IF (v_r->>'ok')::boolean IS NOT TRUE OR v_r->>'allocation_id' IS NULL THEN
    RAISE EXCEPTION 'expected A to take the seat, got %', v_r;
  END IF;
  v_alloc := (v_r->>'allocation_id')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.capacity_allocations
     WHERE id = v_alloc AND state = 'committed' AND units = 1 AND pool_id = v_pool
  ) THEN
    RAISE EXCEPTION 'acceptance did not leave a committed allocation on the pool';
  END IF;

  -- 4. THE DEFECT. The pool must NOT report the seat free again.
  IF public.capacity_remaining_public(v_pool, v_starts, v_ends) <> 0 THEN
    RAISE EXCEPTION 'the accepted seat was reported free again: remaining %',
      public.capacity_remaining_public(v_pool, v_starts, v_ends);
  END IF;
  v_r := public.promote_session_waitlist_entry(v_tenant, v_b, v_actor, 'waiting', 30);
  IF v_r->>'reason' <> 'session_full' THEN
    RAISE EXCEPTION 'one seat was offered to a second person after the first accepted: %', v_r;
  END IF;

  -- 5. Accepting twice is the same seat, not a second one.
  v_r := public.accept_session_waitlist_offer(v_tenant, v_a, v_actor, NULL);
  IF (v_r->>'already')::boolean IS NOT TRUE OR (v_r->>'allocation_id')::uuid <> v_alloc THEN
    RAISE EXCEPTION 'a retry of accept did not answer with the same seat, got %', v_r;
  END IF;

  -- 6. A cancels after accepting. The seat comes back and B can have it.
  v_r := public.cancel_session_waitlist_seat(v_tenant, v_a, v_actor);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected the accepted seat to be given up, got %', v_r;
  END IF;
  IF public.capacity_remaining_public(v_pool, v_starts, v_ends) <> 1 THEN
    RAISE EXCEPTION 'a cancelled acceptance did not give the seat back';
  END IF;
  v_r := public.promote_session_waitlist_entry(v_tenant, v_b, v_actor, 'waiting', 1);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected the returned seat to be offered to B, got %', v_r;
  END IF;

  -- 7. An offer that runs out holds nothing. Nothing was allocated for it, so
  --    the place is simply available again once the window closes.
  UPDATE public.session_waitlist_entries
     SET offered_at = now() - interval '2 hours',
         offer_expires_at = now() - interval '1 hour'
   WHERE id = v_b;
  v_r := public.accept_session_waitlist_offer(v_tenant, v_b, v_actor, 'offered');
  IF v_r->>'reason' <> 'offer_expired' THEN
    RAISE EXCEPTION 'expected a lapsed offer to refuse acceptance, got %', v_r;
  END IF;
  IF public.capacity_remaining_public(v_pool, v_starts, v_ends) <> 1 THEN
    RAISE EXCEPTION 'a lapsed offer left something holding the seat';
  END IF;

  -- 8. Accepting something nobody offered is refused rather than reserved.
  UPDATE public.session_waitlist_entries
     SET status = 'waiting', offered_at = NULL, offer_expires_at = NULL
   WHERE id = v_b;
  v_r := public.accept_session_waitlist_offer(v_tenant, v_b, v_actor, NULL);
  IF v_r->>'reason' <> 'not_offered' THEN
    RAISE EXCEPTION 'expected not_offered for an entry with no offer, got %', v_r;
  END IF;

  -- 9. Declining gives the place straight back to the queue.
  v_r := public.promote_session_waitlist_entry(v_tenant, v_b, v_actor, 'waiting', 30);
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected B to be offered the free place, got %', v_r;
  END IF;
  v_r := public.decline_session_waitlist_offer(v_tenant, v_b, v_actor, 'offered');
  IF (v_r->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'expected the offer to be declined, got %', v_r;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.session_waitlist_entries WHERE id = v_b AND status = 'withdrawn'
  ) THEN
    RAISE EXCEPTION 'declining did not take the entry off the list';
  END IF;

  -- 10. A party of more than one takes more than one seat, or none.
  DELETE FROM public.session_waitlist_entries WHERE tenant_id = v_tenant;
  UPDATE public.capacity_pools SET units_total = 2 WHERE id = v_pool;
  INSERT INTO public.session_waitlist_entries
    (tenant_id, session_id, customer_name, customer_email, party_size)
  VALUES (v_tenant, v_session, 'Party Of Three', 'three@example.test', 3)
  RETURNING id INTO v_a;
  v_r := public.promote_session_waitlist_entry(v_tenant, v_a, v_actor, 'waiting', 30);
  IF v_r->>'reason' <> 'session_full' THEN
    RAISE EXCEPTION 'a party of three was offered two seats, got %', v_r;
  END IF;

  DELETE FROM public.session_waitlist_entries WHERE tenant_id = v_tenant;
  DELETE FROM public.capacity_allocations WHERE tenant_id = v_tenant;
  DELETE FROM public.capacity_pools WHERE tenant_id = v_tenant;
  DELETE FROM public.sessions WHERE tenant_id = v_tenant;
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'D-105 proof passed: acceptance takes the seat';
END
$proof$;

COMMIT;
