import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkStyle, saveWorkStyle } from "./work-style.server";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

function fake(result: Result) {
  const written: Array<Record<string, unknown>> = [];
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: result.data ?? null, error: result.error ?? null });
  q.upsert = async (row: Record<string, unknown>) => (written.push(row), { error: result.error ?? null });
  return { admin: { from: () => q } as never, written };
}

test("a stored answer is read back", async () => {
  const { admin } = fake({ data: { work_model: "team_studio" } });
  assert.deepEqual(await loadWorkStyle(admin, "t1"), { kind: "chosen", choice: "team_studio" });
});

test("no row, or a table that is not applied yet, means not chosen", async () => {
  assert.deepEqual(await loadWorkStyle(fake({ data: null }).admin, "t1"), { kind: "none" });
  assert.deepEqual(await loadWorkStyle(fake({ error: { code: "42P01" } }).admin, "t1"), { kind: "none" });
  assert.deepEqual(await loadWorkStyle(fake({ error: { code: "PGRST205" } }).admin, "t1"), { kind: "none" });
});

test("any other read error is unknown, never 'not chosen yet'", async () => {
  assert.deepEqual(await loadWorkStyle(fake({ error: { code: "57014", message: "timeout" } }).admin, "t1"), { kind: "unknown" });
});

test("a bad stored value is treated as not chosen", async () => {
  assert.deepEqual(await loadWorkStyle(fake({ data: { work_model: "weird" } }).admin, "t1"), { kind: "none" });
});

test("saving writes the choice and the whole preset for this workspace only", async () => {
  const f = fake({});
  const res = await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "open_network" });
  assert.deepEqual(res, { ok: true });
  const row = f.written[0];
  assert.equal(row.tenant_id, "t1");
  assert.equal(row.work_model, "open_network");
  assert.equal(row.requests_go_to, "talent");
  assert.equal(row.chat_seen_by, "talent");
  assert.equal(row.price_shown, "talent_price");
  assert.equal(row.split_kind, "percent");
  assert.equal(row.split_bps, 2000);
  assert.equal(row.safety_officer, true);
  assert.equal(row.chosen_by, "u1");
});

test("a rental studio saves with no rent amount", async () => {
  const f = fake({});
  await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "rental_studio" });
  assert.equal(f.written[0].split_kind, "rent");
  assert.equal(f.written[0].split_bps, null);
});

test("save reports unavailable when the table is missing and failed on other errors", async () => {
  assert.deepEqual(await saveWorkStyle(fake({ error: { code: "42P01" } }).admin, { tenantId: "t1", userId: "u1", choice: "team_studio" }), { ok: false, reason: "unavailable" });
  assert.deepEqual(await saveWorkStyle(fake({ error: { code: "23514" } }).admin, { tenantId: "t1", userId: "u1", choice: "team_studio" }), { ok: false, reason: "failed" });
});
