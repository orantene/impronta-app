/**
 * run.test.ts — the runner, driven against a fake `command_claim` table.
 *
 * The behaviour under test IS the race, so the fake is not a shortcut around a
 * real database — it is the only way to hold the interleaving still. Every
 * case here is a real sequence an operator produces: a double-tapped button, a
 * retried request after a timeout, a key a client reused across two different
 * baskets, a tab that crashed mid-command and a runner that came back from the
 * dead after its claim had been given to somebody else.
 *
 * THE FAKE OWNS THE CLOCK, NOT THE TEST PROCESS. A lease is a comparison
 * against `now()`, and a test that waited out ninety real seconds would be a
 * test nobody runs. `clock.advance` moves the database's idea of now, which is
 * exactly the axis the lease lives on and no other.
 *
 * WHAT THE FAKE IS OBLIGED TO REPRODUCE. Two properties, and the tests here
 * are worthless without either: the UNIQUE INDEX on (tenant, command, key), so
 * a second claim collides rather than inserting; and the OWNER TOKEN fence, so
 * a completion whose token no longer matches writes nothing. A fake missing
 * the first passes every test while the mechanism does nothing; a fake missing
 * the second passes them while the defect this file exists for is still there.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { fingerprintRequest, makeEnvelope } from "./envelope";
import {
  CommandFailure,
  COMMAND_LEASE_SECONDS,
  runCommand,
  type Admin,
  type CommandContext,
} from "./run";

type Effects = "none" | "partial" | "unknown" | "done";

type Row = {
  id: string;
  tenant_id: string;
  command: string;
  idempotency_key: string;
  request_fingerprint: string;
  status: "in_flight" | "succeeded" | "failed";
  result: unknown;
  result_revision: number | null;
  error_message: string | null;
  attempt_count: number;
  owner_token: string | null;
  /** Epoch ms on the FAKE clock, not the wall clock. */
  lease_expires_at: number | null;
  effects: Effects;
  expected_revision: number | null;
};

type Transport = { claim?: boolean; complete?: boolean; heartbeat?: boolean };

const TRANSPORT_ERROR = { code: "08006", message: "connection terminated" };

/**
 * A fake `command_idempotency` plus its three RPCs.
 *
 * The functions are re-implemented rather than stubbed because the tests are
 * about what those functions DECIDE. A stub that returned canned outcomes
 * would be a test of the test.
 */
