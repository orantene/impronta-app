import test from "node:test";
import assert from "node:assert/strict";

import {
  slugifyPageName,
  derivePageSlug,
  isReservedPageSlug,
  nextSortOrder,
  planReorder,
  planSetHome,
  canDeletePage,
  type ManagedPage,
} from "./site-page-management-core";

test("slugifyPageName lowercases, hyphenates, folds accents, trims", () => {
  assert.equal(slugifyPageName("About Me"), "about-me");
  assert.equal(slugifyPageName("  Servicios & Más!! "), "servicios-mas");
  assert.equal(slugifyPageName("José Álvarez"), "jose-alvarez");
  assert.equal(slugifyPageName("###"), "");
});

test("derivePageSlug falls back to 'page' for empty input", () => {
  assert.equal(derivePageSlug(""), "page");
  assert.equal(derivePageSlug("   "), "page");
  assert.equal(derivePageSlug(null), "page");
});

test("derivePageSlug de-duplicates with -2, -3 against taken slugs", () => {
  assert.equal(derivePageSlug("About", []), "about");
  assert.equal(derivePageSlug("About", ["about"]), "about-2");
  assert.equal(derivePageSlug("About", ["about", "about-2"]), "about-3");
});

test("derivePageSlug treats reserved slugs as taken", () => {
  // "site" is reserved → first candidate collides → bumps to site-2.
  assert.equal(derivePageSlug("Site", []), "site-2");
  assert.equal(derivePageSlug("__site_shell__", []), "site-shell"); // slugified away from reserved
});

test("isReservedPageSlug flags reserved slugs case-insensitively", () => {
  assert.equal(isReservedPageSlug("site"), true);
  assert.equal(isReservedPageSlug("SITE"), true);
  assert.equal(isReservedPageSlug("about"), false);
});

const pages = (rows: Partial<ManagedPage>[]): ManagedPage[] =>
  rows.map((r, i) => ({
    id: r.id ?? `p${i}`,
    sortOrder: r.sortOrder ?? i,
    isHome: r.isHome ?? false,
  }));

test("nextSortOrder returns one past the max (0 when empty)", () => {
  assert.equal(nextSortOrder([]), 0);
  assert.equal(nextSortOrder(pages([{ sortOrder: 0 }, { sortOrder: 1 }])), 2);
  assert.equal(nextSortOrder(pages([{ sortOrder: 5 }, { sortOrder: 2 }])), 6);
});

test("planReorder returns only rows whose sort_order changes, dense 0-based", () => {
  const p = pages([
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ]);
  // Move c to the front.
  const changes = planReorder(p, ["c", "a", "b"]);
  assert.deepEqual(changes, [
    { id: "c", sortOrder: 0 },
    { id: "a", sortOrder: 1 },
    { id: "b", sortOrder: 2 },
  ]);
});

test("planReorder appends omitted pages preserving their existing order", () => {
  const p = pages([
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
  ]);
  // Only mention b first; a + c append in current order → b,a,c.
  const changes = planReorder(p, ["b"]);
  assert.deepEqual(changes, [
    { id: "b", sortOrder: 0 },
    { id: "a", sortOrder: 1 },
  ]);
});

test("planReorder no-ops when order is unchanged", () => {
  const p = pages([
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 1 },
  ]);
  assert.deepEqual(planReorder(p, ["a", "b"]), []);
});

test("planSetHome clears the old home FIRST, then sets the target", () => {
  const p = pages([
    { id: "a", isHome: true },
    { id: "b", isHome: false },
  ]);
  const plan = planSetHome(p, "b");
  assert.deepEqual(plan, [
    { id: "a", isHome: false },
    { id: "b", isHome: true },
  ]);
});

test("planSetHome is a no-op when the target is already the sole home", () => {
  const p = pages([{ id: "a", isHome: true }]);
  assert.deepEqual(planSetHome(p, "a"), []);
});

test("planSetHome returns null for an unknown target", () => {
  const p = pages([{ id: "a", isHome: true }]);
  assert.equal(planSetHome(p, "zzz"), null);
});

test("canDeletePage forbids deleting the home page while siblings exist", () => {
  const p = pages([
    { id: "a", isHome: true },
    { id: "b", isHome: false },
  ]);
  assert.deepEqual(canDeletePage(p, "a"), {
    ok: false,
    reason: "home_with_siblings",
  });
  assert.deepEqual(canDeletePage(p, "b"), { ok: true });
});

test("canDeletePage allows deleting the last remaining (home) page", () => {
  const p = pages([{ id: "a", isHome: true }]);
  assert.deepEqual(canDeletePage(p, "a"), { ok: true });
});

test("canDeletePage reports not_found for an unknown id", () => {
  const p = pages([{ id: "a", isHome: true }]);
  assert.deepEqual(canDeletePage(p, "zzz"), { ok: false, reason: "not_found" });
});
