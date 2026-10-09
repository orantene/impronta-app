import assert from "node:assert/strict";
import test from "node:test";

import { ensureSoloTalentTenantId } from "./solo-talent-tenant";
import { ensureHubRosterRow } from "./ensure-hub-roster.server";

type RosterRow = { id: string; tenant_id: string; status: string };
type Rows = {
  roster?: RosterRow[];
  profile?: { user_id: string | null; created_by_agency_id: string | null } | null;
  rosterError?: boolean;
};

/** Fake admin client recording writes; reads roster rows like the real helper. */
function fakeDb(rows: Rows) {
  const writes: Array<{ kind: "insert" | "update"; payload: unknown }> = [];
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
      if (table === "agency_talent_roster") {
        q.then = (res: (v: unknown) => unknown) =>
          res(
            rows.rosterError
              ? { data: null, error: { message: "boom" } }
              : { data: rows.roster ?? [], error: null },
          );
        q.insert = async (payload: unknown) => {
          writes.push({ kind: "insert", payload });
          return { error: null };
        };
        q.update = (payload: unknown) => {
          writes.push({ kind: "update", payload });
          return { eq: async () => ({ error: null }) };
        };
      } else {
        q.maybeSingle = async () => ({ data: rows.profile ?? null, error: null });
      }
      return q;
    },
  };
  return { db: db as never, writes };
}

const solo = { user_id: "u1", created_by_agency_id: null };
const hubDeps = (db: never) => ({
  ensureHub: (a: { talentProfileId: string; addedBy: string }) =>
    ensureHubRosterRow(db, { ...a, originDomain: null }, { resolveHub: async () => ({ tenantId: "hub" }) }),
});

test("roster-less solo talent is healed onto the hub", async () => {
  const { db, writes } = fakeDb({ profile: solo, roster: [] });
  const id = await ensureSoloTalentTenantId(db, "tp1", hubDeps(db));
  assert.equal(id, "hub");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].kind, "insert");
});

test("talent whose only row is REMOVED gets no hub row", async () => {
  const { db, writes } = fakeDb({ profile: solo, roster: [{ id: "r1", tenant_id: "hub", status: "removed" }] });
  assert.equal(await ensureSoloTalentTenantId(db, "tp1", hubDeps(db)), null);
  assert.deepEqual(writes, []);
});

test("sole INACTIVE hub row is promoted; sole inactive agency row is not", async () => {
  const a = fakeDb({ profile: solo, roster: [{ id: "r1", tenant_id: "hub", status: "inactive" }] });
  assert.equal(await ensureSoloTalentTenantId(a.db, "tp1", hubDeps(a.db)), "hub");
  assert.equal(a.writes.length, 1);
  assert.equal(a.writes[0].kind, "update");

  const b = fakeDb({ profile: solo, roster: [{ id: "r2", tenant_id: "agency", status: "inactive" }] });
  assert.equal(await ensureSoloTalentTenantId(b.db, "tp1", hubDeps(b.db)), null);
  assert.deepEqual(b.writes, []);
});

test("talent with an active (agency or hub) row is untouched", async () => {
  for (const tenant_id of ["agency", "hub"]) {
    const { db, writes } = fakeDb({ profile: solo, roster: [{ id: "r1", tenant_id, status: "active" }] });
    assert.equal(await ensureSoloTalentTenantId(db, "tp1", hubDeps(db)), null);
    assert.deepEqual(writes, []);
  }
});

test("agency-created or ownerless profile is not healed", async () => {
  for (const profile of [
    { user_id: "u1", created_by_agency_id: "a1" },
    { user_id: null, created_by_agency_id: null },
  ]) {
    const { db, writes } = fakeDb({ profile, roster: [] });
    assert.equal(await ensureSoloTalentTenantId(db, "tp1", hubDeps(db)), null);
    assert.deepEqual(writes, []);
  }
});

test("roster read error writes nothing; hub failure fails closed", async () => {
  const { db, writes } = fakeDb({ profile: solo, rosterError: true });
  assert.equal(await ensureSoloTalentTenantId(db, "tp1", hubDeps(db)), null);
  assert.deepEqual(writes, []);
  const id = await ensureSoloTalentTenantId(db, "tp1", {
    ensureHub: async () => ({ ok: false, reason: "no_hub" }),
  });
  assert.equal(id, null);
});
