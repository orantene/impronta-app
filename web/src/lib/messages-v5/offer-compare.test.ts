import assert from "node:assert/strict";
import { test } from "node:test";

import { compareOfferVersions } from "./offer-compare";
import type { OfferDraftLine } from "./offer-draft";

function line(over: Partial<OfferDraftLine>): OfferDraftLine {
  return {
    id: "id",
    kind: "talent",
    talentProfileId: null,
    ownerTenantId: null,
    label: "Line",
    pricingUnit: "flat_package",
    units: 1,
    unitPriceCents: 10000,
    talentCostCents: 0,
    note: null,
    sortOrder: 0,
    sourceServiceId: null,
    proposedBy: null,
    proposedByName: null,
    confirmed: false,
    priceSnapshotCents: null,
    catalogPriceCentsAtAdd: null,
    catalogNowCents: null,
    discountCents: 0,
    discountLabel: null,
    taxCents: 0,
    taxLabel: null,
    removedBy: null,
    ...over,
  };
}

test("a line unchanged across versions matches by talentProfileId and reports unchanged", () => {
  const v1 = [line({ id: "a", talentProfileId: "t1", label: "DJ" })];
  const v2 = [line({ id: "a2", talentProfileId: "t1", label: "DJ" })];
  const result = compareOfferVersions(v1, v2);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.status, "unchanged");
});

test("a price or unit change on the matched line reports changed", () => {
  const v1 = [line({ talentProfileId: "t1", unitPriceCents: 10000 })];
  const v2 = [line({ talentProfileId: "t1", unitPriceCents: 12000 })];
  const result = compareOfferVersions(v1, v2);
  assert.equal(result.lines[0]?.status, "changed");
});

test("a line only in the later version reports added; only in the earlier reports removed", () => {
  const v1 = [line({ talentProfileId: "t1" })];
  const v2 = [line({ talentProfileId: "t1" }), line({ talentProfileId: "t2", label: "MC" })];
  const result = compareOfferVersions(v1, v2);
  const added = result.lines.find((l) => l.status === "added");
  assert.ok(added);
  assert.equal(added!.after?.talentProfileId, "t2");

  const v3 = [line({ talentProfileId: "t1" })];
  const removedResult = compareOfferVersions(v2, v3);
  const removed = removedResult.lines.find((l) => l.status === "removed");
  assert.ok(removed);
  assert.equal(removed!.before?.talentProfileId, "t2");
});

test("custom lines with no talent/service id match by label", () => {
  const v1 = [line({ label: "Setup fee", unitPriceCents: 5000 })];
  const v2 = [line({ label: "Setup fee", unitPriceCents: 6000 })];
  const result = compareOfferVersions(v1, v2);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.status, "changed");
});

test("totals reflect only live (non-removed) lines on each side", () => {
  const v1 = [line({ talentProfileId: "t1", units: 2, unitPriceCents: 10000 })];
  const v2 = [line({ talentProfileId: "t1", units: 2, unitPriceCents: 10000, removedBy: "Ana" })];
  const result = compareOfferVersions(v1, v2);
  assert.equal(result.totalBeforeCents, 20000);
  assert.equal(result.totalAfterCents, 0);
});

test("a line present and equal on both sides other than removed-state reports changed", () => {
  const v1 = [line({ talentProfileId: "t1" })];
  const v2 = [line({ talentProfileId: "t1", removedBy: "Ana" })];
  const result = compareOfferVersions(v1, v2);
  assert.equal(result.lines[0]?.status, "changed");
});
