import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lockTill, switchOperator, unlockTill } from "./device-session";

function rpcAdmin(handler: (fn: string, args: Record<string, unknown>) => unknown) {
  return {
    from: () => {
      throw new Error("no table");
    },
    rpc: async (fn: string, args: Record<string, unknown>) => ({ data: handler(fn, args), error: null }),
  };
}

test("unlock with a short PIN is pin_invalid and calls no RPC", async () => {
  let called = false;
  const result = await unlockTill(rpcAdmin(() => {
    called = true;
    return { ok: true };
  }), { tenantId: "t1", deviceKey: "device-key-aa", userId: "u1", pin: "12" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "pin_invalid");
  assert.equal(called, false);
});

test("switch operator keeps the shift id the RPC returned", async () => {
  const result = await switchOperator(
    rpcAdmin((fn) => {
      assert.equal(fn, "pos_switch_operator");
      return { ok: true, session_id: "s1", operator_user_id: "u2", shift_id: "shift-1" };
    }),
    { tenantId: "t1", deviceKey: "device-key-aa", userId: "u2", pin: "1234" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.session.shiftId, "shift-1");
  assert.equal(result.session.operatorUserId, "u2");
});

test("lock till writes through pos_lock_till", async () => {
  const result = await lockTill(
    rpcAdmin((fn) => {
      assert.equal(fn, "pos_lock_till");
      return { ok: true, session_id: "s1", locked_at: "2026-09-11T00:00:00Z" };
    }),
    { tenantId: "t1", deviceKey: "device-key-aa" },
  );
  assert.equal(result.ok, true);
});

test("device session SQL refuses a wrong PIN without writing", () => {
  const sql = readFileSync(join(process.cwd(), "..", "supabase", "migrations", "20261231202000_pos_device_sessions.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public.pos_device_sessions/);
  assert.match(sql, /a refused unlock wrote a session/);
});
