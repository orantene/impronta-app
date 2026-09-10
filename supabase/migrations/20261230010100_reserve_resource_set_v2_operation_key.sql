-- T1-01: a multi-resource reservation becomes all-or-none AND replay-safe.
--
-- THE DEFECT. `web/src/lib/resources/reserve-set.ts` called
-- `reserve_resource_set`, and when the RPC errored OR answered
-- `reason: 'unavailable'` it fell through to a SECOND, TypeScript reservation
-- path (attemptSet / unwindSet) that allocated the same resources again. A
-- lost response is exactly the case where the first attempt DID commit, so the
-- fallback ran on top of rows that already existed: two allocations, two
-- calendar holds, one booking. `unavailable` means the transport failed. It
-- must never cause a second write attempt.
--
-- Deleting the fallback alone is not enough. Once the client can no longer
-- repair a lost answer by re-doing the work itself, the RETRY has to be safe,
-- and a retry is only safe if the server can recognise the second copy of the
-- same command. That is what this migration adds: an operation key the caller
-- derives from what it already has (`order:<id>:reserve`, `pos-hold:<id>`),
-- claimed BEFORE any resource is touched.
--
-- WHY CLAIM FIRST. The claim is `INSERT ... ON CONFLICT DO NOTHING` on a
-- PRIMARY KEY. A concurrent duplicate does not get a "no" — it BLOCKS on the
-- unique index until the first transaction ends, and only then reads the row.
-- So the second caller cannot start the work while the first is still doing
-- it, which is the property a check-then-act idempotency table does not have.
--
-- WHY A REFUSAL IS NOT STICKY. Refusals in this family are DATA, not
-- exceptions, so the transaction COMMITS on a refusal and an unconditional
-- claim row would survive it — one sold-out attempt would poison that key
-- forever. Two mechanisms keep that from happening:
--   • an exception (deadlock, exclusion_violation, anything else) rolls the
--     whole body back, and the claim was taken INSIDE that body, so it goes
--     with it;
--   • a returned refusal deletes the claim row on the way out.
-- Either way the key is free again. Only `state = 'done'` is sticky, and only
-- that state answers `already`.
--
-- WHY A REFUSAL MUST ALSO UNDO ITS OWN WORK — and how this file got it wrong.
-- Freeing the key is only half of it. A set refuses on its LAST leg as easily
-- as its first, and by then the earlier legs have written: an allocation, a
-- firm hold on a real person's calendar. The first version of this file put
-- the body in a LABELLED block and left every refusal through `EXIT work`. A
-- labelled block is not a subtransaction — only a block with an EXCEPTION
-- clause is — so `EXIT` unwound nothing. The function then settled, freed the
-- key and RETURNED, and the transaction COMMITTED the half-built set. Two
-- reproduced consequences, both on one operation key:
--   • one good capacity leg plus one hold with an empty talent id refused with
--     `invalid` and kept the allocation; replaying the identical key kept a
--     SECOND one, so two refusals held two seats;
--   • a good hold followed by a bad one refused and left the good hold
--     standing, and the replay then answered `slot_taken` instead of
--     `invalid`, blocked by the ghost its own refusal had left.
-- So the body is now a real subtransaction, the same shape
-- `reserve_capacity_batch` uses: every in-body refusal RAISES SQLSTATE RS001
-- carrying its reason in MESSAGE_TEXT and its failed ids in DETAIL, the
-- block's own EXCEPTION clause catches it — which rolls back every row the
-- block wrote — and turns it back into `{ok:false, reason}`. The claim is
-- taken OUTSIDE that block, so it survives the rollback and the settle step
-- can still delete it. A refusal therefore leaves nothing at all, and the
-- replay of a refused key is indistinguishable from a first attempt.
--
-- WHERE THE PROOF LIVES. The DO block at the foot of this file replays the
-- two cases above and refuses to apply if either leaks. Every OTHER reason the
-- function can return is driven against the isolated branch by
-- `web/scripts/verify-reserve-set-refusal-atomicity.mjs`, which asserts the
-- same three facts for each one: zero units held under the key, no surviving
-- hold, and a replay that answers the SAME reason.
--
-- WHY v1 STAYS. `reserve_resource_set` is left in place, untouched, for one
-- release: the code that calls it ships on the same commit as this file, and a
-- rollback of the deploy must not land on a function that is gone.
--
-- TIMESTAMP. `date -u +%Y%m%d%H%M%S` returned 20260909231534 at the start of
-- this work, and that prefix is WRONG here: it sorts before
-- 20261229000200_capacity_engine.sql, which creates `capacity_allocations`, so
-- a fresh replay would ALTER a table that does not exist yet. This program's
-- band is 20261230xxxxxx (see 20261230000700's own header, "Do not use
-- calendar 20260908"), so the file takes the next free slot in that band,
-- offset by the task number (T1-01 -> ...010100) so a sibling agent picking
-- the obvious ...002300 cannot collide with it.

BEGIN;

-- ── the operation ledger ─────────────────────────────────────────────────────
--
-- Keyed on (tenant_id, operation_key) as the PRIMARY KEY, so the block is the
-- index itself rather than an advisory lock nobody can see. `hold_ids` and
-- `allocation_ids` are what makes a replay return the SAME answer instead of a
-- second set of rows.

CREATE TABLE IF NOT EXISTS public.resource_set_operations (
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  operation_key  text NOT NULL,
  state          text NOT NULL DEFAULT 'in_flight',
  hold_ids       uuid[] NOT NULL DEFAULT '{}',
  allocation_ids uuid[] NOT NULL DEFAULT '{}',
  expires_at     timestamptz,
  actor_id       uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_set_operations_pkey PRIMARY KEY (tenant_id, operation_key),
  CONSTRAINT resource_set_operations_state_check CHECK (state IN ('in_flight', 'done'))
);

CREATE INDEX IF NOT EXISTS resource_set_operations_expires_idx
  ON public.resource_set_operations (expires_at)
  WHERE state = 'in_flight';

COMMENT ON TABLE public.resource_set_operations IS
  'T1-01: idempotency ledger for reserve_resource_set_v2. A row exists only while a set is being reserved (in_flight) or after it succeeded (done); a refusal removes it, because a refusal reserved nothing.';

ALTER TABLE public.resource_set_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resource_set_operations_staff_read ON public.resource_set_operations;
CREATE POLICY resource_set_operations_staff_read ON public.resource_set_operations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON public.resource_set_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resource_set_operations TO authenticated;
GRANT ALL ON public.resource_set_operations TO service_role;

-- ── the rows a set creates carry the key that created them ───────────────────
--
-- Nullable because every row written before this migration has no key, and
-- indexed partially for the same reason: the interesting rows are the ones a
-- keyed command wrote.

ALTER TABLE public.capacity_allocations
  ADD COLUMN IF NOT EXISTS operation_key text;

CREATE INDEX IF NOT EXISTS capacity_allocations_operation_key_idx
  ON public.capacity_allocations (operation_key)
  WHERE operation_key IS NOT NULL;

COMMENT ON COLUMN public.capacity_allocations.operation_key IS
  'T1-01: the reserve_resource_set_v2 operation that allocated these units. NULL for rows written by any other path.';

ALTER TABLE public.talent_holds
  ADD COLUMN IF NOT EXISTS operation_key text;

CREATE INDEX IF NOT EXISTS talent_holds_operation_key_idx
  ON public.talent_holds (operation_key)
  WHERE operation_key IS NOT NULL;

COMMENT ON COLUMN public.talent_holds.operation_key IS
  'T1-01: the reserve_resource_set_v2 operation that placed this hold. NULL for rows written by any other path.';

-- ── reserve_resource_set_v2 ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_resource_set_v2(
  p_tenant_id uuid,
  p_operation_key text,
  p_actor_id uuid,
  p_ttl_seconds integer,
  p_capacity jsonb,
  p_holds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key         text := NULLIF(btrim(p_operation_key), '');
  v_claimed     text;
  v_op          public.resource_set_operations%ROWTYPE;
  v_claim_until timestamptz;
  v_try         integer;
  v_result      jsonb;
  v_cap         jsonb;
  v_hold        jsonb;
  v_pool_id     uuid;
  v_tenant      uuid;
  v_talent      uuid;
  v_starts      timestamptz;
  v_ends        timestamptz;
  v_before      int;
  v_after       int;
  v_expires     timestamptz;
  v_hold_id     uuid;
  v_hold_ids    uuid[] := '{}';
  v_alloc       jsonb;
  v_alloc_ids   uuid[] := '{}';
  v_reason      text;
  v_detail      text;
  v_ctx         jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- No key, no claim, no reservation. A caller that cannot name its command
  -- cannot be replayed safely, and silently inventing a key here would put the
  -- double-allocation back one layer down.
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF (p_capacity IS NULL OR jsonb_typeof(p_capacity) <> 'array' OR jsonb_array_length(p_capacity) = 0)
     AND (p_holds IS NULL OR jsonb_typeof(p_holds) <> 'array' OR jsonb_array_length(p_holds) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_batch', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  v_claim_until := now() + make_interval(secs => COALESCE(p_ttl_seconds, 172800));

  -- ── claim ──────────────────────────────────────────────────────────────────
  --
  -- Three tries, not a loop that can spin: try 1 claims or blocks; if the
  -- winner rolled back, its row is gone and try 2 claims it. A third is slack
  -- for a lost race with a DELETE committing between the conflict and the read.
  FOR v_try IN 1..3 LOOP
    INSERT INTO public.resource_set_operations (tenant_id, operation_key, state, actor_id, expires_at)
    VALUES (p_tenant_id, v_key, 'in_flight', p_actor_id, v_claim_until)
    ON CONFLICT (tenant_id, operation_key) DO NOTHING
    RETURNING operation_key INTO v_claimed;

    EXIT WHEN v_claimed IS NOT NULL;

    SELECT * INTO v_op
      FROM public.resource_set_operations
     WHERE tenant_id = p_tenant_id
       AND operation_key = v_key;

    IF FOUND THEN
      -- The identical command already succeeded. Answer with ITS rows: the
      -- caller gets the same ids it would have got, and nothing is allocated
      -- twice.
      IF v_op.state = 'done' THEN
        RETURN jsonb_build_object(
          'ok', true,
          'already', true,
          'hold_ids', to_jsonb(COALESCE(v_op.hold_ids, '{}'::uuid[])),
          'allocation_ids', to_jsonb(COALESCE(v_op.allocation_ids, '{}'::uuid[])),
          'expires_at', v_op.expires_at
        );
      END IF;

      -- A COMMITTED in_flight row is not reachable through this function:
      -- every exit either finishes the row or removes it. Seeing one means an
      -- earlier writer died in a way that kept its claim, so refuse rather
      -- than run a body that might duplicate whatever it managed to write.
      -- Past its own expiry there is nothing left to duplicate, so it may be
      -- taken over.
      IF v_op.expires_at IS NULL OR v_op.expires_at > now() THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'in_flight', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
      END IF;

      UPDATE public.resource_set_operations
         SET state = 'in_flight',
             actor_id = p_actor_id,
             created_at = now(),
             expires_at = v_claim_until,
             hold_ids = '{}',
             allocation_ids = '{}'
       WHERE tenant_id = p_tenant_id
         AND operation_key = v_key
      RETURNING operation_key INTO v_claimed;
      EXIT;
    END IF;
    -- Absent: the transaction we blocked on rolled back, so its refusal left
    -- nothing behind. Go round and claim the key ourselves.
  END LOOP;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- ── the body: one subtransaction, so a refusal unwinds it ─────────────────
  --
  -- This BEGIN has an EXCEPTION clause, which is what makes it a
  -- subtransaction; a labelled block exited with `EXIT` is not one and unwinds
  -- nothing. So every refusal in here RAISES RS001 instead of falling out with
  -- a value: the raise rolls back the allocation and the holds this block
  -- already wrote, and the handler turns the error back into the refusal the
  -- caller expects. The claim was taken above this block, so it survives and
  -- the settle step below can still free it.
  BEGIN
    IF p_capacity IS NOT NULL
       AND jsonb_typeof(p_capacity) = 'array'
       AND jsonb_array_length(p_capacity) > 0 THEN
      FOR v_cap IN SELECT * FROM jsonb_array_elements(p_capacity)
      LOOP
        v_pool_id := NULLIF(v_cap->>'pool_id', '')::uuid;
        IF v_pool_id IS NULL THEN
          RAISE EXCEPTION USING ERRCODE = 'RS001', MESSAGE = 'invalid';
        END IF;
        SELECT tenant_id INTO v_tenant FROM public.capacity_pools WHERE id = v_pool_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE = 'RS001', MESSAGE = 'pool_not_found',
            DETAIL = jsonb_build_object('failed_pool_id', v_pool_id)::text;
        END IF;
        IF v_tenant IS DISTINCT FROM p_tenant_id THEN
          RAISE EXCEPTION USING ERRCODE = 'RS001', MESSAGE = 'wrong_tenant',
            DETAIL = jsonb_build_object('failed_pool_id', v_pool_id)::text;
        END IF;
      END LOOP;

      v_alloc := public.reserve_capacity_batch(p_capacity, p_ttl_seconds, NULL, p_actor_id);
      IF COALESCE((v_alloc->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'RS001',
          MESSAGE = COALESCE(v_alloc->>'reason', 'unavailable'),
          DETAIL = jsonb_build_object('failed_pool_id', NULLIF(v_alloc->>'failed_pool_id', ''))::text;
      END IF;
      SELECT COALESCE(array_agg(x::uuid), '{}')
        INTO v_alloc_ids
        FROM jsonb_array_elements_text(COALESCE(v_alloc->'allocation_ids', '[]'::jsonb)) AS x;
      IF v_alloc ? 'expires_at' AND v_alloc->>'expires_at' IS NOT NULL THEN
        v_expires := (v_alloc->>'expires_at')::timestamptz;
      END IF;

      -- reserve_capacity_batch does not know about operations, so the stamp is
      -- applied here rather than by widening that function's signature.
      IF array_length(v_alloc_ids, 1) IS NOT NULL THEN
        UPDATE public.capacity_allocations
           SET operation_key = v_key
         WHERE id = ANY(v_alloc_ids);
      END IF;
    END IF;

    IF p_holds IS NOT NULL AND jsonb_typeof(p_holds) = 'array' THEN
      FOR v_hold IN
        SELECT value FROM jsonb_array_elements(p_holds) AS value
        ORDER BY value->>'talent_profile_id', value->>'starts_at'
      LOOP
        v_talent := NULLIF(v_hold->>'talent_profile_id', '')::uuid;
        v_starts := NULLIF(v_hold->>'starts_at', '')::timestamptz;
        v_ends := NULLIF(v_hold->>'ends_at', '')::timestamptz;
        v_before := COALESCE(NULLIF(v_hold->>'buffer_before_seconds', '')::int, 0);
        v_after := COALESCE(NULLIF(v_hold->>'buffer_after_seconds', '')::int, 0);
        IF v_talent IS NULL OR v_starts IS NULL OR v_ends IS NULL OR v_ends <= v_starts OR v_before < 0 OR v_after < 0 THEN
          RAISE EXCEPTION USING ERRCODE = 'RS001', MESSAGE = 'invalid',
            DETAIL = jsonb_build_object('failed_talent_id', v_talent)::text;
        END IF;
        v_starts := v_starts - make_interval(secs => v_before);
        v_ends := v_ends + make_interval(secs => v_after);

        INSERT INTO public.talent_holds (
          talent_profile_id,
          tenant_id,
          inquiry_id,
          title,
          starts_at,
          ends_at,
          all_day,
          hold_strength,
          expires_at,
          created_by_user_id,
          operation_key
        )
        VALUES (
          v_talent,
          p_tenant_id,
          NULLIF(v_hold->>'inquiry_id', '')::uuid,
          COALESCE(NULLIF(trim(v_hold->>'title'), ''), 'Reservation'),
          v_starts,
          v_ends,
          false,
          'firm',
          CASE
            WHEN p_ttl_seconds IS NULL THEN now() + interval '48 hours'
            ELSE now() + make_interval(secs => p_ttl_seconds)
          END,
          p_actor_id,
          v_key
        )
        RETURNING id, expires_at INTO v_hold_id, v_expires;

        v_hold_ids := v_hold_ids || v_hold_id;
      END LOOP;
    END IF;

    v_result := jsonb_build_object(
      'ok', true,
      'already', false,
      'hold_ids', to_jsonb(v_hold_ids),
      'allocation_ids', to_jsonb(v_alloc_ids),
      'expires_at', v_expires
    );
  EXCEPTION
    WHEN SQLSTATE 'RS001' THEN
      -- Reaching here means the block rolled back: no allocation, no hold, no
      -- stamp. Local variables survive a subtransaction rollback while rows do
      -- not, so the id arrays are cleared by hand — they name rows that are
      -- gone.
      GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
      v_ctx := COALESCE(NULLIF(v_detail, ''), '{}')::jsonb;
      v_hold_ids := '{}';
      v_alloc_ids := '{}';
      v_expires := NULL;
      v_result := jsonb_build_object(
        'ok', false,
        'reason', v_reason,
        'failed_pool_id', NULLIF(v_ctx->>'failed_pool_id', '')::uuid,
        'failed_talent_id', NULLIF(v_ctx->>'failed_talent_id', '')::uuid
      );
  END;

  -- ── settle ─────────────────────────────────────────────────────────────────
  IF COALESCE((v_result->>'ok')::boolean, false) IS TRUE THEN
    UPDATE public.resource_set_operations
       SET state = 'done',
           hold_ids = v_hold_ids,
           allocation_ids = v_alloc_ids,
           expires_at = v_expires
     WHERE tenant_id = p_tenant_id
       AND operation_key = v_key;
  ELSE
    DELETE FROM public.resource_set_operations
     WHERE tenant_id = p_tenant_id
       AND operation_key = v_key;
  END IF;

  RETURN v_result;
EXCEPTION
  -- These are the FUNCTION's handlers, not the writing block's, so they unwind
  -- one level further out: the claim was taken inside this block too, and goes
  -- with everything else. None of them needs to clean the ledger, because the
  -- row never existed. (The RS001 handler above cannot do that — it must leave
  -- the claim standing for the settle step to delete.)
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN deadlock_detected OR serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadlock', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'failed_pool_id', NULL, 'failed_talent_id', v_talent, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_resource_set_v2(uuid, text, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resource_set_v2(uuid, text, uuid, integer, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.reserve_resource_set_v2(uuid, text, uuid, integer, jsonb, jsonb) IS
  'T1-01: reserve_resource_set with an operation key claimed before any resource is touched. A replay of the same (tenant, key) returns the first answer with already=true. The body is a subtransaction, so a refusal rolls back every allocation and hold it had already written and then releases the key: replaying a refused key behaves exactly like a first attempt.';

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_resource_set_v2(uuid,text,uuid,integer,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_resource_set_v2(uuid,text,uuid,integer,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reserve_resource_set_v2 is executable by anon/authenticated; the REVOKE did not take';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.reserve_resource_set_v2(uuid,text,uuid,integer,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'reserve_resource_set_v2 is not executable by service_role; the GRANT did not take';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.resource_set_operations'::regclass) THEN
    RAISE EXCEPTION 'resource_set_operations has RLS disabled';
  END IF;
  IF has_table_privilege('anon', 'public.resource_set_operations', 'SELECT')
     OR has_table_privilege('anon', 'public.resource_set_operations', 'INSERT') THEN
    RAISE EXCEPTION 'anon can reach resource_set_operations';
  END IF;
  IF has_table_privilege('authenticated', 'public.resource_set_operations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.resource_set_operations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.resource_set_operations', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can write resource_set_operations; writes are service_role only';
  END IF;
END
$check$;

-- ── executable proof ─────────────────────────────────────────────────────────
--
-- Sequential replay, a refusal that frees its key, and the stamp. The
-- CONCURRENT replay needs two sessions and is proven separately against the
-- isolated branch; what a single session can show, it shows here.
DO $proof$
DECLARE
  v_tenant  uuid;
  v_talent  uuid;
  v_actor   uuid;
  v_key     text := 'proof:t1-01:' || gen_random_uuid()::text;
  v_key2    text := 'proof:t1-01:refusal:' || gen_random_uuid()::text;
  v_key3    text := 'proof:t1-01:half-built:' || gen_random_uuid()::text;
  v_key4    text := 'proof:t1-01:ghost-hold:' || gen_random_uuid()::text;
  v_first   jsonb;
  v_second  jsonb;
  v_refused jsonb;
  v_rows    int;
  v_units   int;
  v_pool    uuid;
  v_starts  timestamptz := timestamptz '2099-03-01 10:00:00+00';
  v_ends    timestamptz := timestamptz '2099-03-01 10:45:00+00';
  v_holds   jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies WHERE id = '33333333-3333-4333-8333-333333333333';
  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to prove against — refusing to apply an unproven change';
  END IF;

  SELECT id INTO v_talent FROM public.talent_profiles ORDER BY created_at LIMIT 1;
  IF v_talent IS NULL THEN
    RAISE EXCEPTION 'no talent profile to prove a holds-only set against';
  END IF;

  SELECT id INTO v_actor FROM auth.users ORDER BY created_at LIMIT 1;

  v_holds := jsonb_build_array(jsonb_build_object(
    'talent_profile_id', v_talent,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'title', 'proof-replay'
  ));

  v_first := public.reserve_resource_set_v2(v_tenant, v_key, v_actor, 900, '[]'::jsonb, v_holds);
  IF COALESCE((v_first->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'first reserve refused: %', v_first;
  END IF;
  IF (v_first->>'already')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'first reserve claimed to be a replay: %', v_first;
  END IF;
  IF jsonb_array_length(v_first->'hold_ids') <> 1 THEN
    RAISE EXCEPTION 'first reserve wrote % holds, expected 1', jsonb_array_length(v_first->'hold_ids');
  END IF;

  -- THE DEFECT, in one call: before this change the caller re-ran the whole
  -- reservation whenever the answer was lost, so this second command wrote a
  -- second hold on the same person for the same minutes.
  v_second := public.reserve_resource_set_v2(v_tenant, v_key, v_actor, 900, '[]'::jsonb, v_holds);
  IF COALESCE((v_second->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'replay refused instead of answering already: %', v_second;
  END IF;
  IF (v_second->>'already')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'replay did not report already: %', v_second;
  END IF;
  IF v_second->'hold_ids' <> v_first->'hold_ids' THEN
    RAISE EXCEPTION 'replay answered with different holds: % vs %', v_second->'hold_ids', v_first->'hold_ids';
  END IF;

  SELECT count(*) INTO v_rows FROM public.talent_holds WHERE operation_key = v_key;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'the replayed operation owns % holds, expected exactly 1', v_rows;
  END IF;

  -- A refusal must not own the key afterwards, or one sold-out attempt would
  -- lock that order out of ever reserving.
  v_refused := public.reserve_resource_set_v2(
    v_tenant, v_key2, v_actor, 900,
    jsonb_build_array(jsonb_build_object('pool_id', gen_random_uuid(), 'units', 1)),
    '[]'::jsonb
  );
  IF (v_refused->>'reason') IS DISTINCT FROM 'pool_not_found' THEN
    RAISE EXCEPTION 'expected pool_not_found, got %', v_refused;
  END IF;
  SELECT count(*) INTO v_rows FROM public.resource_set_operations
   WHERE tenant_id = v_tenant AND operation_key = v_key2;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a refusal left its claim behind; that key is now poisoned';
  END IF;

  -- ...and the freed key still works.
  v_refused := public.reserve_resource_set_v2(
    v_tenant, v_key2, v_actor, 900, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'talent_profile_id', v_talent,
      'starts_at', timestamptz '2099-03-01 12:00:00+00',
      'ends_at', timestamptz '2099-03-01 12:30:00+00',
      'title', 'proof-after-refusal'
    ))
  );
  IF COALESCE((v_refused->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'the key freed by a refusal could not be reused: %', v_refused;
  END IF;

  -- ── a refusal that arrives AFTER an earlier leg succeeded ────────────────
  --
  -- This is the case the first version of this file got wrong. Both sets below
  -- refuse on their LAST leg, so the body has already written by the time it
  -- decides; the subtransaction is what takes those rows back.

  v_pool := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 5, 'proof-t1-01-refusal');

  -- One good capacity leg, then a hold with an empty talent id. Before the
  -- fix this refused with `invalid` and still held a seat, and the replay held
  -- a second one.
  v_refused := public.reserve_resource_set_v2(
    v_tenant, v_key3, v_actor, 900,
    jsonb_build_array(jsonb_build_object('pool_id', v_pool, 'units', 1)),
    jsonb_build_array(jsonb_build_object(
      'talent_profile_id', '',
      'starts_at', timestamptz '2099-08-01 10:00:00+00',
      'ends_at', timestamptz '2099-08-01 10:45:00+00'
    ))
  );
  IF (v_refused->>'reason') IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'expected invalid on the bad hold, got %', v_refused;
  END IF;

  -- Replay the IDENTICAL command: a second refusal must not be a second seat.
  v_second := public.reserve_resource_set_v2(
    v_tenant, v_key3, v_actor, 900,
    jsonb_build_array(jsonb_build_object('pool_id', v_pool, 'units', 1)),
    jsonb_build_array(jsonb_build_object(
      'talent_profile_id', '',
      'starts_at', timestamptz '2099-08-01 10:00:00+00',
      'ends_at', timestamptz '2099-08-01 10:45:00+00'
    ))
  );
  IF (v_second->>'reason') IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'the replay of a refused key answered % instead of the same invalid', v_second;
  END IF;

  SELECT COALESCE(sum(units), 0), count(*)
    INTO v_units, v_rows
    FROM public.capacity_allocations
   WHERE pool_id = v_pool AND state <> 'released';
  IF v_rows <> 0 OR v_units <> 0 THEN
    RAISE EXCEPTION 'two refused calls left % allocation(s) holding % unit(s)', v_rows, v_units;
  END IF;
  SELECT count(*) INTO v_rows FROM public.resource_set_operations
   WHERE tenant_id = v_tenant AND operation_key = v_key3;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a refusal kept its claim; the key is poisoned';
  END IF;

  -- A good hold, then a bad one on the same person. Before the fix the good
  -- hold survived the refusal and the replay answered slot_taken, blocked by
  -- the ghost its own refusal had left.
  v_refused := public.reserve_resource_set_v2(
    v_tenant, v_key4, v_actor, 900, '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'talent_profile_id', v_talent,
        'starts_at', timestamptz '2099-09-01 10:00:00+00',
        'ends_at', timestamptz '2099-09-01 10:45:00+00'),
      jsonb_build_object(
        'talent_profile_id', v_talent,
        'starts_at', timestamptz '2099-09-01 12:00:00+00',
        'ends_at', timestamptz '2099-09-01 11:00:00+00')
    )
  );
  IF (v_refused->>'reason') IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'expected invalid on the second hold, got %', v_refused;
  END IF;
  SELECT count(*) INTO v_rows FROM public.talent_holds
   WHERE talent_profile_id = v_talent
     AND starts_at >= timestamptz '2099-09-01 00:00:00+00'
     AND starts_at < timestamptz '2099-09-02 00:00:00+00';
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'a REFUSED reservation left % firm hold(s) on a real calendar', v_rows;
  END IF;

  v_second := public.reserve_resource_set_v2(
    v_tenant, v_key4, v_actor, 900, '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object(
        'talent_profile_id', v_talent,
        'starts_at', timestamptz '2099-09-01 10:00:00+00',
        'ends_at', timestamptz '2099-09-01 10:45:00+00'),
      jsonb_build_object(
        'talent_profile_id', v_talent,
        'starts_at', timestamptz '2099-09-01 12:00:00+00',
        'ends_at', timestamptz '2099-09-01 11:00:00+00')
    )
  );
  IF (v_second->>'reason') IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'the replay answered % instead of the same invalid; a ghost row is blocking it', v_second;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id = v_pool;
  DELETE FROM public.capacity_pools WHERE id = v_pool;
  DELETE FROM public.talent_holds WHERE operation_key IN (v_key, v_key2, v_key3, v_key4);
  DELETE FROM public.resource_set_operations WHERE operation_key IN (v_key, v_key2, v_key3, v_key4);

  RAISE NOTICE 'reserve_resource_set_v2: replay returns the first answer, a refusal frees its key AND leaves no allocation and no hold behind';
END
$proof$;

COMMIT;
