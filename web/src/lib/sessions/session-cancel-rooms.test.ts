import assert from "node:assert/strict";
import test from "node:test";

import { sessionCancel } from "./session-ops";

type Row = Record<string, unknown>;

function fakeAdmin(sessions: Row[], live: Row[]) {
  const released: string[][] = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "session_cancel") {
        for (const s of sessions) if (args.p_scope === "this" ? s.id === args.p_session_id : true) s.status = "cancelled";
        return { data: { ok: true, sessions_cancelled: 1 }, error: null };
      }
      if (fn === "release_capacity") {
        released.push(args.p_allocation_ids as string[]);
        return { data: { released: (args.p_allocation_ids as string[]).length, already_released: 0 }, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const filters: Array<(r: Row) => boolean> = [];
      const b: Record<string, unknown> = {};
      const rows = table === "sessions" ? sessions : table === "capacity_allocations" ? live : [];
      b.select = () => b;
      b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b);
      b.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b);
      b.limit = () => b;
      b.maybeSingle = async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null });
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(ok);
      return b;
    },
  };
  return { admin: admin as never, released };
}

const live = [
  { id: "a-s1", tenant_id: "t", operation_key: "session:s1:resources", state: "committed" },
  { id: "a-s2", tenant_id: "t", operation_key: "session:s2:resources", state: "committed" },
];

test("cancelling one session gives back that session's room only", async () => {
  const sessions = [{ id: "s1", tenant_id: "t", series_id: "ser", status: "scheduled" }, { id: "s2", tenant_id: "t", series_id: "ser", status: "scheduled" }];
  const { admin, released } = fakeAdmin(sessions, live);
  const r = await sessionCancel(admin, { tenantId: "t", sessionId: "s1", scope: "this", reason: "teacher ill", operationKey: "key-123456" });
  assert.equal(r.ok, true);
  assert.deepEqual(released, [["a-s1"]]);
});

test("cancelling the series gives back every cancelled session's room", async () => {
  const sessions = [{ id: "s1", tenant_id: "t", series_id: "ser", status: "scheduled" }, { id: "s2", tenant_id: "t", series_id: "ser", status: "scheduled" }];
  const { admin, released } = fakeAdmin(sessions, live);
  const r = await sessionCancel(admin, { tenantId: "t", sessionId: "s1", scope: "series", reason: "closed", operationKey: "key-123456" });
  assert.equal(r.ok, true);
  assert.deepEqual(released.flat().sort(), ["a-s1", "a-s2"]);
});

test("a session with no room hold changes nothing; the cancel still succeeds", async () => {
  const sessions = [{ id: "s9", tenant_id: "t", series_id: null, status: "scheduled" }];
  const { admin, released } = fakeAdmin(sessions, []);
  const r = await sessionCancel(admin, { tenantId: "t", sessionId: "s9", scope: "this", reason: "x", operationKey: "key-123456" });
  assert.equal(r.ok, true);
  assert.deepEqual(released, []);
});