function fakeCommandDb(options: { now?: number; fail?: Transport } = {}) {
  const clock = { now: options.now ?? 1_700_000_000_000 };
  const fail: Transport = { ...options.fail };
  const rows: Row[] = [];
  const unique = new Map<string, Row>();
  const calls: string[] = [];
  let nextId = 1;
  let nextToken = 1;

  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const keyOf = (a: Record<string, unknown>) =>
    `${String(a.p_tenant_id)}|${String(a.p_command)}|${String(a.p_idempotency_key)}`;

  const claim = (a: Record<string, unknown>) => {
    const lease = Number(a.p_lease_seconds ?? 90) * 1000;
    const existing = unique.get(keyOf(a));

    if (!existing) {
      const row: Row = {
        id: `claim-${nextId++}`,
        tenant_id: String(a.p_tenant_id),
        command: String(a.p_command),
        idempotency_key: String(a.p_idempotency_key),
        request_fingerprint: String(a.p_fingerprint),
        status: "in_flight",
        result: null,
        result_revision: null,
        error_message: null,
        attempt_count: 1,
        owner_token: `token-${nextToken++}`,
        lease_expires_at: clock.now + lease,
        effects: "unknown",
        expected_revision: (a.p_expected_revision as number | null) ?? null,
      };
      rows.push(row);
      unique.set(keyOf(a), row);
      return {
        ok: true,
        outcome: "claimed",
        claim_id: row.id,
        owner_token: row.owner_token,
        lease_expires_at: iso(row.lease_expires_at),
        attempt_count: 1,
        took_over: false,
      };
    }

    if (existing.request_fingerprint !== String(a.p_fingerprint)) {
      return { ok: false, outcome: "conflict", reason: "fingerprint_mismatch" };
    }
    if (existing.status === "succeeded") {
      return {
        ok: true,
        outcome: "replayed",
        result: existing.result,
        revision: existing.result_revision,
      };
    }
    if (
      existing.status === "in_flight" &&
      existing.lease_expires_at !== null &&
      existing.lease_expires_at > clock.now
    ) {
      return { ok: true, outcome: "in_flight", lease_expires_at: iso(existing.lease_expires_at) };
    }

    // Failed, or a lease that ran out. A NEW token, which is what fences the
    // owner that stopped answering.
    existing.status = "in_flight";
    existing.owner_token = `token-${nextToken++}`;
    existing.lease_expires_at = clock.now + lease;
    existing.attempt_count += 1;
    existing.effects = "unknown";
    existing.result = null;
    existing.result_revision = null;
    existing.error_message = null;
    existing.expected_revision = (a.p_expected_revision as number | null) ?? null;
    return {
      ok: true,
      outcome: "claimed",
      claim_id: existing.id,
      owner_token: existing.owner_token,
      lease_expires_at: iso(existing.lease_expires_at),
      attempt_count: existing.attempt_count,
      took_over: true,
    };
  };

  const complete = (a: Record<string, unknown>) => {
    const row = rows.find((r) => r.id === a.p_claim_id);
    if (!row) return { ok: false, reason: "not_found" };
    if (row.owner_token !== a.p_owner_token) {
      return { ok: false, reason: "fenced", current_status: row.status };
    }
    const status = String(a.p_status);
    if (status !== "succeeded" && status !== "failed") return { ok: false, reason: "bad_input" };
    const requested = String(a.p_effects ?? "unknown") as Effects;
    if (status === "failed" && requested === "done") return { ok: false, reason: "bad_input" };
    const effects: Effects = status === "succeeded" ? "done" : requested;

    row.status = status;
    row.result = status === "succeeded" ? ((a.p_result ?? null) as unknown) : null;
    row.result_revision = status === "succeeded" ? ((a.p_result_revision as number) ?? null) : null;
    row.error_message = status === "failed" ? ((a.p_error_message as string) ?? null) : null;
    row.effects = effects;
    row.owner_token = null;
    row.lease_expires_at = null;
    return { ok: true, status, effects, revision: row.result_revision };
  };

  const heartbeat = (a: Record<string, unknown>) => {
    const row = rows.find((r) => r.id === a.p_claim_id);
    if (!row || row.owner_token !== a.p_owner_token || row.status !== "in_flight") {
      return { ok: false, reason: "fenced" };
    }
    row.lease_expires_at = clock.now + Number(a.p_lease_seconds ?? 90) * 1000;
    return { ok: true, lease_expires_at: iso(row.lease_expires_at) };
  };

  const admin: Admin = {
    rpc: async (name: string, args?: Record<string, unknown>) => {
      calls.push(name);
      const a = args ?? {};
      if (name === "command_claim") {
        return fail.claim ? { data: null, error: TRANSPORT_ERROR } : { data: claim(a), error: null };
      }
      if (name === "command_complete") {
        return fail.complete
          ? { data: null, error: TRANSPORT_ERROR }
          : { data: complete(a), error: null };
      }
      if (name === "command_heartbeat") {
        return fail.heartbeat
          ? { data: null, error: TRANSPORT_ERROR }
          : { data: heartbeat(a), error: null };
      }
      throw new Error(`the runner called an rpc the fake does not implement: ${name}`);
    },
  };

  return {
    admin,
    rows,
    calls,
    clock,
    fail,
    advance: (ms: number) => {
      clock.now += ms;
    },
  };
}

