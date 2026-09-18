import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { sessionCancel, sessionMoveParticipant, sessionSetInstructor } from "./session-ops";

test("instructor scope is passed through and a cancelled session refuses", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: { ok: false, reason: "already_cancelled" }, error: null };
    },
  };
  const result = await sessionSetInstructor(admin, {
    tenantId: "t1",
    sessionId: "s1",
    userId: "u1",
    scope: "future",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "already_cancelled");
  assert.equal(calls[0]?.args.p_scope, "future");
});

test("a sold-out move writes nothing in TS", async () => {
  const result = await sessionMoveParticipant(
    { rpc: async () => ({ data: { ok: false, reason: "sold_out" }, error: null }) },
    { tenantId: "t1", admissionId: "a1", toSessionId: "s2", operationKey: "move-aaaa" },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "sold_out");
});

test("cancel succeeds and surfaces paid_seats_need_refund without failing", async () => {
  const result = await sessionCancel(
    {
      rpc: async () => ({
        data: {
          ok: true,
          sessions_cancelled: 1,
          pools_deactivated: 1,
          admissions_voided: 2,
          refund_intents: 2,
          paid_seats_need_refund: true,
        },
        error: null,
      }),
    },
    { tenantId: "t1", sessionId: "s1", scope: "this", reason: "closed", operationKey: "cancel-aa" },
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.refundIntents, 2);
    assert.equal(result.paidSeatsNeedRefund, true);
  }
});

test("session ops SQL never refunds inline", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231217000_session_ops.sql"), "utf8");
  assert.match(sql, /session_cancelled/);
  assert.match(sql, /ticket_refund_intents/);
  assert.doesNotMatch(sql, /executeBookingRefund|stripe/i);
  assert.match(sql, /reserve_resource_set_v2/);
});

// D-136: the moved seat used to stay a 15-minute hold that the reaper freed.
// The LATEST definition of session_move_participant must commit the new
// allocation in the same transaction, before the old seat is released.
test("session_move_participant commits the new seat before releasing the old one", () => {
  const dir = join(process.cwd(), "..", "supabase", "migrations");
  const latest = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(join(dir, name), "utf8").includes("FUNCTION public.session_move_participant("));
  assert.ok(latest, "some migration defines session_move_participant");
  const sql = readFileSync(join(dir, latest!), "utf8");
  const body = sql.slice(sql.indexOf("FUNCTION public.session_move_participant("));
  const commitAt = body.indexOf("public.commit_capacity(ARRAY[v_alloc]");
  const releaseOldAt = body.indexOf("public.release_capacity(ARRAY[v_adm.allocation_id])");
  assert.ok(commitAt > 0, "the new allocation is committed");
  assert.ok(releaseOldAt > commitAt, "the old seat is released only after the new one is committed");
  assert.match(body, /v_commit->>'ok'/);
});

// D-168: 20261231244000 re-created ticket_refund_intents_reason_check with three
// reasons and silently dropped `session_cancelled` and `admission_exchange`;
// cancelling a session with a paid seat and exchanging a ticket both ended in
// 23514. The LATEST migration that defines the CHECK must admit every reason
// any writer (SQL RPC or TS) inserts.
test("ticket_refund_intents_reason_check admits every reason a writer inserts", () => {
  const dir = join(process.cwd(), "..", "supabase", "migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const latest = [...files]
    .reverse()
    .find((name) => readFileSync(join(dir, name), "utf8").includes("ADD CONSTRAINT ticket_refund_intents_reason_check"));
  assert.ok(latest, "some migration defines ticket_refund_intents_reason_check");
  const sql = readFileSync(join(dir, latest!), "utf8");
  const body = sql.slice(sql.indexOf("ADD CONSTRAINT ticket_refund_intents_reason_check"));
  const inList = body.match(/CHECK\s*\(\s*reason\s+IN\s*\(([\s\S]*?)\)\s*\)/i);
  assert.ok(inList, `${latest} spells the CHECK as reason IN (...)`);
  const allowed = new Set([...inList![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

  // SQL writers: every INSERT INTO public.ticket_refund_intents (... reason) SELECT ... 'x'
  const sqlReasons = new Set<string>();
  for (const name of files) {
    const text = readFileSync(join(dir, name), "utf8");
    for (const m of text.matchAll(/INSERT INTO public\.ticket_refund_intents\s*\([^)]*\breason\b[^)]*\)\s*(?:SELECT|VALUES)[^;]*?'([a-z_]+)'/g)) {
      sqlReasons.add(m[1]);
    }
  }
  // TS writers: the `reason` each insert/upsert on the table passes (a literal,
  // or `input.reason` whose input type names the literal).
  const tsReasons = new Set<string>();
  for (const rel of ["src/lib/events/ticket-refund-request.ts", "src/lib/events/mint-on-paid.ts", "src/lib/orders/capacity-lost-compensation.ts"]) {
    const text = readFileSync(join(process.cwd(), rel), "utf8");
    const writes = [...text.matchAll(/from\("ticket_refund_intents"\)\s*\.(?:insert|upsert)\([\s\S]*?reason:\s*(?:"([a-z_]+)"|input\.reason)/g)];
    assert.ok(writes.length > 0, `${rel} still writes ticket_refund_intents`);
    for (const m of writes) {
      if (m[1]) tsReasons.add(m[1]);
      else for (const t of text.matchAll(/reason:\s*"([a-z_]+)";/g)) tsReasons.add(t[1]);
    }
  }
  for (const expected of ["seat_lost_after_payment", "guest_request"]) {
    assert.ok(tsReasons.has(expected), `the TS writers still insert '${expected}'`);
  }
  const writers = new Set([...sqlReasons, ...tsReasons]);
  for (const expected of ["session_cancelled", "admission_exchange", "event_cancelled"]) {
    assert.ok(writers.has(expected), `the SQL writers still insert '${expected}'`);
  }
  const missing = [...writers].filter((r) => !allowed.has(r));
  assert.deepEqual(missing, [], `${latest} admits every writer reason; missing: ${missing.join(", ")}`);
});
