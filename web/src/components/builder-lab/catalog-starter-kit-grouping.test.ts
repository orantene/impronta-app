import assert from "node:assert/strict";
import { test } from "node:test";

import {
  groupByCategory,
  categoryFilterOptions,
  applyStarterCategoryFilter,
} from "./catalog-starter-kit-grouping";

// ── helpers ────────────────────────────────────────────────────────────────────

function row(id: string, category: string, title = `T-${id}`) {
  return { id, category, title };
}

// ── groupByCategory ───────────────────────────────────────────────────────────

test("groupByCategory: groups rows by category, categories sorted alpha", () => {
  const rows = [
    row("1", "Hero"),
    row("2", "Layout"),
    row("3", "Hero"),
    row("4", "About"),
  ];
  const groups = groupByCategory(rows);
  assert.deepEqual(
    groups.map((g) => g.category),
    ["About", "Hero", "Layout"],
  );
});

test("groupByCategory: rows within each bucket are sorted by title", () => {
  const rows = [
    row("1", "Hero", "Zebra"),
    row("2", "Hero", "Alpha"),
    row("3", "Hero", "Mango"),
  ];
  const [group] = groupByCategory(rows);
  assert.deepEqual(
    group.rows.map((r) => r.title),
    ["Alpha", "Mango", "Zebra"],
  );
});

test("groupByCategory: empty category string coerces to Uncategorized", () => {
  const rows = [row("1", ""), row("2", "   ")];
  const groups = groupByCategory(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, "Uncategorized");
  assert.equal(groups[0].rows.length, 2);
});

test("groupByCategory: single row is one group", () => {
  const groups = groupByCategory([row("1", "Hero")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, "Hero");
  assert.equal(groups[0].rows.length, 1);
});

test("groupByCategory: empty list returns empty array", () => {
  assert.deepEqual(groupByCategory([]), []);
});

// ── categoryFilterOptions ─────────────────────────────────────────────────────

test("categoryFilterOptions: always starts with All whose count is total", () => {
  const rows = [row("1", "Hero"), row("2", "Layout"), row("3", "Hero")];
  const opts = categoryFilterOptions(rows);
  assert.equal(opts[0].key, "all");
  assert.equal(opts[0].count, 3);
});

test("categoryFilterOptions: per-category entries sorted alpha", () => {
  const rows = [row("1", "Zebra"), row("2", "Apple"), row("3", "Mango")];
  const opts = categoryFilterOptions(rows);
  assert.deepEqual(
    opts.slice(1).map((o) => o.key),
    ["Apple", "Mango", "Zebra"],
  );
});

test("categoryFilterOptions: counts per category are correct", () => {
  const rows = [row("1", "Hero"), row("2", "Hero"), row("3", "Layout")];
  const opts = categoryFilterOptions(rows);
  const hero = opts.find((o) => o.key === "Hero");
  const layout = opts.find((o) => o.key === "Layout");
  assert.equal(hero?.count, 2);
  assert.equal(layout?.count, 1);
});

test("categoryFilterOptions: empty list returns only All with count 0", () => {
  const opts = categoryFilterOptions([]);
  assert.equal(opts.length, 1);
  assert.equal(opts[0].key, "all");
  assert.equal(opts[0].count, 0);
});

// ── applyStarterCategoryFilter ────────────────────────────────────────────────

test("applyStarterCategoryFilter: 'all' returns all rows", () => {
  const rows = [row("1", "Hero"), row("2", "Layout")];
  assert.equal(applyStarterCategoryFilter(rows, "all").length, 2);
});

test("applyStarterCategoryFilter: filters to exact category match", () => {
  const rows = [row("1", "Hero"), row("2", "Layout"), row("3", "Hero")];
  const result = applyStarterCategoryFilter(rows, "Hero");
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.category === "Hero"));
});

test("applyStarterCategoryFilter: unrecognised key returns empty", () => {
  const rows = [row("1", "Hero"), row("2", "Layout")];
  // Not "all", not a real category — returns empty
  assert.equal(applyStarterCategoryFilter(rows, "Nonexistent").length, 0);
});

test("applyStarterCategoryFilter: blank category maps to Uncategorized bucket", () => {
  const rows = [row("1", ""), row("2", "Hero")];
  const result = applyStarterCategoryFilter(rows, "Uncategorized");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});