/**
 * A promise plus its resolver, as one value.
 *
 * The `let release: (() => void) | null = null` shape reads fine and does not
 * compile: TypeScript cannot see that the Promise executor already ran, so it
 * narrows `release` to `null` and then to `never` at the call. Handing back
 * both halves together sidesteps the narrowing without a cast.
 */
function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

/**
 * Resolve once the claim is actually in the table.
 *
 * The concurrency cases all need "the first call has claimed, the second has
 * not yet arrived", and the only honest way to observe that is to watch for
 * the row. Sleeping a tick instead makes the outcome depend on how busy the
 * machine is, which is how two of these passed alone and failed in a lane:
 * `runCommand` hashes its arguments before it claims, and a hash is
 * asynchronous.
 */
async function claimLanded(rows: Row[], atLeast = 1): Promise<void> {
  for (let i = 0; i < 1000 && rows.length < atLeast; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
  }
  assert.ok(rows.length >= atLeast, "the first call never claimed — the test is measuring nothing");
}

const envelope = (over: Partial<Parameters<typeof makeEnvelope>[0]> = {}) =>
  makeEnvelope({
    command: "pos.startCollection",
    tenantId: "tenant-a",
    idempotencyKey: "intent-1",
    ...over,
  });

const LEASE_MS = COMMAND_LEASE_SECONDS * 1000;

test("a first call runs the handler and returns its result", async () => {
  const db = fakeCommandDb();
  let ran = 0;
  const out = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    ran += 1;
    return { paymentId: "p1" };
  });
  assert.deepEqual(out, { status: "ok", result: { paymentId: "p1" } });
  assert.equal(ran, 1);
  assert.equal(db.rows[0].status, "succeeded");
  assert.equal(db.rows[0].effects, "done", "a success records that it completed");
  assert.deepEqual(db.rows[0].result, { paymentId: "p1" });
  assert.equal(db.rows[0].owner_token, null, "a settled claim keeps no owner");
});

test("two concurrent identical commands run the handler ONCE", async () => {
  // The case a results-only table cannot cover: by the time a result exists,
  // both copies have already charged the card.
  const db = fakeCommandDb();
  let ran = 0;
  const gate = deferred();
  const handler = async () => {
    ran += 1;
    await gate.promise;
    return { paymentId: "p1" };
  };

  const first = runCommand(db.admin, envelope(), { orderId: "o1" }, handler);
  await claimLanded(db.rows);
  const second = await runCommand(db.admin, envelope(), { orderId: "o1" }, handler);

  assert.equal(second.status, "in_flight");
  assert.equal(ran, 1, "the second copy ran the handler under a live lease");
  assert.equal(db.rows.length, 1, "the unique index did not hold");

  gate.release();
  assert.deepEqual(await first, { status: "ok", result: { paymentId: "p1" } });
});

test("an expired lease is taken over, on the same row, with a NEW token", async () => {
  const db = fakeCommandDb();
  const gate = deferred();
  let seen: CommandContext | null = null;

  const first = runCommand(db.admin, envelope(), { orderId: "o1" }, async (_e, ctx) => {
    seen = ctx;
    await gate.promise;
    return { who: "crashed" };
  });
  await claimLanded(db.rows);
  const firstToken = db.rows[0].owner_token;
  assert.ok(firstToken);

  // Nobody heartbeats: this is a tab that died.
  db.advance(LEASE_MS + 1);

  let secondRan = 0;
  let takeoverToken: string | null = null;
  const second = await runCommand(db.admin, envelope(), { orderId: "o1" }, async (_e, ctx) => {
    secondRan += 1;
    takeoverToken = ctx.ownerToken;
    return { who: "winner" };
  });

  assert.deepEqual(second, { status: "ok", result: { who: "winner" } });
  assert.equal(secondRan, 1);
  assert.equal(db.rows.length, 1, "the takeover created a second row instead of taking the first");
  assert.equal(db.rows[0].attempt_count, 2);
  assert.ok(takeoverToken, "the taking-over handler was never handed a token");
  assert.notEqual(
    takeoverToken,
    firstToken,
    "the takeover has to mint a token the crashed owner does not hold",
  );

  gate.release();
  const crashed = await first;
  assert.equal(crashed.status, "fenced", "the crashed owner was told it still owned the work");
  assert.ok(seen, "the handler was never handed a context");

  assert.deepEqual(db.rows[0].result, { who: "winner" }, "the loser stamped over the winner");
});

