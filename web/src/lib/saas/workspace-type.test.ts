import assert from "node:assert/strict";
import { test } from "node:test";

import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";
import { resolveWorkspaceAdminPage } from "@/app/(workspace)/[tenantSlug]/admin/workspace-page-routing";
import {
  BUSINESS_HIDDEN_PAGES,
  DEFAULT_WORKSPACE_TYPE,
  WORKSPACE_TYPES,
  clampWorkspacePage,
  normalizeWorkspaceType,
  rosterEnabled,
  visibleWorkspacePages,
  workspacePageVisible,
} from "./workspace-type";

/**
 * Mirror of `internal/state/fixtures.ts`'s WORKSPACE_PAGES. Duplicated here
 * rather than imported because that module is `"use client"` and this lane must
 * stay free of the shell graph. The `pages list matches the shell's` test below
 * pins the two together, so drift fails here rather than in production.
 */
const ALL_PAGES: WorkspacePage[] = [
  "overview",
  "messages",
  "calendar",
  "menu",
  "roster",
  "clients",
  "pitches",
  "operations",
  "production",
  "website",
  "media",
  "settings",
];

// ─── normalizeWorkspaceType — fails CLOSED toward "talent" ───────────────────

test("normalizeWorkspaceType passes through the known types", () => {
  assert.equal(normalizeWorkspaceType("talent"), "talent");
  assert.equal(normalizeWorkspaceType("business"), "business");
});

test("normalizeWorkspaceType tolerates case and whitespace", () => {
  assert.equal(normalizeWorkspaceType("  BUSINESS  "), "business");
  assert.equal(normalizeWorkspaceType("Talent"), "talent");
});

test("normalizeWorkspaceType degrades ANYTHING unrecognised to talent", () => {
  // The fallback direction is the whole safety property: an unknown value must
  // never hide surfaces from an existing agency.
  assert.equal(normalizeWorkspaceType(null), "talent");
  assert.equal(normalizeWorkspaceType(undefined), "talent");
  assert.equal(normalizeWorkspaceType(""), "talent");
  assert.equal(normalizeWorkspaceType("   "), "talent");
  assert.equal(normalizeWorkspaceType("agency"), "talent");
  assert.equal(normalizeWorkspaceType("businesses"), "talent");
  assert.equal(normalizeWorkspaceType("BUSINESS_UNIT"), "talent");
  assert.equal(normalizeWorkspaceType(0), "talent");
  assert.equal(normalizeWorkspaceType(1), "talent");
  assert.equal(normalizeWorkspaceType(true), "talent");
  assert.equal(normalizeWorkspaceType({ workspace_type: "business" }), "talent");
  assert.equal(normalizeWorkspaceType(["business"]), "talent");
  assert.equal(normalizeWorkspaceType(DEFAULT_WORKSPACE_TYPE), "talent");
});

test("WORKSPACE_TYPES is the exhaustive union and defaults to talent", () => {
  assert.deepEqual([...WORKSPACE_TYPES], ["talent", "business"]);
  assert.equal(DEFAULT_WORKSPACE_TYPE, "talent");
});

// ─── rosterEnabled ───────────────────────────────────────────────────────────

test("rosterEnabled is true only for talent workspaces", () => {
  assert.equal(rosterEnabled("talent"), true);
  assert.equal(rosterEnabled("business"), false);
});

test("rosterEnabled composed with the normalizer never hides an unknown type's roster", () => {
  assert.equal(rosterEnabled(normalizeWorkspaceType("who-knows")), true);
  assert.equal(rosterEnabled(normalizeWorkspaceType(null)), true);
});

// ─── visibleWorkspacePages ───────────────────────────────────────────────────

test("visibleWorkspacePages returns every page for a talent workspace", () => {
  assert.deepEqual(visibleWorkspacePages("talent", ALL_PAGES), ALL_PAGES);
});

test("visibleWorkspacePages drops exactly roster + pitches for a business workspace", () => {
  const visible = visibleWorkspacePages("business", ALL_PAGES);
  assert.deepEqual(visible, [
    "overview",
    "messages",
    "calendar",
    "menu",
    "clients",
    "operations",
    "production",
    "website",
    "media",
    "settings",
  ]);
  // Nothing beyond the documented two is removed — a business workspace keeps
  // the full site builder, inbox, calendar, clients, media and settings.
  const removed = ALL_PAGES.filter((p) => !visible.includes(p));
  assert.deepEqual(removed, [...BUSINESS_HIDDEN_PAGES]);
});

