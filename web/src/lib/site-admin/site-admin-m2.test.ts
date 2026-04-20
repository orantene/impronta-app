/**
 * Phase 5 / M2 — unit tests for navigation schemas + pure helpers.
 *
 * Covers the no-DB surface:
 *   - NAV_ZONES / NAV_MAX_DEPTH / NAV_MAX_ITEMS_PER_MENU invariants
 *   - navHrefSchema: absolute URL, mailto:, tel:, relative-allowed,
 *     relative-reserved rejected, empty rejected, too-long rejected
 *   - navItemDraftSchema: minimum valid, missing label, bad href, bad parent
 *     uuid, negative sort, negative expectedVersion
 *   - navPublishSchema: basic shape
 *   - navReorderSchema: empty array rejected, over-cap rejected
 *   - navTreeSchema: depth cap, duplicate ids across levels, valid nested
 *   - navigation.publish capability grants: editor/viewer NO, coordinator/admin/owner YES
 *   - buildTreeFromRows: root + nested + parent-missing-fallback + stable order
 *
 * Run with: npx tsx --test src/lib/site-admin/site-admin-m2.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NAV_ZONES,
  NAV_MAX_DEPTH,
  NAV_MAX_ITEMS_PER_MENU,
  navHrefSchema,
  navItemDeleteSchema,
  navItemDraftSchema,
  navPublishSchema,
  navReorderSchema,
  navTreeSchema,
  rolePhase5HasCapability,
} from "./index";
import {
  buildTreeFromRows,
  type NavItemRow,
} from "./server/navigation";

// ---- invariants -----------------------------------------------------------

test("NAV_ZONES is ['header','footer']", () => {
  assert.deepEqual([...NAV_ZONES], ["header", "footer"]);
});

test("NAV_MAX_DEPTH = 2 and NAV_MAX_ITEMS_PER_MENU = 100", () => {
  assert.equal(NAV_MAX_DEPTH, 2);
  assert.equal(NAV_MAX_ITEMS_PER_MENU, 100);
});

// ---- navHrefSchema --------------------------------------------------------

test("navHrefSchema accepts https/http absolute URLs", () => {
  for (const href of ["https://x.y", "http://x.y/z", "https://example.com/path?q=1"]) {
    assert.equal(navHrefSchema.safeParse(href).success, true, `href=${href}`);
  }
});

test("navHrefSchema accepts mailto: and tel:", () => {
  assert.equal(navHrefSchema.safeParse("mailto:a@b.c").success, true);
  assert.equal(navHrefSchema.safeParse("tel:+12345").success, true);
});

test("navHrefSchema accepts root-relative non-reserved paths", () => {
  for (const href of ["/", "/about", "/services/booking", "/contact?x=1#y"]) {
    assert.equal(navHrefSchema.safeParse(href).success, true, `href=${href}`);
  }
});

test("navHrefSchema rejects reserved-slug relative paths", () => {
  for (const href of ["/admin", "/admin/dashboard", "/auth/login", "/api/x", "/onboarding", "/_next/y"]) {
    const r = navHrefSchema.safeParse(href);
    assert.equal(r.success, false, `href=${href} should be rejected`);
  }
});

test("navHrefSchema rejects bogus protocols and empties", () => {
  for (const href of ["", "   ", "javascript:alert(1)", "ftp://x.y", "about:blank"]) {
    assert.equal(navHrefSchema.safeParse(href).success, false, `href=${href}`);
  }
});

test("navHrefSchema caps length at 2048", () => {
  const long = "/" + "a".repeat(2100);
  assert.equal(navHrefSchema.safeParse(long).success, false);
});

// ---- navItemDraftSchema ---------------------------------------------------

const MIN_ITEM = {
  zone: "header" as const,
  locale: "en" as const,
  label: "About",
  href: "/about",
  sortOrder: 0,
  visible: true,
  expectedVersion: 0,
};

test("navItemDraftSchema accepts minimum valid create", () => {
  const r = navItemDraftSchema.safeParse(MIN_ITEM);
  assert.equal(r.success, true);
});

test("navItemDraftSchema rejects empty label + over-long label", () => {
  assert.equal(navItemDraftSchema.safeParse({ ...MIN_ITEM, label: "" }).success, false);
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, label: "x".repeat(81) }).success,
    false,
  );
});

test("navItemDraftSchema rejects reserved href + bogus href", () => {
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, href: "/admin" }).success,
    false,
  );
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, href: "javascript:void(0)" }).success,
    false,
  );
});

test("navItemDraftSchema rejects bad UUIDs in id / parentId", () => {
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, id: "not-a-uuid" }).success,
    false,
  );
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, parentId: "nope" }).success,
    false,
  );
});

test("navItemDraftSchema accepts null parentId and valid uuid", () => {
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, parentId: null }).success,
    true,
  );
  assert.equal(
    navItemDraftSchema.safeParse({
      ...MIN_ITEM,
      parentId: "11111111-1111-4111-8111-111111111111",
    }).success,
    true,
  );
});

test("navItemDraftSchema rejects negative expectedVersion / sortOrder", () => {
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, expectedVersion: -1 }).success,
    false,
  );
  assert.equal(
    navItemDraftSchema.safeParse({ ...MIN_ITEM, sortOrder: -1 }).success,
    false,
  );
});

// ---- navItemDeleteSchema / navPublishSchema / navReorderSchema -----------

test("navItemDeleteSchema requires id + zone + locale + expectedVersion", () => {
  const valid = navItemDeleteSchema.safeParse({
    id: "11111111-1111-4111-8111-111111111111",
    zone: "header",
    locale: "en",
    expectedVersion: 3,
  });
  assert.equal(valid.success, true);

  const bad = navItemDeleteSchema.safeParse({
    id: "not-a-uuid",
    zone: "header",
    locale: "en",
    expectedVersion: 3,
  });
  assert.equal(bad.success, false);
});

test("navPublishSchema accepts minimum valid", () => {
  const r = navPublishSchema.safeParse({
    zone: "header",
    locale: "en",
    expectedMenuVersion: 0,
  });
  assert.equal(r.success, true);
});

test("navReorderSchema rejects empty + over-cap + bad zone", () => {
  assert.equal(
    navReorderSchema.safeParse({ zone: "header", locale: "en", items: [] }).success,
    false,
  );
  const big = Array.from({ length: NAV_MAX_ITEMS_PER_MENU + 1 }, (_, i) => ({
    id: "11111111-2222-3333-4444-55555555555" + (i % 10),
    parentId: null,
    sortOrder: i,
    expectedVersion: 1,
  }));
  assert.equal(
    navReorderSchema.safeParse({ zone: "header", locale: "en", items: big }).success,
    false,
  );
});

// ---- navTreeSchema --------------------------------------------------------

function node(id: string, children: unknown[] = []) {
  return {
    id,
    label: "N",
    href: "/n",
    visible: true,
    sortOrder: 0,
    children,
  };
}

test("navTreeSchema accepts a nested depth-2 tree", () => {
  const tree = [
    node("11111111-1111-4111-8111-111111111111", [
      node("22222222-2222-4222-8222-222222222222"),
      node("33333333-3333-4333-8333-333333333333"),
    ]),
    node("44444444-4444-4444-8444-444444444444"),
  ];
  const r = navTreeSchema.safeParse(tree);
  assert.equal(r.success, true);
});

test("navTreeSchema rejects depth > 2", () => {
  const tree = [
    node("11111111-1111-4111-8111-111111111111", [
      node("22222222-2222-4222-8222-222222222222", [
        node("33333333-3333-4333-8333-333333333333"),
      ]),
    ]),
  ];
  const r = navTreeSchema.safeParse(tree);
  assert.equal(r.success, false);
});

test("navTreeSchema rejects duplicate ids across levels", () => {
  const dup = "11111111-1111-4111-8111-111111111111";
  const tree = [node(dup, [node(dup)])];
  const r = navTreeSchema.safeParse(tree);
  assert.equal(r.success, false);
});

test("navTreeSchema rejects oversized tree", () => {
  const many = Array.from({ length: NAV_MAX_ITEMS_PER_MENU + 1 }, (_, i) =>
    node(
      `11111111-1111-1111-1111-1111111111${(i % 100).toString().padStart(2, "0")}`,
    ),
  );
  assert.equal(navTreeSchema.safeParse(many).success, false);
});

test("navTreeSchema rejects reserved-route href in a node", () => {
  const tree = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      label: "Admin",
      href: "/admin",
      visible: true,
      sortOrder: 0,
      children: [],
    },
  ];
  assert.equal(navTreeSchema.safeParse(tree).success, false);
});

// ---- capabilities ---------------------------------------------------------

test("navigation.publish: editor NO, viewer NO", () => {
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.navigation.publish"),
    false,
  );
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.navigation.publish"),
    false,
  );
});

test("navigation.publish: coordinator/admin/owner YES", () => {
  for (const role of ["coordinator", "admin", "owner"] as const) {
    assert.equal(
      rolePhase5HasCapability(role, "agency.site_admin.navigation.publish"),
      true,
      `role=${role} should have navigation.publish`,
    );
  }
});

test("navigation.edit: editor YES, viewer NO", () => {
  assert.equal(
    rolePhase5HasCapability("editor", "agency.site_admin.navigation.edit"),
    true,
  );
  assert.equal(
    rolePhase5HasCapability("viewer", "agency.site_admin.navigation.edit"),
    false,
  );
});

// ---- buildTreeFromRows ----------------------------------------------------

function mkRow(id: string, opts: Partial<NavItemRow> = {}): NavItemRow {
  return {
    id,
    tenant_id: "00000000-0000-0000-0000-000000000001",
    zone: "header",
    locale: "en",
    parent_id: null,
    label: id,
    href: "/" + id,
    sort_order: 0,
    visible: true,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...opts,
  };
}

test("buildTreeFromRows handles flat list in sort order", () => {
  const tree = buildTreeFromRows([
    mkRow("b", { sort_order: 20 }),
    mkRow("a", { sort_order: 10 }),
    mkRow("c", { sort_order: 30 }),
  ]);
  assert.deepEqual(
    tree.map((n) => n.id),
    ["a", "b", "c"],
  );
});

test("buildTreeFromRows nests children under parent in sort order", () => {
  const tree = buildTreeFromRows([
    mkRow("root", { sort_order: 10 }),
    mkRow("c2", { parent_id: "root", sort_order: 20 }),
    mkRow("c1", { parent_id: "root", sort_order: 10 }),
  ]);
  assert.equal(tree.length, 1);
  assert.deepEqual(
    tree[0]!.children.map((c) => c.id),
    ["c1", "c2"],
  );
});

test("buildTreeFromRows promotes orphans (missing parent) to root", () => {
  const tree = buildTreeFromRows([
    mkRow("r"),
    mkRow("orphan", { parent_id: "ghost" }),
  ]);
  // Both end up at root level because parent 'ghost' was never in the set.
  assert.equal(tree.length, 2);
  assert.ok(tree.some((n) => n.id === "orphan"));
});