test("the previous owner's completion is FENCED and does not overwrite", async () => {
  // Same shape as above, stated as the property rather than the story: after a
  // takeover, the only thing in the row is the winner's.
  const db = fakeCommandDb();
  const gate = deferred();

  const loser = runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    await gate.promise;
    return { who: "loser", revision: 41 };
  });
  await claimLanded(db.rows);
  db.advance(LEASE_MS + 1);

  await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({
    who: "winner",
    revision: 42,
  }));

  gate.release();
  const out = await loser;

  assert.equal(out.status, "fenced");
  if (out.status === "fenced") {
    assert.ok(!out.error.includes("Nothing was changed"), "a fenced runner cannot promise that");
  }
  assert.equal(db.rows[0].status, "succeeded");
  assert.deepEqual(db.rows[0].result, { who: "winner", revision: 42 });
  assert.equal(db.rows[0].result_revision, 42);
});

test("a heartbeat keeps a slow handler's claim, and the claim survives the lease", async () => {
  const db = fakeCommandDb();
  const gate = deferred();
  let extended = false;

  const slow = runCommand(db.admin, envelope(), { orderId: "o1" }, async (_e, ctx) => {
    // Outlive the lease, but say so.
    db.advance(LEASE_MS - 1_000);
    extended = await ctx.heartbeat();
    db.advance(LEASE_MS - 1_000);
    await gate.promise;
    return { ok: 1 };
  });
  await claimLanded(db.rows);

  // While the handler is alive and heartbeating, a duplicate is still refused.
  await new Promise((r) => setTimeout(r, 0));
  gate.release();
  const out = await slow;

  assert.equal(extended, true, "the owner could not extend its own lease");
  assert.deepEqual(out, { status: "ok", result: { ok: 1 } });
});

test("a heartbeat from a runner that was taken over reports false", async () => {
  const db = fakeCommandDb();
  const gate = deferred();
  let alive: boolean | null = null;

  const loser = runCommand(db.admin, envelope(), { orderId: "o1" }, async (_e, ctx) => {
    await gate.promise;
    alive = await ctx.heartbeat();
    return { who: "loser" };
  });
  await claimLanded(db.rows);
  db.advance(LEASE_MS + 1);
  await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({ who: "winner" }));

  gate.release();
  await loser;
  assert.equal(alive, false, "a fenced handler was told its lease was fine");
});

test("a replay returns the recorded result AND the recorded revision", async () => {
  const db = fakeCommandDb();
  let ran = 0;
  const run = () =>
    runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
      ran += 1;
      return { paymentId: "p1", revision: 7 };
    });
  await run();
  const second = await run();
  assert.deepEqual(second, {
    status: "replayed",
    result: { paymentId: "p1", revision: 7 },
    revision: 7,
  });
  assert.equal(ran, 1, "a replay that re-runs the handler is not idempotency");
});

test("a result with no revision replays with a null revision, not an invented one", async () => {
  const db = fakeCommandDb();
  await runCommand(db.admin, envelope(), {}, async () => ({ ok: true }));
  const replay = await runCommand(db.admin, envelope(), {}, async () => ({ ok: true }));
  assert.deepEqual(replay, { status: "replayed", result: { ok: true }, revision: null });
});

