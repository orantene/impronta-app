import assert from "node:assert/strict";
import test from "node:test";

import { siteHeaderSchemaV1 } from "./schema";
import {
  HEADER_ITEM_KINDS,
  HEADER_ZONES,
  MAX_ITEMS_PER_ZONE,
  addItem,
  countItems,
  defaultItemForKind,
  emptyRegions,
  moveItem,
  nudgeItem,
  removeItem,
  seedRegionsFromVariant,
  updateItem,
  type HeaderRegions,
  type HeaderSeedFacts,
} from "./regions-editing";

/**
 * The header regions editor is the FIRST writer of `regions`. Two classes of
 * bug would be invisible without these: a seed that produces a value the
 * section schema rejects (the save would fail at publish time, after the
 * operator thought they had turned the feature on), and a reorder that quietly
 * loses an item (the header just gets shorter and nobody can say when).
 */

const FULL_FACTS: HeaderSeedFacts = {
  variant: "standard",
  brandDisplay: "image-and-text",
  hasLogo: true,
  hasWordmark: true,
  navItemCount: 4,
  hasPrimaryCta: true,
  socialCount: 3,
  hasPhone: true,
  showLanguage: true,
};

/** Parse a regions value through the REAL section schema. */
function parseRegions(regions: HeaderRegions) {
  const parsed = siteHeaderSchemaV1.safeParse({
    brand: {},
    regions,
  });
  assert.ok(
    parsed.success,
    parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2),
  );
  return parsed.data!.regions!;
}

function kindsOf(regions: HeaderRegions): string[] {
  return HEADER_ZONES.flatMap((z) => regions[z].map((i) => i.type));
}

// ── Seeding ─────────────────────────────────────────────────────────────────

for (const variant of [
  "standard",
  "split",
  "minimal",
  "editorial",
  "editorial-split",
]) {
  test(`seeding from the ${variant} variant produces a schema-valid regions value`, () => {
    const seeded = seedRegionsFromVariant({ ...FULL_FACTS, variant });
    const parsed = parseRegions(seeded);
    assert.deepEqual(parsed, seeded);
    assert.ok(countItems(seeded) > 0, "seed produced an empty header");
    for (const zone of HEADER_ZONES) {
      assert.ok(
        seeded[zone].length <= MAX_ITEMS_PER_ZONE,
        `${zone} zone exceeded the schema ceiling`,
      );
    }
  });
}

test("an unknown variant seeds the standard layout rather than an empty header", () => {
  const seeded = seedRegionsFromVariant({
    ...FULL_FACTS,
    variant: "something-a-later-release-added",
  });
  assert.deepEqual(seeded, seedRegionsFromVariant(FULL_FACTS));
});

test("the seed never invents an item for content the tenant does not have", () => {
  const bare = seedRegionsFromVariant({
    variant: "standard",
    brandDisplay: "image-and-text",
    hasLogo: false,
    hasWordmark: true,
    navItemCount: 0,
    hasPrimaryCta: false,
    socialCount: 0,
    hasPhone: false,
    showLanguage: false,
  });
  assert.deepEqual(kindsOf(bare), ["wordmark"]);
});

test("brandDisplay decides which brand items the seed places", () => {
  const imageOnly = seedRegionsFromVariant({
    ...FULL_FACTS,
    brandDisplay: "image",
  });
  assert.ok(kindsOf(imageOnly).includes("logo"));
  assert.ok(!kindsOf(imageOnly).includes("wordmark"));

  const textOnly = seedRegionsFromVariant({
    ...FULL_FACTS,
    brandDisplay: "text",
  });
  assert.ok(kindsOf(textOnly).includes("wordmark"));
  assert.ok(!kindsOf(textOnly).includes("logo"));
});

test("editorial-split seeds no CTA, matching the renderer that suppresses it", () => {
  const seeded = seedRegionsFromVariant({
    ...FULL_FACTS,
    variant: "editorial-split",
  });
  assert.ok(!kindsOf(seeded).includes("cta"));
  // Every OTHER variant with a primary CTA configured does place one.
  assert.ok(kindsOf(seedRegionsFromVariant(FULL_FACTS)).includes("cta"));
});

test("split seeds the three-column shape the variant's CSS grid renders", () => {
  const seeded = seedRegionsFromVariant({ ...FULL_FACTS, variant: "split" });
  assert.deepEqual(seeded.left.map((i) => i.type), ["social", "phone"]);
  assert.deepEqual(seeded.center.map((i) => i.type), ["logo", "wordmark"]);
  assert.deepEqual(seeded.right.map((i) => i.type), ["nav", "cta", "language"]);
});

// ── Defaults + palette ──────────────────────────────────────────────────────

test("every palette kind produces a schema-valid item", () => {
  let regions = emptyRegions();
  for (const kind of HEADER_ITEM_KINDS) {
    const item = defaultItemForKind(kind);
    assert.equal(item.type, kind);
    regions = addItem(regions, "left", kind);
  }
  // 10 kinds, 8 per zone: the last two are refused rather than truncated.
  assert.equal(regions.left.length, MAX_ITEMS_PER_ZONE);
  parseRegions(regions);
});

