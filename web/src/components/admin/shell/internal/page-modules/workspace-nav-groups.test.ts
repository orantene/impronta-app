import test from "node:test";
import assert from "node:assert/strict";

import type { WorkspaceNavContext } from "@/lib/workspace/destinations";
import { workspaceNavContext } from "@/lib/workspace/nav-context";
import { navWorkspacePages } from "@/lib/workspace/page-ids";
import { visibleWorkspacePages } from "@/lib/saas/workspace-type";
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
const itemOf = (result: ReturnType<typeof build>, id: string): WorkspaceNavItem | undefined =>
  flat(result).find((i) => i.id === id);

/**
 * THE RAIL FROM A TENANT ROW, not from a hand-made context.
 *
 * `tenantIdentity` and `sessionIdentity` are shaped exactly as the identity
 * bridge delivers them, and `visiblePages` is computed by the same
 * `visibleWorkspacePages` the provider uses, so what these tests exercise is
 * the whole client-side chain: bridge → `workspaceNavContext` → registry →
 * rail. A label proven this way cannot be green while the shell is passing the
 * derivation a stubbed preset.
 */
function railFor(
  tenant: { industryPreset?: string | null; workspaceType?: "talent" | "business" },
  over: { teamMemberCount?: number; plan?: WorkspaceNavContext["plan"] } & Partial<
    Pick<WorkspaceNavInput, "activePage" | "pathname" | "search" | "subBadges">
  > = {},
) {
  const workspaceType = tenant.workspaceType ?? "talent";
  const visiblePages = visibleWorkspacePages(workspaceType, ALL_PAGES);
  return workspaceNavGroups({
    context: workspaceNavContext({
      tenantIdentity: { industryPreset: tenant.industryPreset ?? null },
      sessionIdentity: { role: "owner", canManageBilling: true },
      workspaceType,
      plan: over.plan ?? "agency",
      visiblePages,
      teamMemberCount: over.teamMemberCount ?? 6,
      hasTalentProfile: false,
      fallbackRole: "viewer",
    }),
    adminBase: "/admin",
    visiblePages,
    activePage: over.activePage ?? "overview",
    pathname: over.pathname ?? "/admin",
    search: over.search ?? "",
    badges: {},
    subBadges: over.subBadges,
    websiteSubItems: [],
  });
}

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
  // Projects and Payments were each built by their own slice, so each
  // branch removed one from this list. Only what is unbuilt on both
  // sides belongs here.
  // Payments lands on Financials so a URL for it works. A rail row would be a
  // second, differently-labelled door onto a page that already has one. My work
  // has no route at all yet.
  const ids = flat(build()).map((i) => i.id);
  for (const absent of ["mywork"]) {
    assert.ok(!ids.includes(absent as WorkspaceNavItem["id"]), `${absent} is a rail row`);
  }
  // Projects was in that list until P4 (2026-09-10) gave it a real route. It is
  // asserted PRESENT here so the deletion above reads as a changed fact rather
  // than a loosened check.
  assert.ok(ids.includes("projects" as WorkspaceNavItem["id"]), "Projects lost its rail row");
});

// ── Preset labels, from the tenant row ───────────────────────────────
//
// These four are the proof for the regression that the rail passed the
// derivation `industryPreset: undefined` while holding the tenant row, so every
// workspace on the platform resolved to `hybrid` and a restaurant's rail row
// went from "Menu" to "Catalog". They start at a bridge payload and end at a
// drawn label; nothing in them names a preset shape by hand.

test("a cafe tenant's rail says Menu and catalog, and Team", () => {
  // `restaurant` sells a menu and books nobody — the cafe shape.
  const cafe = railFor({ industryPreset: "restaurant" });
  assert.equal(labelOf(cafe, "catalog"), "Menu and catalog");
  assert.equal(labelOf(cafe, "people"), "Team");
});

