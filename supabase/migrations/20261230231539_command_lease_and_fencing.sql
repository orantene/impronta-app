-- Command claims get a LEASE and an OWNER TOKEN, and completion is FENCED.
--
-- Timestamp sorts after 20261230002200 and, critically, after
-- 20261230001300_command_envelope_and_outbox.sql, which is the migration that
-- creates `command_idempotency`. A calendar-dated prefix (20260909...) would
-- sort BEFORE the CREATE TABLE and this file would fail on a from-scratch
-- push. The HHMMSS half is this agent's own `date -u` second, so two agents
-- working the same hour cannot collide on the version.
--
--
-- WHAT WAS WRONG
-- ══════════════
-- Takeover of an abandoned claim was decided by comparing `created_at` against
-- a constant in the application (`STALE_CLAIM_MS`). Three separate defects
-- followed from that one shape:
--
--   1. NO OWNERSHIP. The row said "in flight" and nothing said BY WHOM. Two
--      runners could each read the row, each decide it was stale, each update
--      it to in_flight, and both believe they held it. The conditional
--      `.eq("status", status)` did not help: both saw 'in_flight' and both
--      wrote 'in_flight', so the compare-and-set compared a value to itself.
--
--   2. THE STAMP WAS UNGUARDED. `UPDATE ... WHERE id = claim_id` succeeded for
--      whoever ran it last. A runner that was taken over while its handler was
--      still working would later stamp its own result over the winner's, so
--      the recorded result belonged to the losing attempt and every subsequent
--      replay handed that out.
--
--   3. AGE IS NOT LIVENESS. `created_at` says when the work STARTED, not
--      whether anyone is still doing it. A five minute constant is
--      simultaneously too short for a slow handler (it gets stolen from
--      mid-flight) and too long for a crashed tab (the button stays dead).
--
-- A lease inverts all three: the owner keeps the claim alive by saying so, and
-- silence is what expires it.
--
--
-- WHAT AN OUTCOME IS ALLOWED TO CLAIM
-- ═══════════════════════════════════
-- `effects` is the whole reason this migration is not just a lease. A failed
-- command used to report "nothing was changed" whatever had happened, which is
-- a sentence the code had no standing to say: a handler that wrote three rows
-- and then threw changed a great deal. The column records what the handler
-- ASSERTED, and the default for a claim that is still in flight is 'unknown',
-- because a runner that vanished mid-handler is the case where we know least.
--
--   none     the handler asserts it wrote nothing. The only value that earns
--            the sentence "Nothing was changed."
--   partial  the handler wrote some of its effect and knows which part.
--   unknown  nobody can say. The default while in flight, and what a plain
--            thrown error becomes.
--   done     completed successfully.
--
--
-- WHY THREE FUNCTIONS AND NOT THREE STATEMENTS
-- ════════════════════════════════════════════
-- Each of these is a read followed by a conditional write, and the window
-- between them is exactly where the old code lost the race. Inside a function
-- the row is held under FOR UPDATE across both halves, so the compare-and-set
-- is a compare-and-set rather than two statements hoping.
--
-- Refusals are DATA. `fenced` is not an exception, because a fenced runner has
-- to be able to tell its caller what happened, and an exception through
-- PostgREST arrives as an infrastructure error indistinguishable from a
-- transport failure. That distinction is the point of the whole task.

BEGIN;

-- ── the lease, the owner, and what the handler asserted ────────────────────

ALTER TABLE public.command_idempotency
  -- Minted per ATTEMPT, not per row. A takeover mints a new one, which is what
  -- makes the previous owner's stamp detectable rather than silent.
  ADD COLUMN IF NOT EXISTS owner_token uuid,
  -- The only fact that decides takeover. NULL on a legacy row written by the
  -- pre-lease runner, and a NULL lease is treated as expired: those rows are
  -- from the era that had no liveness signal at all, so there is nothing to
  -- steal from.
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  -- The caller's view of the aggregate at claim time, kept so an operator
  -- looking at an abandoned claim can see which version it was arguing about.
  ADD COLUMN IF NOT EXISTS expected_revision integer,
  -- The revision the handler produced, replayed alongside the result so a
  -- retry does not have to re-read to find out where it landed.
  ADD COLUMN IF NOT EXISTS result_revision integer,
  ADD COLUMN IF NOT EXISTS effects text NOT NULL DEFAULT 'unknown'
    CHECK (effects IN ('none', 'partial', 'unknown', 'done'));

-- Historical rows: a recorded success DID happen, so calling it 'unknown'
-- would be its own small lie. Everything else stays 'unknown', which is the
-- truth about rows written before anything tracked this.
UPDATE public.command_idempotency
   SET effects = 'done'
 WHERE status = 'succeeded'
   AND effects = 'unknown';