test("adding to a full zone is refused, not silently truncated on save", () => {
  let regions = emptyRegions();
  for (let i = 0; i < MAX_ITEMS_PER_ZONE; i++) {
    regions = addItem(regions, "center", "spacer");
  }
  const after = addItem(regions, "center", "nav");
  assert.equal(after, regions, "a refused add must return the input unchanged");
});

// ── Reorder / move preserve every item ──────────────────────────────────────

test("reordering inside a zone preserves every item", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  const after = moveItem(
    before,
    { zone: "right", index: 0 },
    { zone: "right", index: 2 },
  );
  assert.equal(countItems(after), countItems(before));
  assert.deepEqual(
    [...kindsOf(after)].sort(),
    [...kindsOf(before)].sort(),
    "reorder changed the item SET, not just the order",
  );
  // `toIndex` is an insertion index against the list AFTER the lift, so 2 on a
  // three-item zone parks the moved item last.
  assert.deepEqual(after.right.map((i) => i.type), ["cta", "language", "nav"]);
  parseRegions(after);
});

test("moving across zones preserves every item and lands at the drop index", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  const after = moveItem(
    before,
    { zone: "left", index: 0 },
    { zone: "right", index: 1 },
  );
  assert.equal(countItems(after), countItems(before));
  assert.deepEqual([...kindsOf(after)].sort(), [...kindsOf(before)].sort());
  assert.equal(after.right[1]!.type, "social");
  assert.ok(!after.left.some((i) => i.type === "social"));
  parseRegions(after);
});

test("a move into a full zone is refused rather than losing the item", () => {
  let regions = emptyRegions();
  regions = addItem(regions, "left", "nav");
  for (let i = 0; i < MAX_ITEMS_PER_ZONE; i++) {
    regions = addItem(regions, "right", "spacer");
  }
  const after = moveItem(
    regions,
    { zone: "left", index: 0 },
    { zone: "right", index: 0 },
  );
  assert.equal(after, regions);
  assert.equal(countItems(after), MAX_ITEMS_PER_ZONE + 1);
});

test("an out-of-range drop index clamps to the end instead of dropping the item", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  const after = moveItem(
    before,
    { zone: "left", index: 0 },
    { zone: "center", index: 99 },
  );
  assert.equal(countItems(after), countItems(before));
  assert.equal(after.center.at(-1)!.type, "social");
});

test("nudge moves one slot and refuses to walk off either end", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  assert.equal(nudgeItem(before, "right", 0, -1), before);
  assert.equal(nudgeItem(before, "right", before.right.length - 1, 1), before);
  const after = nudgeItem(before, "right", 0, 1);
  assert.deepEqual(after.right.map((i) => i.type), ["cta", "nav", "language"]);
  assert.equal(countItems(after), countItems(before));
});

// ── Purity + remove/update ──────────────────────────────────────────────────

test("no operation mutates its input", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  const snapshot = JSON.stringify(before);
  addItem(before, "center", "spacer");
  removeItem(before, "left", 0);
  updateItem(before, "left", 0, { type: "social", platforms: ["instagram"] });
  moveItem(before, { zone: "left", index: 0 }, { zone: "right", index: 0 });
  nudgeItem(before, "right", 0, 1);
  assert.equal(JSON.stringify(before), snapshot);
});

test("remove drops exactly one item; an out-of-range index is a no-op", () => {
  const before = seedRegionsFromVariant(FULL_FACTS);
  const after = removeItem(before, "left", 0);
  assert.equal(countItems(after), countItems(before) - 1);
  assert.equal(removeItem(before, "left", 99), before);
});

test("per-item settings round-trip through the schema", () => {
  let regions = emptyRegions();
  regions = addItem(regions, "right", "cta");
  regions = updateItem(regions, "right", 0, {
    type: "cta",
    label: "Book a casting",
    href: "/contact",
    priority: 90,
    responsive: { desktop: "show", tablet: "label", mobile: "menu" },
  });
  regions = addItem(regions, "left", "social");
  regions = updateItem(regions, "left", 0, {
    type: "social",
    platforms: ["tiktok", "instagram"],
    priority: 40,
  });
  const parsed = parseRegions(regions);
  assert.equal(parsed.right[0]!.type, "cta");
  assert.deepEqual(parsed.right[0]!.responsive, {
    desktop: "show",
    tablet: "label",
    mobile: "menu",
  });
  assert.deepEqual(
    parsed.left[0]!.type === "social" ? parsed.left[0]!.platforms : null,
    ["tiktok", "instagram"],
  );
});

test("a pre-WF-6 social item without platforms still parses", () => {
  const parsed = parseRegions({
    left: [{ type: "social" }],
    center: [],
    right: [],
  });
  assert.equal(parsed.left[0]!.type, "social");
  assert.equal(
    parsed.left[0]!.type === "social" ? parsed.left[0]!.platforms : "absent",
    undefined,
  );
});
