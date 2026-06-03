import assert from "node:assert/strict";
import test from "node:test";

import {
  collectionIdFromSourceKey,
  collectionItemsToRecords,
  collectionSourceKey,
  isCollectionSourceKey,
  normalizeCollectionFields,
  normalizeCollectionItemData,
  slugifyCollectionKey,
  type CollectionFieldDefinition,
  type CollectionItem,
} from "./types";

// ── sourceKey helpers ───────────────────────────────────────────────────────

test("collection sourceKey round-trips an id", () => {
  const key = collectionSourceKey("abc-123");
  assert.equal(key, "collection:abc-123");
  assert.equal(isCollectionSourceKey(key), true);
  assert.equal(collectionIdFromSourceKey(key), "abc-123");
});

test("non-collection sourceKeys are rejected", () => {
  assert.equal(isCollectionSourceKey("featured_talent_profiles"), false);
  assert.equal(isCollectionSourceKey("collection:"), false);
  assert.equal(isCollectionSourceKey(null), false);
  assert.equal(isCollectionSourceKey(undefined), false);
  assert.equal(collectionIdFromSourceKey("featured_talent_profiles"), null);
  assert.equal(collectionIdFromSourceKey("collection:"), null);
});

// ── slugify ─────────────────────────────────────────────────────────────────

test("slugifyCollectionKey produces stable lowercase keys", () => {
  assert.equal(slugifyCollectionKey("Team Members"), "team_members");
  assert.equal(slugifyCollectionKey("Photo URL!"), "photo_url");
  assert.equal(slugifyCollectionKey("  trimmed  "), "trimmed");
  // Leading digit gets an alpha prefix (a key must start with a letter).
  assert.match(slugifyCollectionKey("123 go"), /^[a-z]/);
  // Empty / symbol-only falls back to "field".
  assert.equal(slugifyCollectionKey("!!!"), "field");
});

// ── field schema normalization ──────────────────────────────────────────────

test("normalizeCollectionFields slugifies, dedupes, and defaults unknown types", () => {
  const fields = normalizeCollectionFields([
    { label: "Name", type: "text" },
    { label: "Role", type: "text" },
    { label: "Name", type: "text" }, // dup key → name_2
    { label: "Bio", type: "bogus" }, // unknown type → text
    { label: "Photo", type: "image" },
    { label: "", type: "text" }, // dropped (no label/key)
    { key: "price", label: "Price", type: "number" },
    { label: "Featured", type: "boolean" },
    { label: "Link", type: "url" },
  ]);
  assert.deepEqual(
    fields.map((field) => [field.key, field.type]),
    [
      ["name", "text"],
      ["role", "text"],
      ["name_2", "text"],
      ["bio", "text"],
      ["photo", "image"],
      ["price", "number"],
      ["featured", "boolean"],
      ["link", "url"],
    ],
  );
});

test("normalizeCollectionFields tolerates garbage", () => {
  assert.deepEqual(normalizeCollectionFields(null), []);
  assert.deepEqual(normalizeCollectionFields("not-an-array"), []);
  assert.deepEqual(normalizeCollectionFields([1, "x", null]), []);
});

test("normalizeCollectionFields caps at the max", () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    label: `Field ${i}`,
    type: "text",
  }));
  assert.equal(normalizeCollectionFields(many).length, 24);
});

// ── item data normalization ─────────────────────────────────────────────────

const FIELDS: CollectionFieldDefinition[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "price", label: "Price", type: "number" },
  { key: "featured", label: "Featured", type: "boolean" },
  { key: "photo", label: "Photo", type: "image" },
];

test("normalizeCollectionItemData keeps only declared keys + coerces types", () => {
  const data = normalizeCollectionItemData(
    {
      name: "Ana",
      price: "1200", // string → number
      featured: "true", // string → boolean true
      photo: "https://cdn/x.jpg",
      extra: "dropped", // unknown key dropped
    },
    FIELDS,
  );
  assert.deepEqual(data, {
    name: "Ana",
    price: 1200,
    featured: true,
    photo: "https://cdn/x.jpg",
  });
  assert.equal("extra" in data, false);
});

test("normalizeCollectionItemData omits absent keys (not null)", () => {
  const data = normalizeCollectionItemData({ name: "Bea" }, FIELDS);
  assert.deepEqual(data, { name: "Bea" });
  assert.equal("price" in data, false);
});

// ── row → record resolution (the renderer contract) ─────────────────────────

test("collectionItemsToRecords sorts by sortOrder + carries id + coerced data", () => {
  const items: CollectionItem[] = [
    { id: "i2", sortOrder: 1, data: { name: "Second", price: 2 } },
    { id: "i1", sortOrder: 0, data: { name: "First", price: "1", featured: "true" } },
    { id: "i3", sortOrder: 2, data: { name: "Third", extra: "x" } },
  ];
  const records = collectionItemsToRecords(FIELDS, items);
  assert.deepEqual(records, [
    { id: "i1", name: "First", price: 1, featured: true },
    { id: "i2", name: "Second", price: 2 },
    { id: "i3", name: "Third" },
  ]);
  // Each record carries a stable id (used by the repeater's stable-key path).
  assert.deepEqual(
    records.map((r) => r.id),
    ["i1", "i2", "i3"],
  );
});

test("collectionItemsToRecords on an empty collection is an empty list", () => {
  assert.deepEqual(collectionItemsToRecords(FIELDS, []), []);
});
