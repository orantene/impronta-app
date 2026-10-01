import assert from "node:assert/strict";
import { test } from "node:test";
import { resolvePayeeName } from "./payee-name";

function fake(tables: Record<string, unknown>) {
  const q = (t: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: tables[t] ?? null, error: null });
    return b;
  };
  return { from: q } as never;
}

test("business workspace uses the agency name", async () => {
  const a = fake({ agencies: { display_name: "Maison", workspace_type: "business" } });
  assert.equal(await resolvePayeeName(a, "t1"), "Maison");
});
test("talent workspace uses the talent public name", async () => {
  const a = fake({
    agencies: { display_name: "Jor workspace", workspace_type: "talent" },
    agency_memberships: { profile_id: "p1" },
    talent_profiles: { id: "tp1", display_name: "Jor Beauty" },
  });
  assert.equal(await resolvePayeeName(a, "t1"), "Jor Beauty");
});
test("talent workspace without a profile falls back to the agency name", async () => {
  const a = fake({ agencies: { display_name: "Jor workspace", workspace_type: "talent" } });
  assert.equal(await resolvePayeeName(a, "t1"), "Jor workspace");
});
