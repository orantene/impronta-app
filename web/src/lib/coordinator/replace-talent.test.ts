import assert from "node:assert/strict";
import test from "node:test";

import { planReplacement } from "./replace-talent";
import type { OfferLine } from "./offer-line";

const lines: OfferLine[] = [
  { id: "l1", kind: "talent", talentProfileId: "t1", label: "Photographer", units: 2, unitPriceCents: 50000, talentCostCents: 35000, showWho: "name", talentConfirmed: true },
  { id: "l2", kind: "talent", talentProfileId: "t2", label: "Assistant", units: 1, unitPriceCents: 20000, talentCostCents: 12000, showWho: "hidden", talentConfirmed: true },
  { id: "l3", kind: "house", talentProfileId: null, label: "Equipment", units: 1, unitPriceCents: 10000, talentCostCents: 0, showWho: "name", talentConfirmed: null },
];
const newbie = { talentProfileId: "t9", costCents: 30000, showWho: "name" as const };

test("only the dropped person's lines change; the rest are not re-sent", () => {
  const r = planReplacement({ lines, droppedTalentId: "t1", replacement: newbie });
  assert.ok(r.ok);
  assert.deepEqual(r.changedLineIds, ["l1"]);
  assert.deepEqual(r.unchangedLineIds, ["l2", "l3"]);
  const l1 = r.lines.find((l) => l.id === "l1")!;
  assert.equal(l1.talentProfileId, "t9");
  assert.equal(l1.talentCostCents, 30000);
  // the client price of the line is untouched
  assert.equal(l1.unitPriceCents, 50000);
  // the new person has not confirmed yet
  assert.equal(l1.talentConfirmed, null);
  assert.deepEqual(r.lines.find((l) => l.id === "l2"), lines[1]);
});

test("payouts move: the dropped person loses their part, the new person gains theirs", () => {
  const r = planReplacement({ lines, droppedTalentId: "t1", replacement: newbie });
  assert.ok(r.ok);
  assert.deepEqual(r.payoutMoves, [
    { talentProfileId: "t1", deltaCents: -70000 },
    { talentProfileId: "t9", deltaCents: 60000 },
  ]);
  // margin moves by the difference in cost, never the client's price
  assert.equal(r.marginDeltaCents, 10000);
});

test("the client is told only if the dropped person was shown by name", () => {
  const named = planReplacement({ lines, droppedTalentId: "t1", replacement: newbie });
  assert.ok(named.ok && named.clientNotice === "person_changed");
  const hidden = planReplacement({ lines, droppedTalentId: "t2", replacement: { ...newbie, showWho: "hidden" } });
  assert.ok(hidden.ok && hidden.clientNotice === "none");
  // a hidden person replaced by someone shown by name is a visible change
  const reveal = planReplacement({ lines, droppedTalentId: "t2", replacement: { ...newbie, showWho: "name" } });
  assert.ok(reveal.ok && reveal.clientNotice === "person_changed");
  // portfolio is shown to the client too
  const port = planReplacement({ lines: [{ ...lines[0], showWho: "portfolio" }], droppedTalentId: "t1", replacement: { ...newbie, showWho: "portfolio" } });
  assert.ok(port.ok && port.clientNotice === "person_changed");
});

test("who must be told in the workspace: the dropped person, the new person", () => {
  const r = planReplacement({ lines, droppedTalentId: "t1", replacement: newbie });
  assert.ok(r.ok);
  assert.deepEqual(r.notify, { dropped: "t1", added: "t9" });
});

test("refuses what it cannot do safely", () => {
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "nobody", replacement: newbie }), { ok: false, reason: "not_on_offer" });
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "t1", replacement: { ...newbie, talentProfileId: "t1" } }), { ok: false, reason: "same_person" });
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "t1", replacement: { ...newbie, costCents: -1 } }), { ok: false, reason: "invalid_cost" });
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "t1", replacement: { ...newbie, costCents: Number.NaN } }), { ok: false, reason: "invalid_cost" });
  assert.deepEqual(planReplacement({ lines: [], droppedTalentId: "t1", replacement: newbie }), { ok: false, reason: "not_on_offer" });
});

test("refuses a replacement who is already on the offer, and an empty id", () => {
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "t1", replacement: { ...newbie, talentProfileId: "t2" } }), { ok: false, reason: "already_on_offer" });
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "", replacement: newbie }), { ok: false, reason: "invalid_id" });
  assert.deepEqual(planReplacement({ lines, droppedTalentId: "t1", replacement: { ...newbie, talentProfileId: "  " } }), { ok: false, reason: "invalid_id" });
});

test("the original lines are never mutated", () => {
  const before = JSON.stringify(lines);
  planReplacement({ lines, droppedTalentId: "t1", replacement: newbie });
  assert.equal(JSON.stringify(lines), before);
});
