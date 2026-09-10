import test from "node:test";
import assert from "node:assert/strict";

import type { WorkspaceNavContext } from "@/lib/workspace/destinations";
import { navWorkspacePages } from "@/lib/workspace/page-ids";
import type { WorkspacePage } from "../state/types";
import {
  workspaceNavGroups,
  type WorkspaceNavInput,
  type WorkspaceNavItem,
} from "./workspace-nav-groups";

/**
 * The rail, unit-tested. It could not be before: it was five structures inside
 * a `"use client"` component, and the only guard on it was a source scan.
 */

const ALL_PAGES = navWorkspacePages();

const BASE_CONTEXT: WorkspaceNavContext = {
  workspaceType: "talent",
  plan: "agency",
  preset: "hybrid",
  role: "owner",
  professional: false,
  takesReservations: true,
  runsEvents: true,
  posEnabled: true,
  canManageBilling: true,
};

function build(
  over: Partial<WorkspaceNavInput> = {},
  context: Partial<WorkspaceNavContext> = {},
) {
  return workspaceNavGroups({
    context: { ...BASE_CONTEXT, ...context },
    adminBase: "/admin",
    visiblePages: ALL_PAGES,
    activePage: "overview",
    pathname: "/admin",
    search: "",
    badges: {},
    websiteSubItems: [],
    ...over,
  });
}

const flat = (result: ReturnType<typeof build>): WorkspaceNavItem[] => [
  ...result.groups.flatMap((g) => [...g.items]),
  ...result.pinned,
];
const labelOf = (result: ReturnType<typeof build>, id: string): string | undefined =>
  flat(result).find((i) => i.id === id)?.label;

// ── Shape ────────────────────────────────────────────────────────────

test("six groups plus a pinned Settings, in the registry's order", () => {
  const { groups, pinned } = build();
  assert.deepEqual(
    groups.map((g) => g.id),
    ["home", "operate", "sell", "relationships", "money", "grow"],
  );
  assert.equal(groups[0].label, null, "Overview renders without a heading");
  assert.deepEqual(
    pinned.map((i) => i.id),
    ["settings"],
    "Settings is pinned to the foot and appears nowhere else",
  );
});

test("the point of sale is never a rail row", () => {
  // It replaces the whole admin chrome and is entered from the top bar. Even
  // with the POS switched on and the page visible, no group carries it.
  const items = flat(build({}, { posEnabled: true }));
  assert.ok(!items.some((i) => i.id === "pos"), "a POS row is in the rail");
  assert.ok(!build().groups.some((g) => g.id === "pos"), "the pos group is in the rail");
});

test("every rail row points at a route that exists and a page the shell can open", () => {
  for (const item of flat(build())) {
    assert.ok(item.href.startsWith("/admin"), `${item.id} href: ${item.href}`);
    assert.ok(ALL_PAGES.includes(item.page), `${item.id} opens ${item.page}, which is not a nav page`);
  }
});

test("an unbuilt destination is not a row, even though its URL resolves", () => {
  // Projects lands on Messages and Payments on Financials so a URL for them
  // works. A rail row would be a second, differently-labelled door onto a page
  // that already has one.
  const ids = flat(build()).map((i) => i.id);
  for (const absent of ["projects", "payments", "mywork"]) {
    assert.ok(!ids.includes(absent as WorkspaceNavItem["id"]), `${absent} is a rail row`);
  }
});

// ── Preset labels ────────────────────────────────────────────────────

test("a cafe says Menu and catalog, and Team", () => {
  const cafe = build({}, { preset: "cafe" });
  assert.equal(labelOf(cafe, "catalog"), "Menu and catalog");
  assert.equal(labelOf(cafe, "people"), "Team");
});

test("a solo professional says Services", () => {
  const solo = build({}, { preset: "solo" });
  assert.equal(labelOf(solo, "catalog"), "Services");
  // Appointments needs no override — it is the base label.
  assert.equal(labelOf(solo, "appts"), "Appointments");
});

test("hybrid — the shape that relabels nothing — keeps the base labels", () => {
  const hybrid = build();
  assert.equal(labelOf(hybrid, "catalog"), "Catalog");
  assert.equal(labelOf(hybrid, "people"), "People");
});

// ── Gating ───────────────────────────────────────────────────────────

