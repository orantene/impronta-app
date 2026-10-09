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

// ── 437: a hub sale is the talent's own, so the pay page names her, not the hub ──
import { resolveOrderPayeeName } from "./payee-name";

function orderFake(opts: { agency: Record<string, unknown>; lineTalentIds: Array<string | null>; talentName?: string | null }) {
  return {
    from: (t: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "is", "order", "limit"]) b[m] = () => b;
      b.eq = () => (t === "order_lines" ? Promise.resolve({ data: opts.lineTalentIds.map((x) => ({ talent_profile_id: x })) }) : b);
      b.maybeSingle = () =>
        Promise.resolve({
          data: t === "agencies" ? opts.agency : t === "talent_profiles" ? { display_name: opts.talentName ?? null } : null,
          error: null,
        });
      return b;
    },
  } as never;
}

const HUB = { display_name: "Impronta Hub", workspace_type: "hub", kind: "hub", plan_tier: "network" };

test("hub order with one talent on its lines shows her name, not the hub", async () => {
  const a = orderFake({ agency: HUB, lineTalentIds: ["tp1", "tp1"], talentName: "Rosa" });
  assert.equal(await resolveOrderPayeeName(a, "hub", "o1"), "Rosa");
});
test("hub order with mixed talent keeps the hub name", async () => {
  const a = orderFake({ agency: HUB, lineTalentIds: ["tp1", "tp2"], talentName: "Rosa" });
  assert.equal(await resolveOrderPayeeName(a, "hub", "o1"), "Impronta Hub");
});
test("hub order with no talent line keeps the hub name", async () => {
  const a = orderFake({ agency: HUB, lineTalentIds: [null], talentName: "Rosa" });
  assert.equal(await resolveOrderPayeeName(a, "hub", "o1"), "Impronta Hub");
});
test("an agency order keeps the agency name even with a talent on the line", async () => {
  const a = orderFake({ agency: { display_name: "Maison", workspace_type: "business", kind: "agency", plan_tier: "pro" }, lineTalentIds: ["tp1"], talentName: "Rosa" });
  assert.equal(await resolveOrderPayeeName(a, "t1", "o1"), "Maison");
});
test("a hub talent with no display name keeps the hub name", async () => {
  const a = orderFake({ agency: HUB, lineTalentIds: ["tp1"], talentName: "  " });
  assert.equal(await resolveOrderPayeeName(a, "hub", "o1"), "Impronta Hub");
});