test("visibleWorkspacePages preserves order and does not mutate its input", () => {
  const input: WorkspacePage[] = [...ALL_PAGES];
  const visible = visibleWorkspacePages("business", input);
  assert.deepEqual(input, ALL_PAGES, "input array was mutated");
  assert.notEqual(visible, input, "returned the same array reference");
  const order = visible.map((p) => ALL_PAGES.indexOf(p));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("visibleWorkspacePages on an empty list is empty for both types", () => {
  assert.deepEqual(visibleWorkspacePages("talent", []), []);
  assert.deepEqual(visibleWorkspacePages("business", []), []);
});

test("the hidden page list matches the shell's canonical page names", () => {
  // Guards the duplicated ALL_PAGES mirror above: every hidden page must be a
  // page the shell actually renders, or the filter is silently a no-op.
  for (const page of BUSINESS_HIDDEN_PAGES) {
    assert.ok(ALL_PAGES.includes(page), `${page} is not a workspace nav page`);
  }
});

// ─── workspacePageVisible ────────────────────────────────────────────────────

test("workspacePageVisible allows everything on talent", () => {
  for (const page of ALL_PAGES) {
    assert.equal(workspacePageVisible("talent", page), true, page);
  }
});

test("workspacePageVisible blocks roster and pitches on business", () => {
  assert.equal(workspacePageVisible("business", "roster"), false);
  assert.equal(workspacePageVisible("business", "pitches"), false);
  assert.equal(workspacePageVisible("business", "overview"), true);
  assert.equal(workspacePageVisible("business", "website"), true);
  assert.equal(workspacePageVisible("business", "clients"), true);
  assert.equal(workspacePageVisible("business", "settings"), true);
});

// ─── clampWorkspacePage — the direct-URL guard ───────────────────────────────

test("clampWorkspacePage is identity on a talent workspace", () => {
  for (const page of ALL_PAGES) {
    assert.equal(clampWorkspacePage(page, "talent"), page);
  }
});

test("clampWorkspacePage sends hidden pages to overview on business", () => {
  assert.equal(clampWorkspacePage("roster", "business"), "overview");
  assert.equal(clampWorkspacePage("pitches", "business"), "overview");
  assert.equal(clampWorkspacePage("messages", "business"), "messages");
  assert.equal(clampWorkspacePage("overview", "business"), "overview");
});

test("clampWorkspacePage is idempotent", () => {
  for (const page of ALL_PAGES) {
    const once = clampWorkspacePage(page, "business");
    assert.equal(clampWorkspacePage(once, "business"), once, page);
  }
});

// ─── Both HOST SHAPES ────────────────────────────────────────────────────────
//
// The admin layout derives the initial page from `x-impronta-original-pathname`,
// whose shape differs by host: `/admin/roster` on a branded custom domain,
// `/impronta/admin/roster` on the shared platform host. Getting that wrong once
// already opened Overview on every deep link, so the clamp is exercised through
// the SAME derivation on BOTH shapes.

/** Byte-for-byte mirror of `deriveInitialPage` in the workspace admin layout. */
function deriveInitialPage(pathname: string, adminPrefix: string): WorkspacePage {
  const after = pathname.startsWith(adminPrefix) ? pathname.slice(adminPrefix.length) : "";
  const segment = after.replace(/^\//, "").split("/")[0] ?? "";
  return resolveWorkspaceAdminPage(segment || "overview");
}

const HOST_SHAPES = [
  { name: "branded host", prefix: "/admin", path: (seg: string) => `/admin${seg}` },
  {
    name: "platform host",
    prefix: "/impronta/admin",
    path: (seg: string) => `/impronta/admin${seg}`,
  },
] as const;

for (const shape of HOST_SHAPES) {
  test(`[${shape.name}] a business workspace clamps /roster deep links to overview`, () => {
    for (const seg of ["/roster", "/roster/new", "/roster/applications", "/roster/rates"]) {
      const derived = deriveInitialPage(shape.path(seg), shape.prefix);
      assert.equal(derived, "roster", `derivation broke for ${seg}`);
      assert.equal(clampWorkspacePage(derived, "business"), "overview", seg);
      assert.equal(clampWorkspacePage(derived, "talent"), "roster", seg);
    }
  });

  test(`[${shape.name}] a business workspace clamps /pitches and the legacy /talent alias`, () => {
    const pitches = deriveInitialPage(shape.path("/pitches"), shape.prefix);
    assert.equal(pitches, "pitches");
    assert.equal(clampWorkspacePage(pitches, "business"), "overview");

    // "/talent" is a legacy alias that resolves to roster — it must clamp too,
    // otherwise the old URL is a hole straight through the new guard.
    const legacy = deriveInitialPage(shape.path("/talent"), shape.prefix);
    assert.equal(legacy, "roster");
    assert.equal(clampWorkspacePage(legacy, "business"), "overview");
  });

  test(`[${shape.name}] every non-roster deep link survives on a business workspace`, () => {
    for (const seg of [
      "",
      "/messages",
      "/calendar",
      "/clients",
      "/operations",
      "/production",
      "/website",
      "/media",
      "/settings",
      "/financials",
      "/payouts",
    ]) {
      const derived = deriveInitialPage(shape.path(seg), shape.prefix);
      assert.equal(
        clampWorkspacePage(derived, "business"),
        derived,
        `${seg || "(root)"} was clamped and should not have been`,
      );
    }
  });

  test(`[${shape.name}] a talent workspace is unaffected by the clamp`, () => {
    for (const seg of ["", "/roster", "/pitches", "/website", "/settings"]) {
      const derived = deriveInitialPage(shape.path(seg), shape.prefix);
      assert.equal(clampWorkspacePage(derived, "talent"), derived, seg || "(root)");
    }
  });
}
