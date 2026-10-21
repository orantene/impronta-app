import assert from "node:assert/strict";
import test from "node:test";

import { clientOfferView, confirmationState, talentOfferView, workspaceOfferView, type OfferLine } from "./offer-role-views";

const names = new Map([["t1", "Ana Ruiz"], ["t2", "Beto Paz"]]);
const lines: OfferLine[] = [
  { id: "l1", kind: "talent", talentProfileId: "t1", label: "Photographer", units: 2, unitPriceCents: 50000, talentCostCents: 35000, showWho: "name", talentConfirmed: true },
  { id: "l2", kind: "talent", talentProfileId: "t2", label: "Assistant", units: 1, unitPriceCents: 20000, talentCostCents: 12000, showWho: "hidden", talentConfirmed: null },
  { id: "l3", kind: "house", talentProfileId: null, label: "Equipment", units: 1, unitPriceCents: 10000, talentCostCents: 0, showWho: "name", talentConfirmed: null },
];

test("workspace sees everything: cost, margin per line and in total", () => {
  const v = workspaceOfferView(lines);
  assert.deepEqual(v.lines.map((l) => [l.id, l.totalCents, l.marginCents]), [["l1", 100000, 30000], ["l2", 20000, 8000], ["l3", 10000, 10000]]);
  assert.equal(v.totalCents, 130000);
  assert.equal(v.costCents, 82000);
  assert.equal(v.marginCents, 48000);
});

test("client never sees cost, margin or talent ids; the person shows only as the terms allow", () => {
  const v = clientOfferView(lines, names);
  assert.equal(v.totalCents, 130000);
  assert.deepEqual(v.lines.map((l) => [l.id, l.person]), [["l1", { kind: "name", name: "Ana Ruiz" }], ["l2", { kind: "role_only" }], ["l3", { kind: "none" }]]);
  const json = JSON.stringify(v);
  for (const leak of ["margin", "cost", "t1", "t2", "Beto", "35000", "12000"]) assert.ok(!json.toLowerCase().includes(leak.toLowerCase()), leak);
});

test("a 'portfolio' person is shown as a portfolio entry without the name", () => {
  const v = clientOfferView([{ ...lines[0], showWho: "portfolio" }], names);
  assert.deepEqual(v.lines[0].person, { kind: "portfolio" });
  assert.ok(!JSON.stringify(v).includes("Ana"));
});

test("a talent sees only their own part and their own cost, never the client price or others", () => {
  const v = talentOfferView(lines, "t1");
  assert.deepEqual(v.lines.map((l) => [l.id, l.talentCostCents, l.units]), [["l1", 35000, 2]]);
  assert.equal(v.youGetCents, 70000);
  const json = JSON.stringify(v);
  for (const leak of ["50000", "Assistant", "Equipment", "l2", "margin", "t2"]) assert.ok(!json.includes(leak), leak);
  assert.deepEqual(talentOfferView(lines, "nobody").lines, []);
});

test("whole-offer approval by default; per-line confirmation only when switched on", () => {
  assert.deepEqual(confirmationState(lines, false), { mode: "whole_offer", pendingLineIds: [], allConfirmed: null });
  const per = confirmationState(lines, true);
  assert.equal(per.mode, "per_line");
  // only talent lines need a confirmation; false is a decline, null is waiting
  assert.deepEqual(per.pendingLineIds, ["l2"]);
  assert.equal(per.allConfirmed, false);
  assert.equal(confirmationState([lines[0], lines[2]], true).allConfirmed, true);
  assert.deepEqual(confirmationState([{ ...lines[1], talentConfirmed: false }], true), { mode: "per_line", pendingLineIds: [], declinedLineIds: ["l2"], allConfirmed: false });
});
