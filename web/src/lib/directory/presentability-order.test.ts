// Pins the five invariants of presentability ordering.
//
// This reorders the public directory, so the ways it could go wrong are the
// ways a ranking change hurts real people: dropping somebody off the page,
// overriding an agency's curation, or shuffling a cohort that was already
// deliberately ordered. Each is asserted.

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPresentabilityOrdering,
  presentabilityTier,
  type PresentabilityCard,
} from "./presentability-order";

type Card = PresentabilityCard & { id: string };

const full = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  thumbnail: { url: `https://cdn/${id}.jpg` },
  cardAttributes: [{ value: "178 cm" }],
  ...extra,
});
const photoOnly = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  thumbnail: { url: `https://cdn/${id}.jpg` },
  cardAttributes: [],
  ...extra,
});
const bare = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  thumbnail: { url: null },
  cardAttributes: [],
  ...extra,
});

const ids = (cards: Card[]) => cards.map((c) => c.id);

test("tiers score on what the card actually shows", () => {
  assert.equal(presentabilityTier(full("a")), 2);
  assert.equal(presentabilityTier(photoOnly("b")), 1);
  // Substance can come from any of the three things the card renders.
  assert.equal(presentabilityTier({ thumbnail: null, fitLabels: [{}] }), 1);
  assert.equal(presentabilityTier({ thumbnail: null, priceFromCents: 45000 }), 1);
  assert.equal(presentabilityTier(bare("d")), 0);
  // Whitespace is not content, and a zero price is not a price.
  assert.equal(
    presentabilityTier({
      thumbnail: { url: "   " },
      cardAttributes: [{ value: "  " }],
      priceFromCents: 0,
    }),
    0,
  );
});

test("presentable cards lead, bare cards follow, nobody is dropped", () => {
  const items: Card[] = [bare("b1"), full("f1"), bare("b2"), photoOnly("p1"), full("f2")];
  applyPresentabilityOrdering(items);
  assert.deepEqual(ids(items), ["f1", "f2", "p1", "b1", "b2"]);
  assert.equal(items.length, 5, "page size must not change");
});

test("relative order inside a tier is preserved exactly", () => {
  // Demand smoothing and the Portfolio boost already ordered these. This must
  // not undo their work — it only groups.
  const items: Card[] = [full("f1"), full("f2"), full("f3")];
  applyPresentabilityOrdering(items);
  assert.deepEqual(ids(items), ["f1", "f2", "f3"]);
});

test("the leading featured block keeps its slots", () => {
  // An agency that features a bare profile has made a decision. Honour it.
  const items: Card[] = [
    bare("feat-bare", { isFeatured: true }),
    full("f1"),
    bare("b1"),
  ];
  applyPresentabilityOrdering(items);
  assert.deepEqual(ids(items), ["feat-bare", "f1", "b1"]);
});

test("a manually arranged row keeps its exact slot", () => {
  // "Arrange directory order" on the roster is an explicit human ordering and
  // outranks every automatic signal.
  const items: Card[] = [
    bare("b1"),
    bare("pinned", { manualRankOverride: 3 }),
    full("f1"),
  ];
  applyPresentabilityOrdering(items);
  assert.equal(items[1]!.id, "pinned", "pinned row must not move");
  assert.deepEqual(ids(items), ["f1", "pinned", "b1"]);
});

test("no card is lost or duplicated, whatever the mix", () => {
  const items: Card[] = [
    bare("b1"),
    full("f1", { isFeatured: true }),
    photoOnly("p1", { manualRankOverride: 1 }),
    bare("b2"),
    full("f2"),
    photoOnly("p2"),
  ];
  const before = [...ids(items)].sort();
  applyPresentabilityOrdering(items);
  assert.deepEqual([...ids(items)].sort(), before);
});

test("degenerate pages are left alone", () => {
  const one: Card[] = [bare("b1")];
  applyPresentabilityOrdering(one);
  assert.deepEqual(ids(one), ["b1"]);

  const empty: Card[] = [];
  applyPresentabilityOrdering(empty);
  assert.deepEqual(ids(empty), []);

  // All featured → nothing is movable.
  const allFeatured: Card[] = [bare("a", { isFeatured: true }), full("b", { isFeatured: true })];
  applyPresentabilityOrdering(allFeatured);
  assert.deepEqual(ids(allFeatured), ["a", "b"]);
});
