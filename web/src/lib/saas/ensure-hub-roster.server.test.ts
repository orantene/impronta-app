import assert from "node:assert/strict";
import test from "node:test";

import { ensureHubRosterRow, shouldCreateHubRoster } from "./ensure-hub-roster.server";

type Opts = {
  active?: Array<{ tenant_id: string }>;
  stale?: Array<{ id: string }>;
  insertError?: { code?: string; message: string } | null;
  readError?: boolean;
};

function fakeDb(o: Opts) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    from() {
      let isStale = false;
      let isUpdate = false;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) q[m] = () => q;
      q.in = () => {
        isStale = true;
        return q;
      };
      q.then = (res: (v: unknown) => void) =>
        res(
          o.readError
            ? { data: null, error: { message: "boom" } }
            : isUpdate
              ? { error: null }
              : { data: isStale ? (o.stale ?? []) : (o.active ?? []), error: null },
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

test("decision: add a hub row only without an active roster row", () => {
  assert.equal(shouldCreateHubRoster({ hasActiveRoster: false }), true);
  assert.equal(shouldCreateHubRoster({ hasActiveRoster: true }), false);
});

test("already on a roster: skipped, nothing written", async () => {
  const { db, inserts } = fakeDb({ active: [{ tenant_id: "agencyA" }] });
  const r = await ensureHubRosterRow(db, { talentProfileId: "t1", addedBy: "u1" }, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "skipped_has_roster", tenantId: "agencyA" });
  assert.equal(inserts.length, 0);
});

test("no roster: creates an active site_visible hub row", async () => {
  const { db, inserts } = fakeDb({});
  const r = await ensureHubRosterRow(db, { talentProfileId: "t1", addedBy: "u1" }, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "created", tenantId: "hub1" });
  assert.equal((inserts[0] as { status: string; tenant_id: string }).status, "active");
  assert.equal((inserts[0] as { tenant_id: string }).tenant_id, "hub1");
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

test("pending hub row is promoted instead of duplicated", async () => {
  const { db, inserts, updates } = fakeDb({ stale: [{ id: "r1" }] });
  const r = await ensureHubRosterRow(db, { talentProfileId: "t1", addedBy: null }, { resolveHub: hub });
  assert.deepEqual(r, { ok: true, outcome: "promoted", tenantId: "hub1" });
  assert.equal(inserts.length, 0);
  assert.equal(updates.length, 1);
});

test("read error: typed failure", async () => {
  const { db } = fakeDb({ readError: true });
  assert.deepEqual(
    await ensureHubRosterRow(db, { talentProfileId: "t1", addedBy: null }, { resolveHub: hub }),
    { ok: false, reason: "db_error" },
  );
});
