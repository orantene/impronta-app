import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231211000_session_ops.sql"), "utf8");
  assert.match(sql, /session_cancelled/);
  assert.match(sql, /ticket_refund_intents/);
  assert.doesNotMatch(sql, /executeBookingRefund|stripe/i);
  assert.match(sql, /reserve_resource_set_v2/);
});
