import assert from "node:assert/strict";
import test from "node:test";

import { shapePublicEntries, type PublicEntryInput, type PublicMember } from "./public-hub";

const m = (over: Partial<PublicMember> = {}): PublicMember => ({ listingId: "l1", talentName: "Ana", priceCents: 50000, currency: "USD", sellable: true, ...over });
const e = (over: Partial<PublicEntryInput> = {}): PublicEntryInput => ({
  id: "e1", name: "Massage", category: "Massage", photoUrl: "https://img/1.jpg", hubPriceCents: null, currency: "USD",
  showWho: "name", featured: false, hidden: false, ownOfferingId: null, members: [m()], ...over,
});

test("every public entry is request-only, whatever its booking type says", () => {
  const out = shapePublicEntries([e({ bookingType: "instant" } as never)]);
  assert.equal(out[0].cta, "request");
});

test("a hidden entry, or one with no sellable member, is not shown", () => {
  assert.equal(shapePublicEntries([e({ hidden: true })]).length, 0);
  assert.equal(shapePublicEntries([e({ members: [m({ sellable: false })] })]).length, 0);
  assert.equal(shapePublicEntries([e({ members: [] })]).length, 0);
});

test("the workspace's own service shows even with no members", () => {
  const out = shapePublicEntries([e({ members: [], ownOfferingId: "own-1", hubPriceCents: 20000 })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].priceCents, 20000);
});

test("only sellable members count, and only their names show", () => {
  const out = shapePublicEntries([e({ members: [m({ talentName: "Ana" }), m({ listingId: "l2", talentName: "Blocked", sellable: false })] })]);
  assert.deepEqual(out[0].who, ["Ana"]);
});

test("show who: name lists names; portfolio and hidden list none", () => {
  assert.deepEqual(shapePublicEntries([e({ showWho: "name" })])[0].who, ["Ana"]);
  assert.deepEqual(shapePublicEntries([e({ showWho: "portfolio" })])[0].who, []);
  assert.deepEqual(shapePublicEntries([e({ showWho: "hidden" })])[0].who, []);
});

test("price: the hub price if set, else 'from' the lowest sellable member price; none when unknown", () => {
  assert.deepEqual(pick(shapePublicEntries([e({ hubPriceCents: 9000 })])[0]), { priceCents: 9000, from: false });
  assert.deepEqual(pick(shapePublicEntries([e({ members: [m({ priceCents: 50000 }), m({ listingId: "l2", priceCents: 30000 })] })])[0]), { priceCents: 30000, from: true });
  assert.deepEqual(pick(shapePublicEntries([e({ members: [m({ priceCents: null })] })])[0]), { priceCents: null, from: false });
});

test("a single member price is exact, not 'from'", () => {
  assert.deepEqual(pick(shapePublicEntries([e()])[0]), { priceCents: 50000, from: false });
});

test("featured entries come first, then by name", () => {
  const out = shapePublicEntries([e({ id: "b", name: "Zen" }), e({ id: "a", name: "Aroma" }), e({ id: "f", name: "Yoga", featured: true })]);
  assert.deepEqual(out.map((x) => x.id), ["f", "a", "b"]);
});

test("the public shape never carries member or talent ids", () => {
  const json = JSON.stringify(shapePublicEntries([e()]));
  assert.doesNotMatch(json, /listingId|talentProfileId|l1/);
});

function pick(x: { priceCents: number | null; from: boolean }) {
  return { priceCents: x.priceCents, from: x.from };
}