test("a solo professional's rail says Services", () => {
  // `salon_barber` books appointments; one person on the team makes it solo.
  const solo = railFor({ industryPreset: "salon_barber" }, { teamMemberCount: 1 });
  assert.equal(labelOf(solo, "catalog"), "Services");
  // Appointments needs no override — it is the base label.
  assert.equal(labelOf(solo, "appts"), "Appointments");
});

test("the same trade with a team is hybrid and keeps the base labels", () => {
  const team = railFor({ industryPreset: "salon_barber" }, { teamMemberCount: 9 });
  assert.equal(labelOf(team, "catalog"), "Catalog");
  assert.equal(labelOf(team, "people"), "People");
});

test("a workspace with no preset on the bridge keeps the base labels", () => {
  // The shape that relabels nothing. This is the CORRECT answer for a tenant
  // with no `industry_preset`, and the WRONG answer for every other tenant —
  // which is why the three tests above exist beside it.
  for (const missing of [null, undefined]) {
    const none = railFor({ industryPreset: missing });
    assert.equal(labelOf(none, "catalog"), "Catalog", String(missing));
    assert.equal(labelOf(none, "people"), "People", String(missing));
  }
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
  // `clampWorkspacePage` sends /admin/pitches to Overview on a business
  // workspace, so a Pitches row would bounce on click — the bug WP1 fixed. The
  // registry alone would still show it; visiblePages is what keeps the link and
  // the route in agreement.
  const visiblePages = ALL_PAGES.filter((p) => p !== "pitches") as WorkspacePage[];
  const items = flat(build({ visiblePages }, { workspaceType: "business" })).map((i) => i.id);
  assert.ok(!items.includes("pitches"));
  assert.ok(items.includes("clients"), "everything else in Relationships stays");
});

test("a business workspace still gets People, with only its talent-only children hidden", () => {
  // A restaurant represents nobody, but it has staff, and People is the row
  // that lists them. What a business genuinely cannot open is the roster's
  // representation queues: /admin/roster/{applications,registration,rates} each
  // call `assertRosterWorkspace` and 404. The rail must agree with that split —
  // not drop the whole row, which is what hiding the `roster` page id did.
  const biz = railFor({ industryPreset: "restaurant", workspaceType: "business" });
  const people = itemOf(biz, "people");
  assert.ok(people, "a business workspace has no People row at all");
  assert.equal(people.label, "Team", "a cafe-shaped business calls its people Team");
  assert.deepEqual(
    people.subItems.map((s) => s.id),
    ["people-everyone"],
    "a business workspace was offered a roster queue its routes 404",
  );
  assert.ok(!flat(biz).some((i) => i.id === "pitches"), "Pitches is still hidden");

  // The same rail on a talent workspace keeps all four.
  const talent = railFor({ industryPreset: "restaurant" });
  assert.deepEqual(
    itemOf(talent, "people")?.subItems.map((s) => s.id),
    ["people-everyone", "people-applications", "people-registration", "people-rates"],
  );
});

// ── Sub-views ────────────────────────────────────────────────────────

test("the roster queues hang off People at the route People renders on", () => {
  // People's canonical segment is /admin/people; it RENDERS at /admin/roster,
  // and its children have to be where the pages are. Gating them on "has this
  // destination reached its canonical segment" is what silently deleted them.
  const people = itemOf(railFor({ industryPreset: "agency" }), "people");
  assert.deepEqual(
    people?.subItems.map((s) => [s.label, s.href]),
    [
      ["Everyone", "/admin/roster"],
      ["Applications", "/admin/roster/applications"],
      ["Registration", "/admin/roster/registration"],
      ["Rates", "/admin/roster/rates"],
    ],
  );
});

