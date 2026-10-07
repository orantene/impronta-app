import assert from "node:assert/strict";
import test from "node:test";

import { ensureSoloTalentTenantId } from "./solo-talent-tenant";

type Rows = {
  roster?: { tenant_id: string } | null;
  profile?: { user_id: string | null; created_by_agency_id: string | null } | null;
  rosterError?: boolean;
};

function fakeDb(rows: Rows) {
  return {
    from(table: string) {
      const result = () => {
        if (table === "agency_talent_roster") {
          return rows.rosterError
            ? { data: null, error: { message: "boom" } }
            : { data: rows.roster ?? null, error: null };
        }
        return { data: rows.profile ?? null, error: null };
      };
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) q[m] = () => q;
      q.maybeSingle = async () => result();
      return q;
    },
  } as never;
}

test("solo talent with no roster row heals onto the hub", async () => {
  const calls: string[][] = [];
  const id = await ensureSoloTalentTenantId(
    fakeDb({ profile: { user_id: "u1", created_by_agency_id: null } }),
    "tp1",
    {
      ensureHub: async (t, u) => {
        calls.push([t, u]);
        return { ok: true, tenantId: "hub" };
      },
    },
  );
  assert.equal(id, "hub");
  assert.deepEqual(calls, [["tp1", "u1"]]);
});

test("agency talent (live roster row) is never moved to the hub", async () => {
  let called = false;
  const id = await ensureSoloTalentTenantId(
    fakeDb({ roster: { tenant_id: "agency" }, profile: { user_id: "u1", created_by_agency_id: null } }),
    "tp1",
    {
      ensureHub: async () => {
        called = true;
        return { ok: true, tenantId: "hub" };
      },
    },
  );
  assert.equal(id, null);
  assert.equal(called, false);
});

test("agency-created or ownerless profile is not healed", async () => {
  for (const profile of [
    { user_id: "u1", created_by_agency_id: "a1" },
    { user_id: null, created_by_agency_id: null },
  ]) {
    let called = false;
    const id = await ensureSoloTalentTenantId(fakeDb({ profile }), "tp1", {
      ensureHub: async () => {
        called = true;
        return { ok: true, tenantId: "hub" };
      },
    });
    assert.equal(id, null);
    assert.equal(called, false);
  }
});

test("roster read error and hub failure both fail closed", async () => {
  assert.equal(await ensureSoloTalentTenantId(fakeDb({ rosterError: true }), "tp1"), null);
  const id = await ensureSoloTalentTenantId(
    fakeDb({ profile: { user_id: "u1", created_by_agency_id: null } }),
    "tp1",
    { ensureHub: async () => ({ ok: false, error: "no hub" }) },
  );
  assert.equal(id, null);
});
