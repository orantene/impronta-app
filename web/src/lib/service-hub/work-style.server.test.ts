import assert from "node:assert/strict";
import test from "node:test";

import { loadWorkStyle, saveWorkStyle } from "./work-style.server";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

type FakeOpts = { stored?: Record<string, unknown> | null; readError?: { code?: string } | null; insertError?: { code?: string } | null; updateMatches?: boolean };

function fake(result: Result | FakeOpts) {
  const r = result as Result & FakeOpts;
  const written: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const q: Record<string, unknown> = {};
  let mode: "select" | "update" = "select";
  q.select = () => q;
  q.eq = () => q;
  q.maybeSingle = async () => ({ data: r.stored !== undefined ? r.stored : (r.data ?? null), error: r.readError ?? r.error ?? null });
  q.insert = async (row: Record<string, unknown>) => (written.push(row), { error: r.insertError ?? (r.stored === undefined ? r.error : null) ?? null });
  q.upsert = q.insert;
  q.update = (row: Record<string, unknown>) => ((mode = "update"), updated.push(row), q);
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: mode === "update" ? (r.updateMatches === false ? [] : [{ tenant_id: "t1" }]) : null, error: null }).then(ok);
  return { admin: { from: () => q } as never, written, updated };
}

const STORED_AGENCY = { work_model: "coordinator_agency", requests_go_to: "workspace", chat_seen_by: "workspace", price_shown: "talent_plus_margin", split_kind: "margin", split_bps: 2000, safety_officer: false };

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
  assert.deepEqual(res, { ok: true, changed: true });
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

test("re-picking a different style does not write; it returns exactly what would change", async () => {
  const f = fake({ stored: STORED_AGENCY });
  const res = await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "open_network" });
  assert.equal(res.ok, false);
  if (!res.ok && res.reason === "confirm_required") assert.ok(res.changes.some((c) => c.field === "priceShown" && c.from === "talent_plus_margin" && c.to === "talent_price"));
  else assert.fail("expected confirm_required");
  assert.equal(f.updated.length, 0);
  assert.equal(f.written.length, 0);
});

test("with the confirm, the change is applied", async () => {
  const f = fake({ stored: STORED_AGENCY });
  const res = await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "open_network", confirmed: true });
  assert.deepEqual(res, { ok: true, changed: true });
  assert.equal(f.updated[0].work_model, "open_network");
});

test("re-picking the same style writes nothing", async () => {
  const f = fake({ stored: STORED_AGENCY });
  assert.deepEqual(await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "coordinator_agency" }), { ok: true, changed: false });
  assert.equal(f.updated.length + f.written.length, 0);
});

test("a stored row that cannot be read back is never overwritten, even with a confirm", async () => {
  const f = fake({ stored: { ...STORED_AGENCY, split_kind: "weird" } });
  assert.deepEqual(await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "open_network", confirmed: true }), { ok: false, reason: "failed" });
  assert.equal(f.updated.length, 0);
});

test("a concurrent change between the read and the update asks again instead of overwriting", async () => {
  const f = fake({ stored: STORED_AGENCY, updateMatches: false });
  const res = await saveWorkStyle(f.admin, { tenantId: "t1", userId: "u1", choice: "open_network", confirmed: true });
  assert.equal(res.ok === false && res.reason === "confirm_required", true);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

test("the action and the page both check owner or admin, and the action passes the confirm through", () => {
  const act = readFileSync(join(process.cwd(), "src/lib/server-actions/work-style.ts"), "utf8");
  assert.match(act, /canSetWorkStyle\(/);
  assert.match(act, /agency_memberships/);
  assert.match(act, /confirmed: raw\?\.confirmed === true/);
  const page = readFileSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/work-style/page.tsx"), "utf8");
  assert.match(page, /canSetWorkStyle\(/);
});