test("the pending count rides the Applications child, not just the parent", () => {
  // The parent badge says "12 awaiting review"; this is the one click to the
  // twelve. A child with no count is the affordance the rail used to have.
  const people = itemOf(
    railFor({ industryPreset: "agency" }, { subBadges: { "people-applications": 12 } }),
    "people",
  );
  const applications = people?.subItems.find((s) => s.id === "people-applications");
  assert.equal(applications?.count, 12);
  assert.equal(
    people?.subItems.find((s) => s.id === "people-everyone")?.count,
    undefined,
    "a count leaked onto a child it was not addressed to",
  );
});

test("the five Events children are drawn, queries and cross-link included", () => {
  // Composing an event and the ticket tab are STATES of the events list, not
  // routes; Orders is its own destination, cross-linked because the door and
  // the ticket orders it checks in are one job.
  const events = itemOf(railFor({ industryPreset: "bar_club" }), "events");
  assert.deepEqual(
    events?.subItems.map((s) => [s.label, s.href]),
    [
      ["All events", "/admin/events"],
      ["Add new event", "/admin/events?compose=new"],
      ["Tickets", "/admin/events?tab=tickets"],
      ["Orders", "/admin/orders"],
      ["Live check-in", "/admin/events/door"],
    ],
  );
});

test("only one Events child looks current at a time", () => {
  const onList = itemOf(railFor({ industryPreset: "bar_club" }, {
    activePage: "events", pathname: "/admin/events", search: "",
  }), "events");
  assert.deepEqual(
    onList?.subItems.filter((s) => s.active).map((s) => s.id),
    ["events-all"],
  );

  const composing = itemOf(railFor({ industryPreset: "bar_club" }, {
    activePage: "events", pathname: "/admin/events", search: "compose=new",
  }), "events");
  assert.deepEqual(
    composing?.subItems.filter((s) => s.active).map((s) => s.id),
    ["events-new"],
    "the landing view stayed lit while a sibling query was on",
  );

  const atDoor = itemOf(railFor({ industryPreset: "bar_club" }, {
    activePage: "events", pathname: "/admin/events/door", search: "",
  }), "events");
  assert.deepEqual(
    atDoor?.subItems.filter((s) => s.active).map((s) => s.id),
    ["events-door"],
  );
});

test("every Appointments child stays on the one route it has, as a query", () => {
  // THE CLAIM IS UNCHANGED, ONLY ITS SUBJECT MOVED. This used to assert that
  // Appointments drew no children at all, because /admin/sessions held one
  // page.tsx and a link to a Series or Waitlist path would have been a link to
  // a 404. The three views now exist, and they are TABS of that one page rather
  // than three routes, so the thing that must stay true is not "no children" —
  // it is that no child adds a path segment nothing can serve. That is what is
  // checked here, against the hrefs the rail actually builds.
  const appts = itemOf(railFor({ industryPreset: "agency" }), "appts");
  assert.deepEqual(
    appts?.subItems.map((s) => [s.label, s.href]),
    [
      ["Appointments", "/admin/sessions"],
      ["Sessions and series", "/admin/sessions?view=sessions"],
      ["Waitlist", "/admin/sessions?view=waitlist"],
    ],
  );
  for (const sub of appts?.subItems ?? []) {
    const path = sub.href.split("?")[0];
    assert.equal(
      path,
      "/admin/sessions",
      `${sub.id} points at ${path}, which is not the route Appointments renders on`,
    );
  }
});

test("only one Appointments child looks current at a time", () => {
  const onList = itemOf(railFor({ industryPreset: "agency" }, {
    activePage: "sessions", pathname: "/admin/sessions", search: "",
  }), "appts");
  assert.deepEqual(
    onList?.subItems.filter((s) => s.active).map((s) => s.id),
    ["appts-list"],
  );

  const onWaitlist = itemOf(railFor({ industryPreset: "agency" }, {
    activePage: "sessions", pathname: "/admin/sessions", search: "view=waitlist",
  }), "appts");
  assert.deepEqual(
    onWaitlist?.subItems.filter((s) => s.active).map((s) => s.id),
    ["appts-waitlist"],
    "the landing view stayed lit while a sibling query was on",
  );
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
