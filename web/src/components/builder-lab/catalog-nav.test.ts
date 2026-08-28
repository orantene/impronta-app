import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type CatalogGroup,
  type CatalogView,
  GROUP_ORDER,
  GROUP_VIEWS,
  SPECIAL_TABS,
  coerceCatalogView,
  firstViewOfGroup,
  groupOfView,
  isValidView,
  orderedViewsForGroup,
} from "./catalog-nav";
import { resolveInitialView } from "./catalog-nav-state";
import { CODE_TAB_DEFS } from "@/lib/site-admin/add-gallery/catalog-structure";

// The full live gallery-tab set (sans the empty page_templates) — used as the
// "everything present" input for orderedViewsForGroup structure tests.
const ALL_GALLERY_TABS = CODE_TAB_DEFS.map((t) => t.id);

// ── Group membership: 3 × N partition, disjoint, excludes page_templates ──────

test("GROUP_ORDER is exactly the three groups", () => {
  assert.deepEqual([...GROUP_ORDER], ["structure", "design", "admin"]);
});

test("groups partition the view universe: disjoint", () => {
  const seen = new Set<CatalogView>();
  for (const g of GROUP_ORDER) {
    for (const v of GROUP_VIEWS[g]) {
      assert.ok(!seen.has(v), `view "${v}" appears in more than one group`);
      seen.add(v);
    }
  }
});

test("group union covers every navigable view and excludes page_templates as a UI tab", () => {
  const union = new Set<CatalogView>();
  for (const g of GROUP_ORDER) for (const v of GROUP_VIEWS[g]) union.add(v);

  // page_templates is never a member (cards live on Designs).
  assert.ok(!union.has("page_templates" as CatalogView));

  // Every special tab (incl. health) is covered.
  for (const s of SPECIAL_TABS) {
    assert.ok(union.has(s), `special tab "${s}" is not in any group`);
  }

  // Every non-empty gallery tab is covered.
  for (const id of ALL_GALLERY_TABS) {
    assert.ok(union.has(id), `gallery tab "${id}" is not in any group`);
  }

  // The total count is 3 disjoint lists summed (sanity on "3 × N").
  const total = GROUP_ORDER.reduce((n, g) => n + GROUP_VIEWS[g].length, 0);
  assert.equal(union.size, total);
});

// ── groupOfView: round-trip + unknown → structure ────────────────────────────

test("groupOfView round-trips every membership", () => {
  for (const g of GROUP_ORDER) {
    for (const v of GROUP_VIEWS[g]) {
      assert.equal(groupOfView(v), g, `groupOfView("${v}") should be "${g}"`);
    }
  }
});

test("groupOfView: unknown view falls back to structure", () => {
  assert.equal(groupOfView("does-not-exist" as CatalogView), "structure");
  assert.equal(groupOfView("page_templates" as CatalogView), "structure");
});

// ── orderedViewsForGroup ──────────────────────────────────────────────────────

test("orderedViewsForGroup structure: all first, gallery in CODE_TAB_DEFS order, catalog_studio last", () => {
  const out = orderedViewsForGroup("structure", ALL_GALLERY_TABS);
  assert.equal(out[0], "all");
  assert.equal(out[out.length - 1], "catalog_studio");
  // Gallery tabs sit between, in CODE_TAB_DEFS order.
  assert.deepEqual(out, ["all", "blocks", "designs", "data", "shell", "catalog_studio"]);
});

test("orderedViewsForGroup structure: filters absent gallery tabs", () => {
  // Only "blocks" + "designs" present → others dropped, all/studio retained.
  const out = orderedViewsForGroup("structure", ["blocks", "designs"]);
  assert.deepEqual(out, ["all", "blocks", "designs", "catalog_studio"]);
});

test("orderedViewsForGroup structure: empty present → all + catalog_studio", () => {
  const out = orderedViewsForGroup("structure", []);
  assert.deepEqual(out, ["all", "catalog_studio"]);
});