COMMENT ON COLUMN public.command_idempotency.owner_token IS
  'Per-attempt ownership. A takeover mints a new one; command_complete refuses a token that no longer matches, so a crashed owner cannot stamp over the runner that replaced it.';
COMMENT ON COLUMN public.command_idempotency.lease_expires_at IS
  'When this claim may be taken over. Extended by command_heartbeat while a handler runs. NULL means a pre-lease row and is treated as expired.';
COMMENT ON COLUMN public.command_idempotency.effects IS
  'What the handler ASSERTED it did. Only ''none'' earns the sentence "Nothing was changed."; an in-flight claim is ''unknown'' because a runner that vanished mid-handler is the case where we know least.';

-- The sweep and the Exceptions inbox both ask the same question: which claims
-- are in flight with a lease that has run out. Partial, because a settled row
-- is never that and there will eventually be far more settled rows.
CREATE INDEX IF NOT EXISTS command_idempotency_lease_expiry_idx
  ON public.command_idempotency (lease_expires_at)
  WHERE status = 'in_flight';

-- The table's grants are deliberately left as `20261230001300` set them:
-- REVOKE ALL from anon and authenticated, service_role only. No staff SELECT
-- policy is added here because there is no table-level SELECT grant for
-- `authenticated` to exercise it with, and an inert policy is worse than an
-- absent one: it reads like access that exists. The Exceptions inbox reads
-- this table under the service role and scopes by tenant in the query.

-- ── command_claim ──────────────────────────────────────────────────────────
--
-- Four answers, and the caller has to be able to tell them apart:
--   claimed    you own it. Here is your token and when your lease runs out.
--   replayed   this exact intent already succeeded. Same result, no work.
--   in_flight  someone else owns it and their lease is still good.
--   conflict   the key was reused with different arguments.
--
-- The insert comes first and the read second, not the other way round. A read
-- that finds nothing followed by an insert has a window in which two callers
-- both find nothing; `ON CONFLICT DO NOTHING` collapses that into one atomic
-- attempt where exactly one caller gets a row back.

CREATE OR REPLACE FUNCTION public.command_claim(
  p_tenant_id        uuid,
  p_command          text,
  p_idempotency_key  text,
  p_fingerprint      text,
  p_actor_user_id    uuid DEFAULT NULL,
  p_correlation_id   text DEFAULT NULL,
  p_expected_revision integer DEFAULT NULL,
  p_lease_seconds    integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_token   uuid := gen_random_uuid();
  v_lease   integer := GREATEST(5, LEAST(3600, COALESCE(p_lease_seconds, 90)));
  v_expires timestamptz;
  v_row     public.command_idempotency%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_command IS NULL OR p_idempotency_key IS NULL
     OR p_fingerprint IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'refused', 'reason', 'bad_input');
  END IF;

  v_expires := now() + make_interval(secs => v_lease);

  INSERT INTO public.command_idempotency (
    tenant_id, command, idempotency_key, request_fingerprint,
    actor_user_id, correlation_id, expected_revision,
    status, owner_token, lease_expires_at, effects, attempt_count
  ) VALUES (
    p_tenant_id, p_command, p_idempotency_key, p_fingerprint,
    p_actor_user_id, p_correlation_id, p_expected_revision,
    'in_flight', v_token, v_expires, 'unknown', 1
  )
  ON CONFLICT (tenant_id, command, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'outcome', 'claimed',
      'claim_id', v_id, 'owner_token', v_token,
      'lease_expires_at', v_expires, 'attempt_count', 1, 'took_over', false
    );
  END IF;

  SELECT * INTO v_row
    FROM public.command_idempotency
   WHERE tenant_id = p_tenant_id
     AND command = p_command
     AND idempotency_key = p_idempotency_key
   FOR UPDATE;

  IF NOT FOUND THEN
    -- The row lost the insert and then vanished before the read. Nothing was
    -- written by us, and guessing is how a caller ends up running unclaimed.
    RETURN jsonb_build_object('ok', false, 'outcome', 'refused', 'reason', 'vanished');
  END IF;

  -- The fingerprint check comes BEFORE the status check on purpose. A key
  -- reused with different arguments is wrong whatever state the first request
  -- reached, and answering "in flight" would send the caller into a polling
  -- loop waiting for an answer that was never theirs.
  IF v_row.request_fingerprint IS DISTINCT FROM p_fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'outcome', 'conflict', 'reason', 'fingerprint_mismatch');
  END IF;

  IF v_row.status = 'succeeded' THEN
    RETURN jsonb_build_object(
      'ok', true, 'outcome', 'replayed',
      'result', v_row.result, 'revision', v_row.result_revision,
      'claim_id', v_row.id
    );
  END IF;

  IF v_row.status = 'in_flight'
     AND v_row.lease_expires_at IS NOT NULL
     AND v_row.lease_expires_at > now() THEN
    RETURN jsonb_build_object(
      'ok', true, 'outcome', 'in_flight',
      'lease_expires_at', v_row.lease_expires_at, 'claim_id', v_row.id
    );
  END IF;

  -- Failed, or in flight with a lease that has run out. THIS is the
  -- compare-and-set: the predicate names the exact state we read, so a second
  -- caller that got here first has already changed `owner_token` and this
  -- update touches nothing.
  UPDATE public.command_idempotency
     SET status = 'in_flight',
         owner_token = v_token,
         lease_expires_at = v_expires,
         attempt_count = v_row.attempt_count + 1,
         effects = 'unknown',
         error_message = NULL,
         completed_at = NULL,
         result = NULL,
         result_revision = NULL,
         expected_revision = p_expected_revision
   WHERE id = v_row.id
     AND owner_token IS NOT DISTINCT FROM v_row.owner_token
     AND (status = 'failed' OR lease_expires_at IS NULL OR lease_expires_at <= now());

  IF NOT FOUND THEN
    -- Someone took it between our read and our write. "Still running" is the
    -- true answer, and it is not an error.
    RETURN jsonb_build_object(
      'ok', true, 'outcome', 'in_flight',
      'lease_expires_at', v_row.lease_expires_at, 'claim_id', v_row.id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'outcome', 'claimed',
    'claim_id', v_row.id, 'owner_token', v_token,
    'lease_expires_at', v_expires,
    'attempt_count', v_row.attempt_count + 1, 'took_over', true
  );