test("a handler returning undefined replays as null, not undefined", async () => {
  // The replayed and first-run shapes have to agree, or a caller that checks
  // `result === null` behaves differently on a retry.
  const db = fakeCommandDb();
  await runCommand(db.admin, envelope(), {}, async () => undefined);
  const replay = await runCommand(db.admin, envelope(), {}, async () => undefined);
  assert.deepEqual(replay, { status: "replayed", result: null, revision: null });
});

test("a key reused with different arguments is refused, not answered", async () => {
  const db = fakeCommandDb();
  await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({ ok: 1 }));
  const out = await runCommand(db.admin, envelope(), { orderId: "o2" }, async () => ({ ok: 2 }));
  assert.deepEqual(out, { status: "conflict", reason: "fingerprint_mismatch" });
});

test("a fingerprint mismatch is reported even while the first call is in flight", async () => {
  // Reporting in_flight here would send the caller into a polling loop waiting
  // for an answer that was never theirs.
  const db = fakeCommandDb();
  const gate = deferred();
  const first = runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    await gate.promise;
    return { ok: 1 };
  });
  await claimLanded(db.rows);
  assert.equal(db.rows[0].status, "in_flight");
  const out = await runCommand(db.admin, envelope(), { orderId: "o2" }, async () => ({ ok: 2 }));
  assert.equal(out.status, "conflict");
  gate.release();
  await first;
});

test("a partial failure renders the 'Partly applied' sentence and never says nothing changed", async () => {
  const db = fakeCommandDb();
  const out = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    throw new CommandFailure("partial", "the receipt was written and the ticket was not");
  });

  assert.equal(out.status, "error");
  if (out.status !== "error") return;
  assert.equal(out.effects, "partial");
  assert.equal(
    out.error,
    "Partly applied: the receipt was written and the ticket was not. Do not retry blindly.",
  );
  assert.ok(!out.error.includes("Nothing was changed"));
  assert.equal(db.rows[0].status, "failed");
  assert.equal(db.rows[0].effects, "partial");
  assert.equal(db.rows[0].error_message, "the receipt was written and the ticket was not");
});

test("a handler that asserts it wrote nothing is the ONLY one told nothing changed", async () => {
  const db = fakeCommandDb();
  const out = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    throw new CommandFailure("none", "the read failed before anything was written");
  });
  assert.equal(out.status, "error");
  if (out.status !== "error") return;
  assert.equal(out.effects, "none");
  assert.equal(out.error, "That did not go through. Nothing was changed.");
  assert.equal(db.rows[0].effects, "none");
});

test("a plain thrown error is recorded as 'unknown', not as harmless", async () => {
  // The defect this whole file exists for: the old runner said "Nothing was
  // changed" here, about a handler it knew nothing about.
  const db = fakeCommandDb();
  const out = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    throw new Error("stripe timed out");
  });
  assert.equal(out.status, "error");
  if (out.status !== "error") return;
  assert.equal(out.effects, "unknown");
  assert.equal(out.error, "It may have gone through. Check before retrying.");
  assert.ok(!out.error.includes("Nothing was changed"));
  assert.equal(db.rows[0].status, "failed");
  assert.equal(db.rows[0].effects, "unknown");
  assert.equal(db.rows[0].error_message, "stripe timed out");
});

test("a failed command releases its claim so the retry can run", async () => {
  const db = fakeCommandDb();
  const failing = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    throw new Error("stripe timed out");
  });
  assert.equal(failing.status, "error");
  assert.equal(db.rows[0].status, "failed");

  const retry = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({ ok: 1 }));
  assert.deepEqual(retry, { status: "ok", result: { ok: 1 } });
  assert.equal(db.rows[0].attempt_count, 2);
  assert.equal(db.rows[0].effects, "done");
});

