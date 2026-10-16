import assert from "node:assert/strict";
import test from "node:test";

import { defaultWeeklyHours } from "./essentials";
import { essentialsSkipWarning, resolveEssentialsForBuild } from "./essentials-resolve";

test("no services at all: the build reports essentials:no_services instead of staying silent", () => {
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: [], discipline: null, tradeSlug: null, country: "MX", locale: "es" });
  assert.equal(e, null);
  assert.equal(essentialsSkipWarning(e), "essentials:no_services");
  assert.equal(essentialsSkipWarning(undefined), "essentials:no_services");
});

test("services read from the brief are kept and produce no warning", () => {
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: ["Limpieza profunda"], discipline: null, tradeSlug: null, country: "MX", locale: "es" });
  assert.equal(essentialsSkipWarning(e), null);
  assert.deepEqual(e?.hours, defaultWeeklyHours());
});

test("TUL-650: a failed first offerings write is retried once so a confirmed talent is never left with no services", async () => {
  const { runEssentialsWrites } = await import("./essentials");
  const rows: string[] = [];
  let calls = 0;
  const store = {
    async listOfferings() { return rows.map((title, i) => ({ id: `o${i}`, title, status: "published" })); },
    async insertOfferings(_o: unknown, ins: { title: string }[]) {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      for (const r of ins) rows.push(r.title);
    },
    async updateOffering() {},
    async upsertTalentHours() { return true; },
    async setTalentBookable() {},
    async setTalentPlace() {},
    async setWorkspaceBusinessInfo() {},
    async enableWorkspaceAppointments() {},
    async hasActiveProvider() { return false; },
    async inviteFirstProvider() { return "invited" as const; },
  };
  const e = resolveEssentialsForBuild({ essentials: null, serviceFacts: ["Lash lift", "Lash fill"], discipline: null, tradeSlug: null, country: "MX", locale: "en" });
  assert.ok(e);
  const out = await runEssentialsWrites(store, { choice: "myself", essentials: e, talent: { talentProfileId: "tp1", tenantId: "t1" }, workspace: null });
  assert.equal(rows.length, 2);
  assert.ok(out.warnings.some((w) => w.startsWith("essentials:offerings:")));
  assert.ok(out.warnings.includes("essentials:offerings_recovered"));
});