EXCEPTION
  WHEN OTHERS THEN
    -- The function's subtransaction rolled back, so no claim exists and the
    -- handler must not run. 'unavailable' is the caller's signal to stop, not
    -- to try again.
    RETURN jsonb_build_object('ok', false, 'outcome', 'refused', 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.command_claim(uuid, text, text, text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.command_claim(uuid, text, text, text, uuid, text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.command_claim(uuid, text, text, text, uuid, text, integer, integer) IS
  'Claim a command under a lease. Returns claimed / replayed / in_flight / conflict. Takeover is a compare-and-set on an expired lease and mints a NEW owner_token, so the previous owner is fenced out of command_complete.';

-- ── command_complete ───────────────────────────────────────────────────────
--
-- The fence. A stamp whose token no longer matches writes NOTHING and says so,
-- which is the difference between "your result was recorded" and "your result
-- was recorded over somebody else's".
--
-- A success is forced to effects 'done' rather than trusting the caller, and a
-- failure is forbidden from claiming 'done'. The one sentence this whole
-- change exists to protect is "Nothing was changed.", and it is only earned by
-- effects 'none' on a failure.

CREATE OR REPLACE FUNCTION public.command_complete(
  p_claim_id        uuid,
  p_owner_token     uuid,
  p_status          text,
  p_result          jsonb DEFAULT NULL,
  p_result_revision integer DEFAULT NULL,
  p_effects         text DEFAULT 'unknown',
  p_error_message   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.command_idempotency%ROWTYPE;
  v_effects text;
BEGIN
  IF p_claim_id IS NULL OR p_owner_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_effects IS NOT NULL AND p_effects NOT IN ('none', 'partial', 'unknown', 'done') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  IF p_status = 'succeeded' THEN
    v_effects := 'done';
  ELSIF COALESCE(p_effects, 'unknown') = 'done' THEN
    -- A failure that calls itself done is a contradiction, and the safe way to
    -- resolve it is not to pick one.
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  ELSE
    v_effects := COALESCE(p_effects, 'unknown');
  END IF;

  SELECT * INTO v_row
    FROM public.command_idempotency
   WHERE id = p_claim_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_row.owner_token IS DISTINCT FROM p_owner_token THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'fenced',
      'current_status', v_row.status,
      'attempt_count', v_row.attempt_count
    );
  END IF;

  UPDATE public.command_idempotency
     SET status = p_status,
         result = CASE WHEN p_status = 'succeeded' THEN p_result ELSE NULL END,
         result_revision = CASE WHEN p_status = 'succeeded' THEN p_result_revision ELSE NULL END,
         effects = v_effects,
         error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE NULL END,
         completed_at = now(),
         -- The token is retired with the attempt. A second stamp from the same
         -- runner is fenced too, which is what stops a retried transport
         -- failure from writing twice.
         owner_token = NULL,
         lease_expires_at = NULL
   WHERE id = p_claim_id
     AND owner_token = p_owner_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fenced', 'current_status', v_row.status);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', p_status, 'effects', v_effects,
    'revision', CASE WHEN p_status = 'succeeded' THEN p_result_revision ELSE NULL END
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.command_complete(uuid, uuid, text, jsonb, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.command_complete(uuid, uuid, text, jsonb, integer, text, text) TO service_role;

COMMENT ON FUNCTION public.command_complete(uuid, uuid, text, jsonb, integer, text, text) IS
  'Settle a claim. Refuses with reason=fenced when the owner_token no longer matches, so a runner that was taken over cannot stamp over its replacement. Success is forced to effects=done; a failure may never claim done.';

-- ── command_heartbeat ──────────────────────────────────────────────────────
--
-- For handlers that outlive the lease. The alternative shapes are both worse:
-- a lease long enough for the slowest command makes a crashed tab unusable for
-- that long, and no lease at all is what we are replacing.
--
-- A fenced heartbeat is the earliest honest signal a runner can get that it no
-- longer owns its work.

CREATE OR REPLACE FUNCTION public.command_heartbeat(
  p_claim_id      uuid,
  p_owner_token   uuid,
  p_lease_seconds integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lease   integer := GREATEST(5, LEAST(3600, COALESCE(p_lease_seconds, 90)));
  v_expires timestamptz;
BEGIN
  IF p_claim_id IS NULL OR p_owner_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  v_expires := now() + make_interval(secs => v_lease);

  UPDATE public.command_idempotency
     SET lease_expires_at = v_expires
   WHERE id = p_claim_id
     AND owner_token = p_owner_token
     AND status = 'in_flight';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fenced');
  END IF;

  RETURN jsonb_build_object('ok', true, 'lease_expires_at', v_expires);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.command_heartbeat(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.command_heartbeat(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.command_heartbeat(uuid, uuid, integer) IS
  'Extend the lease on a claim the caller still owns. Returns reason=fenced once the token stops matching, which is the earliest honest signal a runner has that its work was taken over.';

-- ── the REVOKE actually took ───────────────────────────────────────────────

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.command_claim(uuid,text,text,text,uuid,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.command_claim(uuid,text,text,text,uuid,text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.command_complete(uuid,uuid,text,jsonb,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.command_complete(uuid,uuid,text,jsonb,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.command_heartbeat(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.command_heartbeat(uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'command lease RPCs are executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

-- ── proof ──────────────────────────────────────────────────────────────────
--
-- Nine assertions against the real functions, cleaning up after itself. It
-- runs inside this migration's transaction, so a wrong answer aborts the whole
-- file rather than shipping a lease that does not fence.
--
-- `now()` is transaction start time and does not advance inside one
-- transaction, so an expired lease is produced by writing one, not by waiting.

DO $proof$
DECLARE
  v_tenant uuid;
  v_first  jsonb;
  v_second jsonb;
  v_third  jsonb;
  v_stamp  jsonb;
  v_claim  uuid;
  v_tok1   uuid;
  v_tok2   uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE NOTICE '[command lease proof] skipped: no agency row to hang a tenant_id on';
    RETURN;
  END IF;

  DELETE FROM public.command_idempotency
   WHERE tenant_id = v_tenant AND command = 'proof.commandLease';

  -- 1. a first claim mints an owner token and a lease
  v_first := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-1', 'fp-1', NULL, NULL, 7, 90);
  IF v_first->>'outcome' <> 'claimed' THEN
    RAISE EXCEPTION '[proof 1] expected claimed, got %', v_first;
  END IF;
  v_claim := (v_first->>'claim_id')::uuid;
  v_tok1  := (v_first->>'owner_token')::uuid;

  -- 2. a concurrent identical claim under a LIVE lease is in_flight, not a second run
  v_second := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-1', 'fp-1', NULL, NULL, 7, 90);
  IF v_second->>'outcome' <> 'in_flight' THEN
    RAISE EXCEPTION '[proof 2] a live lease was taken over: %', v_second;
  END IF;

  -- 3. the same key with different arguments is refused, not answered
  v_second := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-1', 'fp-DIFFERENT', NULL, NULL, 7, 90);
  IF v_second->>'reason' <> 'fingerprint_mismatch' THEN
    RAISE EXCEPTION '[proof 3] expected fingerprint_mismatch, got %', v_second;
  END IF;

  -- 4. an EXPIRED lease is taken over, on the same row, with a NEW token
  UPDATE public.command_idempotency
     SET lease_expires_at = now() - interval '1 second'
   WHERE id = v_claim;

  v_third := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-1', 'fp-1', NULL, NULL, 7, 90);
  IF v_third->>'outcome' <> 'claimed' OR (v_third->>'took_over')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '[proof 4] an expired lease was not taken over: %', v_third;
  END IF;
  v_tok2 := (v_third->>'owner_token')::uuid;
  IF v_tok2 = v_tok1 THEN
    RAISE EXCEPTION '[proof 4] the takeover reused the crashed owner token';
  END IF;
  IF (v_third->>'claim_id')::uuid <> v_claim THEN
    RAISE EXCEPTION '[proof 4] the takeover moved the claim to a different row';
  END IF;
  IF (v_third->>'attempt_count')::int <> 2 THEN
    RAISE EXCEPTION '[proof 4] the takeover did not count as an attempt: %', v_third;
  END IF;

  -- 5. the crashed owner is FENCED and writes nothing
  v_stamp := public.command_complete(v_claim, v_tok1, 'succeeded', '{"who":"loser"}'::jsonb, 99, 'done', NULL);
  IF (v_stamp->>'ok')::boolean IS DISTINCT FROM FALSE OR v_stamp->>'reason' <> 'fenced' THEN
    RAISE EXCEPTION '[proof 5] the previous owner was not fenced: %', v_stamp;
  END IF;
  PERFORM 1 FROM public.command_idempotency
   WHERE id = v_claim AND status = 'in_flight' AND result IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '[proof 5] the fenced completion wrote anyway';
  END IF;

  -- 6. the heartbeat obeys the same fence
  IF (public.command_heartbeat(v_claim, v_tok1, 90))->>'reason' <> 'fenced' THEN
    RAISE EXCEPTION '[proof 6] a crashed owner kept its lease alive';
  END IF;
  IF ((public.command_heartbeat(v_claim, v_tok2, 90))->>'ok')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '[proof 6] the live owner could not extend its own lease';
  END IF;

  -- 7. the winner stamps, and the record is the winner's
  v_stamp := public.command_complete(v_claim, v_tok2, 'succeeded', '{"who":"winner"}'::jsonb, 9, 'done', NULL);
  IF (v_stamp->>'ok')::boolean IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION '[proof 7] the owner could not stamp: %', v_stamp;
  END IF;
  PERFORM 1 FROM public.command_idempotency
   WHERE id = v_claim AND result->>'who' = 'winner' AND effects = 'done';
  IF NOT FOUND THEN
    RAISE EXCEPTION '[proof 7] the stored result is not the winner''s';
  END IF;

  -- 8. a replay hands back the recorded result AND revision, and runs nothing
  v_first := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-1', 'fp-1', NULL, NULL, 7, 90);
  IF v_first->>'outcome' <> 'replayed'
     OR (v_first->>'revision')::int <> 9
     OR v_first->'result'->>'who' <> 'winner' THEN
    RAISE EXCEPTION '[proof 8] expected the winner replayed at revision 9, got %', v_first;
  END IF;

  -- 9. a partial failure is recorded as partial, never as "nothing changed"
  v_first := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-2', 'fp-9', NULL, NULL, NULL, 90);
  v_stamp := public.command_complete(
    (v_first->>'claim_id')::uuid, (v_first->>'owner_token')::uuid,
    'failed', NULL, NULL, 'partial', 'the receipt was written and the ticket was not'
  );
  IF (v_stamp->>'ok')::boolean IS DISTINCT FROM TRUE OR v_stamp->>'effects' <> 'partial' THEN
    RAISE EXCEPTION '[proof 9] a partial failure was not recorded as partial: %', v_stamp;
  END IF;
  -- and a failure may not call itself done
  v_first := public.command_claim(v_tenant, 'proof.commandLease', 'proof-key-3', 'fp-10', NULL, NULL, NULL, 90);
  v_stamp := public.command_complete(
    (v_first->>'claim_id')::uuid, (v_first->>'owner_token')::uuid,
    'failed', NULL, NULL, 'done', 'a lie'
  );
  IF (v_stamp->>'ok')::boolean IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '[proof 9] a failure was allowed to claim it completed: %', v_stamp;
  END IF;

  DELETE FROM public.command_idempotency
   WHERE tenant_id = v_tenant AND command = 'proof.commandLease';

  RAISE NOTICE '[command lease proof] claim, live-lease refusal, fingerprint conflict, takeover, fence, heartbeat, replay and partial all held';
END
$proof$;

COMMIT;