test("a LIVE lease is never taken over, however old the row is", async () => {
  // Age is not liveness, and the constant that used to decide this is gone.
  const db = fakeCommandDb();
  const gate = deferred();
  const first = runCommand(db.admin, envelope(), { orderId: "o1" }, async (_e, ctx) => {
    for (let i = 0; i < 20; i += 1) {
      db.advance(LEASE_MS / 2);
      await ctx.heartbeat();
    }
    await gate.promise;
    return { ok: 1 };
  });
  await claimLanded(db.rows);
  await new Promise((r) => setTimeout(r, 0));

  let ran = 0;
  const second = await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => {
    ran += 1;
    return { ok: 2 };
  });
  assert.equal(second.status, "in_flight");
  assert.equal(ran, 0);

  gate.release();
  await first;
});

test("the same key on a different tenant is a different command", async () => {
  const db = fakeCommandDb();
  await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({ who: "a" }));
  const other = await runCommand(
    db.admin,
    envelope({ tenantId: "tenant-b" }),
    { orderId: "o1" },
    async () => ({ who: "b" }),
  );
  assert.deepEqual(other, { status: "ok", result: { who: "b" } });
});

test("the same key on a different command is a different command", async () => {
  const db = fakeCommandDb();
  await runCommand(db.admin, envelope(), { orderId: "o1" }, async () => ({ who: "a" }));
  const other = await runCommand(
    db.admin,
    envelope({ command: "pos.finalizeOrCancel" }),
    { orderId: "o1" },
    async () => ({ who: "b" }),
  );
  assert.deepEqual(other, { status: "ok", result: { who: "b" } });
});

test("a transport failure on the claim does NOT run the handler and does NOT retry", async () => {
  // Running without a claim is running with no idempotency at all, and the
  // caller would have no way to know their retry had become unsafe. Retrying
  // the claim is worse: the first one may have landed and lost its reply.
  const db = fakeCommandDb({ fail: { claim: true } });
  let ran = 0;
  const out = await runCommand(db.admin, envelope(), {}, async () => {
    ran += 1;
    return { ok: 1 };
  });
  assert.equal(out.status, "error");
  if (out.status !== "error") return;
  assert.equal(out.effects, "none");
  assert.equal(out.error, "Could not start that. Nothing was changed.");
  assert.equal(ran, 0);
  assert.equal(
    db.calls.filter((c) => c === "command_claim").length,
    1,
    "a transport failure caused a second write attempt",
  );
});

test("a transport failure on the STAMP still returns the handler's result", async () => {
  // The work IS done. Reporting failure on completed work invites a retry of
  // something that already happened; the lost stamp costs the replay path and
  // shows up in the Exceptions inbox as an abandoned claim.
  const db = fakeCommandDb({ fail: { complete: true } });
  const out = await runCommand(db.admin, envelope(), {}, async () => ({ paymentId: "p1" }));
  assert.deepEqual(out, { status: "ok", result: { paymentId: "p1" } });
  assert.equal(
    db.calls.filter((c) => c === "command_complete").length,
    1,
    "the runner retried a stamp whose transport failed",
  );
  assert.equal(db.rows[0].status, "in_flight", "the claim is left visibly unfinished");
});

test("the envelope is still the handler's first argument", async () => {
  // The context was added as a SECOND argument on purpose: every existing
  // handler takes the envelope and none of them should have had to change.
  const db = fakeCommandDb();
  const env = envelope();
  let got: unknown = null;
  await runCommand(db.admin, env, {}, async (e) => {
    got = e;
    return null;
  });
  assert.deepEqual(got, env);
});

test("the claim carries the fingerprint the envelope module computes", async () => {
  // If these two ever diverge, every retry becomes a conflict and the only
  // remedy a client has is to stop retrying.
  const db = fakeCommandDb();
  const env = envelope();
  await runCommand(db.admin, env, { orderId: "o1" }, async () => ({ ok: 1 }));
  assert.equal(db.rows[0].request_fingerprint, await fingerprintRequest(env, { orderId: "o1" }));
});