test("Media appears only on the agency plan", () => {
  for (const plan of ["free", "website", "studio"] as const) {
    assert.ok(!flat(build({}, { plan })).some((i) => i.id === "media"), plan);
  }
  for (const plan of ["agency", "network"] as const) {
    assert.ok(flat(build({}, { plan })).some((i) => i.id === "media"), plan);
  }
});

test("a workspace that takes no reservations and runs no events gets neither row", () => {
  const visiblePages = ALL_PAGES.filter((p) => p !== "reservations" && p !== "events");
  const items = flat(
    build({ visiblePages }, { takesReservations: false, runsEvents: false }),
  ).map((i) => i.id);
  assert.ok(!items.includes("reservations"));
  assert.ok(!items.includes("events"));
  assert.ok(items.includes("orders"), "the rest of Operate is untouched");
});

test("a row the workspace type refuses is never drawn", () => {
  // `clampWorkspacePage` sends /admin/roster and /admin/pitches to Overview on a
  // business workspace. A rail row for either would bounce on click — the bug
  // WP1 fixed. The registry alone would still show People; visiblePages is what
  // keeps the link and the route in agreement.
  const visiblePages = ALL_PAGES.filter(
    (p) => p !== "roster" && p !== "pitches",
  ) as WorkspacePage[];
  const items = flat(build({ visiblePages }, { workspaceType: "business" })).map((i) => i.id);
  assert.ok(!items.includes("people"), "People bounces on a business workspace today");
  assert.ok(!items.includes("pitches"));
  assert.ok(items.includes("clients"), "everything else in Relationships stays");
});

// ── Sub-views ────────────────────────────────────────────────────────

test("registry sub-views wait for their destination to move", () => {
  // People and Appointments both carry sub-views and both still render at their
  // legacy route. /admin/roster/talent is the roster's [id] page and
  // /admin/sessions/series is not a route at all, so drawing the tabs would be
  // four links into nothing.
  const items = flat(build());
  assert.deepEqual(items.find((i) => i.id === "people")?.subItems, []);
  assert.deepEqual(items.find((i) => i.id === "appts")?.subItems, []);
});

test("the Website sub-nav is passed through with active state resolved", () => {
  const result = build({
    activePage: "website",
    pathname: "/admin/website/pages",
    websiteSubItems: [
      { id: "overview", label: "Overview", href: "/admin/website", exact: true },
      { id: "pages", label: "Pages", href: "/admin/website/pages" },
      { id: "editor", label: "Editor", href: "https://example.test", external: true },
    ],
  });
  const website = flat(result).find((i) => i.id === "website");
  assert.ok(website?.active, "Website must be the active row");
  assert.deepEqual(
    website?.subItems.map((s) => [s.id, s.active]),
    [
      ["overview", false],
      ["pages", true],
      ["editor", false],
    ],
  );
});

// ── Active state ─────────────────────────────────────────────────────

test("active state comes from the registry's segments and aliases", () => {
  const cases: ReadonlyArray<readonly [WorkspacePage, string]> = [
    ["overview", "overview"],
    ["menu", "catalog"],
    ["roster", "people"],
    ["talent", "people"],
    ["sessions", "appts"],
    ["exceptions", "issues"],
    ["tables", "spaces"],
    ["inbox", "messages"],
    ["site", "website"],
    ["workspace", "settings"],
  ];
  for (const [activePage, expected] of cases) {
    const active = flat(build({ activePage })).filter((i) => i.active);
    assert.deepEqual(active.map((i) => i.id), [expected], `${activePage} lit the wrong row`);
  }
});

test("badges land on the row they were addressed to", () => {
  const items = flat(
    build({ badges: { messages: { count: 4, tone: "brand" }, people: { count: 2, tone: "amber" } } }),
  );
  assert.deepEqual(items.find((i) => i.id === "messages")?.badge, { count: 4, tone: "brand" });
  assert.deepEqual(items.find((i) => i.id === "people")?.badge, { count: 2, tone: "amber" });
  assert.equal(items.find((i) => i.id === "calendar")?.badge, null);
});

// ── Host shapes ──────────────────────────────────────────────────────

test("hrefs are built from the admin base, never a hardcoded slug", () => {
  for (const base of ["/admin", "/impronta/admin"]) {
    for (const item of flat(build({ adminBase: base }))) {
      assert.ok(item.href === base || item.href.startsWith(`${base}/`), `${item.id}: ${item.href}`);
    }
  }
});