test("orderedViewsForGroup design/admin: static, ignores present gallery tabs", () => {
  for (const g of ["design", "admin"] as CatalogGroup[]) {
    assert.deepEqual(orderedViewsForGroup(g, []), [...GROUP_VIEWS[g]]);
    assert.deepEqual(
      orderedViewsForGroup(g, ALL_GALLERY_TABS),
      [...GROUP_VIEWS[g]],
    );
  }
});

// ── firstViewOfGroup ──────────────────────────────────────────────────────────

test("firstViewOfGroup returns the first ordered view", () => {
  assert.equal(firstViewOfGroup("structure", ALL_GALLERY_TABS), "all");
  assert.equal(firstViewOfGroup("structure", []), "all");
  assert.equal(firstViewOfGroup("design", []), GROUP_VIEWS.design[0]);
  assert.equal(firstViewOfGroup("admin", []), GROUP_VIEWS.admin[0]);
});

// ── isValidView ───────────────────────────────────────────────────────────────

test("isValidView accepts health and rejects page_templates / garbage", () => {
  assert.equal(isValidView("health"), true);
  assert.equal(isValidView("all"), true);
  assert.equal(isValidView("blocks"), true);
  assert.equal(isValidView("taxonomy"), true);
  assert.equal(isValidView("page_templates"), false);
  assert.equal(isValidView("layout"), false);
  assert.equal(isValidView("not-a-view"), false);
  assert.equal(isValidView(""), false);
});

test("coerceCatalogView maps legacy six-tab ids onto the four UI tabs", () => {
  assert.equal(coerceCatalogView("layout"), "blocks");
  assert.equal(coerceCatalogView("elements"), "blocks");
  assert.equal(coerceCatalogView("sections"), "designs");
  assert.equal(coerceCatalogView("page_templates"), "designs");
  assert.equal(coerceCatalogView("connected"), "data");
  assert.equal(coerceCatalogView("shell"), "shell");
  assert.equal(coerceCatalogView("blocks"), "blocks");
  assert.equal(coerceCatalogView("health"), "health");
  assert.equal(coerceCatalogView("not-a-view"), null);
});

// ── resolveInitialView precedence ─────────────────────────────────────────────

test("resolveInitialView: URL beats everything", () => {
  assert.equal(
    resolveInitialView({
      urlView: "health",
      presetTab: "taxonomy",
      defaultView: "playground",
      firstStructureView: "all",
    }),
    "health",
  );
});

test("resolveInitialView: preset beats defaultView when no URL", () => {
  assert.equal(
    resolveInitialView({
      urlView: null,
      presetTab: "taxonomy",
      defaultView: "playground",
      firstStructureView: "all",
    }),
    "taxonomy",
  );
});

test("resolveInitialView: defaultView beats firstStructureView when no URL/preset", () => {
  assert.equal(
    resolveInitialView({
      urlView: null,
      presetTab: null,
      defaultView: "playground",
      firstStructureView: "all",
    }),
    "playground",
  );
});

test("resolveInitialView: falls back to firstStructureView", () => {
  assert.equal(
    resolveInitialView({
      urlView: null,
      presetTab: null,
      defaultView: null,
      firstStructureView: "all",
    }),
    "all",
  );
});

test("resolveInitialView: invalid candidates are skipped", () => {
  assert.equal(
    resolveInitialView({
      urlView: "garbage" as CatalogView,
      presetTab: "also-bad",
      defaultView: "nope" as CatalogView,
      firstStructureView: "all",
    }),
    "all",
  );
});

test("resolveInitialView: legacy page_templates URL lands on Designs", () => {
  assert.equal(
    resolveInitialView({
      urlView: "page_templates" as CatalogView,
      presetTab: null,
      defaultView: null,
      firstStructureView: "all",
    }),
    "designs",
  );
});
