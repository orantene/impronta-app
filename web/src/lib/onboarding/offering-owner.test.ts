import assert from "node:assert/strict";
import test from "node:test";

import { offeringOwnerFor } from "./offering-owner";
import { runEssentialsWrites, suggestedEssentials, type Essentials, type EssentialsStore, type ExistingOffering, type OfferingOwnerRef, type OfferingRowDraft } from "./essentials";

test("solo business: the owner-provider owns the services", () => {
  assert.equal(offeringOwnerFor({ choice: "studio", ownerTalentProfileId: "tp1", providerCount: 1 }), "tp1");
});

test("studio with several providers stays house-owned", () => {
  assert.equal(offeringOwnerFor({ choice: "studio", ownerTalentProfileId: "tp1", providerCount: 2 }), null);
  assert.equal(offeringOwnerFor({ choice: "studio", ownerTalentProfileId: "tp1", providerCount: 0 }), null);
});

test("both: always the owner's own", () => {
  assert.equal(offeringOwnerFor({ choice: "both", ownerTalentProfileId: "tp1", providerCount: 1 }), "tp1");
  assert.equal(offeringOwnerFor({ choice: "both", ownerTalentProfileId: "tp1", providerCount: 3 }), "tp1");
});

test("business with no talent profile: house-owned", () => {
  assert.equal(offeringOwnerFor({ choice: "studio", ownerTalentProfileId: null, providerCount: 1 }), null);
  assert.equal(offeringOwnerFor({ choice: "both", ownerTalentProfileId: null, providerCount: 1 }), null);
});

type Row = ExistingOffering & { ownerKey: string; row: OfferingRowDraft };
const key = (o: OfferingOwnerRef) => (o.kind === "talent" ? `t:${o.talentProfileId}` : `w:${o.tenantId}`);

function store(rows: Row[], op: { talentProfileId: string; providerCount: number } | null): EssentialsStore {
  let n = 0;
  return {
    async listOfferings(o) { return rows.filter((r) => r.ownerKey === key(o)).map(({ id, title, status }) => ({ id, title, status })); },
    async insertOfferings(o, ins) { for (const row of ins) rows.push({ id: `o${++n}`, title: row.title, status: row.status, ownerKey: key(o), row }); },
    async updateOffering() {},
    async upsertTalentHours() { return true; },
    async setTalentBookable() {},
    async setTalentPlace() {},
    async setWorkspaceBusinessInfo() {},
    async enableWorkspaceAppointments() {},
    async hasActiveProvider() { return false; },
    async inviteFirstProvider() { return "invited"; },
    async ownerProvider() { return op; },
  };
}

const ess = (over: Partial<Essentials> = {}): Essentials => ({
  ...suggestedEssentials({ trade: "lashes", country: "Mexico", locale: "en", name: "Valeria" }),
  confirmed: true,
  ...over,
});
const workspace = { tenantId: "ws1", tenantSlug: "studio" };

test("solo owner on the roster: studio services are written as the owner's, published and public", async () => {
  const rows: Row[] = [];
  await runEssentialsWrites(store(rows, { talentProfileId: "tp1", providerCount: 1 }), { choice: "studio", essentials: ess(), talent: null, workspace });
  assert.equal(rows.length, 4);
  assert.ok(rows.every((r) => r.ownerKey === "t:tp1" && r.row.status === "published" && r.row.visibility === "public"));
});

test("idempotent: running twice yields one row per service", async () => {
  const rows: Row[] = [];
  const s = store(rows, { talentProfileId: "tp1", providerCount: 1 });
  const input = { choice: "studio" as const, essentials: ess(), talent: null, workspace };
  await runEssentialsWrites(s, input);
  const second = await runEssentialsWrites(s, input);
  assert.equal(second.offeringsCreated, 0);
  assert.equal(rows.length, 4);
});

test("an existing house row with the same title is left alone, no duplicate", async () => {
  const e = ess();
  const rows: Row[] = [{ id: "h1", title: e.services[0].name.toUpperCase(), status: "published", ownerKey: "w:ws1", row: {} as OfferingRowDraft }];
  await runEssentialsWrites(store(rows, { talentProfileId: "tp1", providerCount: 1 }), { choice: "studio", essentials: e, talent: null, workspace });
  assert.equal(rows.length, e.services.length);
  assert.equal(rows.filter((r) => r.ownerKey === "w:ws1").length, 1);
  assert.equal(rows.filter((r) => r.ownerKey === "t:tp1").length, e.services.length - 1);
});

test("studio with several providers, a pending invite, or no talent profile stays house-owned", async () => {
  for (const [op, over] of [
    [{ talentProfileId: "tp1", providerCount: 2 }, {}],
    [{ talentProfileId: "tp1", providerCount: 1 }, { firstProviderEmail: "pro@studio.com" }],
    [null, {}],
  ] as const) {
    const rows: Row[] = [];
    await runEssentialsWrites(store(rows, op), { choice: "studio", essentials: ess(over), talent: null, workspace });
    assert.ok(rows.length > 0 && rows.every((r) => r.ownerKey === "w:ws1"));
  }
});
