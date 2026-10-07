import assert from "node:assert/strict";
import test from "node:test";

import { ensureHubRosterRow, shouldCreateHubRoster } from "./ensure-hub-roster.server";

type Row = { id: string; tenant_id: string; status: string };
type Opts = {
  rows?: Row[];
  insertError?: { code?: string; message: string } | null;
  readError?: boolean;
};

function fakeDb(o: Opts) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    from() {
      let isUpdate = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) q[m] = () => q;
      q.then = (res: (v: unknown) => void) =>
        res(
          o.readError
            ? { data: null, error: { message: "boom" } }
            : isUpdate
              ? { error: null }
              : { data: o.rows ?? [], error: null },
        );
      q.insert = async (row: unknown) => {
        inserts.push(row);
        return { error: o.insertError ?? null };
      };
      q.update = (row: unknown) => {
        updates.push(row);
        isUpdate = true;
        return q;
      };
      return q;
    },
  };
  return { db: db as never, inserts, updates };
}

const hub = async () => ({ tenantId: "hub1" });
const args = { talentProfileId: "t1", addedBy: "u1" };

test("decision: add a hub row only when the talent has no roster row at all", () => {
  assert.equal(shouldCreateHubRoster({ hasAnyRosterRow: false }), true);
  assert.equal(shouldCreateHubRoster({ hasAnyRosterRow: true }), false);
});

test("active agency row: skipped, nothing written", async () => {
  const { db, inserts, updates } = fakeDb({ rows: [{ id: "r1", tenant_id: "agencyA", status: "active" }] });
  const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "skipped_has_roster", tenantId: "agencyA" });
  assert.equal(inserts.length + updates.length, 0);
});

test("only a pending agency row: skipped, no surprise hub row", async () => {
  const { db, inserts, updates } = fakeDb({ rows: [{ id: "r1", tenant_id: "agencyA", status: "pending" }] });
  const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "skipped_has_roster", tenantId: null });
  assert.equal(inserts.length + updates.length, 0);
});

test("only an inactive agency row: skipped", async () => {
  const { db, inserts, updates } = fakeDb({ rows: [{ id: "r1", tenant_id: "agencyA", status: "inactive" }] });
  const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
  assert.equal(r.ok && r.outcome, "skipped_has_roster");
  assert.equal(inserts.length + updates.length, 0);
});

test("only a removed row (agency or hub): skipped, never re-added", async () => {
  for (const tenant_id of ["agencyA", "hub1"]) {
    const { db, inserts, updates } = fakeDb({ rows: [{ id: "r1", tenant_id, status: "removed" }] });
    const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
    assert.deepEqual(r, { ok: true, outcome: "skipped_has_roster", tenantId: null });
    assert.equal(inserts.length + updates.length, 0);
  }
});

test("no row: creates an active site_visible hub row", async () => {
  const { db, inserts } = fakeDb({});
  const r = await ensureHubRosterRow(db, { ...args, originDomain: "tulala.digital" }, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "created", tenantId: "hub1" });
  const row = inserts[0] as { status: string; tenant_id: string; agency_visibility: string; origin_domain: string };
  assert.equal(row.status, "active");
  assert.equal(row.tenant_id, "hub1");
  assert.equal(row.agency_visibility, "site_visible");
  assert.equal(row.origin_domain, "tulala.digital");
});

test("sole pending/inactive HUB row is promoted instead of duplicated", async () => {
  for (const status of ["pending", "inactive"]) {
    const { db, inserts, updates } = fakeDb({ rows: [{ id: "r1", tenant_id: "hub1", status }] });
    const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
    assert.deepEqual(r, { ok: true, outcome: "promoted", tenantId: "hub1" });
    assert.equal(inserts.length, 0);
    assert.equal(updates.length, 1);
  }
});

test("hub row plus another row: skipped, not promoted", async () => {
  const { db, inserts, updates } = fakeDb({
    rows: [
      { id: "r1", tenant_id: "hub1", status: "pending" },
      { id: "r2", tenant_id: "agencyA", status: "removed" },
    ],
  });
  const r = await ensureHubRosterRow(db, args, { resolveHub: hub });
  assert.equal(r.ok && r.outcome, "skipped_has_roster");
  assert.equal(inserts.length + updates.length, 0);
});

test("hub missing: typed no-op", async () => {
  const { db, inserts } = fakeDb({});
  const r = await ensureHubRosterRow(db, { talentProfileId: "t1", addedBy: null }, { resolveHub: async () => null });
  assert.deepEqual(r, { ok: false, reason: "no_hub" });
  assert.equal(inserts.length, 0);
});

test("insert error: typed failure, never throws; duplicate key is success", async () => {
  const bad = fakeDb({ insertError: { message: "nope" } });
  assert.deepEqual(
    await ensureHubRosterRow(bad.db, { talentProfileId: "t1", addedBy: null }, { resolveHub: hub }),
    { ok: false, reason: "db_error" },
  );
  const dup = fakeDb({ insertError: { code: "23505", message: "dup" } });
  const r = await ensureHubRosterRow(dup.db, { talentProfileId: "t1", addedBy: null }, { resolveHub: hub });
  assert.equal(r.ok, true);
});

test("read error: fails closed, nothing written", async () => {
  const { db, inserts, updates } = fakeDb({ readError: true });
  assert.deepEqual(await ensureHubRosterRow(db, args, { resolveHub: hub }), { ok: false, reason: "db_error" });
  assert.equal(inserts.length + updates.length, 0);
});
