import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  DESTINATIONS,
  DESTINATION_IDS,
  DESTINATION_LIST,
  SIDEBAR_GROUP_ORDER,
  destinationHref,
  destinationLabel,
  destinationShortLabel,
  isPosSegment,
  liveRouteSegment,
  mobileTabs,
  planMeets,
  resolveDestination,
  resolveDestinationOrHome,
  segmentForDestination,
  sidebarGroups,
  visibleDestinations,
  visibleSubViews,
  type WorkspaceNavContext,
} from "./destinations";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const ADMIN_DIR = "src/app/(workspace)/[tenantSlug]/admin";

const BASE: WorkspaceNavContext = {
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

const ctx = (over: Partial<WorkspaceNavContext> = {}): WorkspaceNavContext => ({
  ...BASE,
  ...over,
});

// ── Purity ───────────────────────────────────────────────────────────

test("the registry has no runtime imports", () => {
  const src = read("src/lib/workspace/destinations.ts");
  const imports = src.match(/^import .*$/gm) ?? [];
  assert.ok(imports.length > 0, "expected the type imports to still be there");
  const runtime = imports.filter((line) => !line.startsWith("import type "));
  assert.deepEqual(
    runtime,
    [],
    "destinations.ts is read by a server layout, a client shell and node tests. " +
      "A value import drags one graph into the others:\n" + runtime.join("\n"),
  );
});

// ── Resolution ───────────────────────────────────────────────────────

test("every legacy segment resolves to the right destination", () => {
  const legacy: ReadonlyArray<readonly [string, string]> = [
    ["inbox", "messages"],
    ["sessions", "appts"],
    ["work", "projects"],
    ["exceptions", "issues"],
    ["menu", "catalog"],
    ["tables", "spaces"],
    ["roster", "people"],
    ["talent", "people"],
    ["financials", "payments"],
    ["payouts", "payments"],
    ["site", "website"],
    ["workspace", "settings"],
    ["billing", "settings"],
  ];
  for (const [raw, id] of legacy) {
    assert.equal(resolveDestination(raw)?.id, id, `${raw} must resolve to ${id}`);
  }
});

test("every canonical segment resolves to itself, and the root is Overview", () => {
  for (const id of DESTINATION_IDS) {
    const segment = segmentForDestination(id);
    assert.equal(resolveDestination(segment)?.id, id, `${segment || "(root)"} → ${id}`);
  }
  assert.equal(resolveDestination("")?.id, "overview");
  assert.equal(resolveDestination("/")?.id, "overview");
  assert.equal(resolveDestination("  Messages  ")?.id, "messages");
});

test("an unknown segment REFUSES rather than answering Overview", () => {
  // A silent Overview would stack the SPA under a real canonical page — the
  // exact failure the canonical matchers exist to prevent. Absence has to be
  // structurally distinct from an answer.
  assert.equal(resolveDestination("activity-log"), null);
  assert.equal(resolveDestination("triage"), null);
  // …and the total variant is opt-in, for URL clamps that genuinely need one.
  assert.equal(resolveDestinationOrHome("activity-log").id, "overview");
});

test("no segment or alias is claimed twice", () => {
  const seen = new Map<string, string>();
  for (const d of DESTINATION_LIST) {
    for (const key of [d.segment, ...d.aliases]) {
      const owner = seen.get(key);
      assert.equal(owner, undefined, `"${key}" is claimed by both ${owner} and ${d.id}`);
      seen.set(key, d.id);
    }
  }
});

// ── Routes that actually exist ───────────────────────────────────────

const adminRouteDirs = (): ReadonlySet<string> =>
  new Set(
    readdirSync(join(process.cwd(), ADMIN_DIR), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => e.name),
  );

test("every destination's live route is a route that exists", () => {
  const dirs = adminRouteDirs();
  for (const d of DESTINATION_LIST) {
    const route = liveRouteSegment(d);
    if (route === null) {
      assert.equal(d.built, false, `${d.id} has no route but claims to be built`);
      continue;
    }
    if (route === "") continue; // the admin root page
    assert.ok(
      dirs.has(route),
      `${d.id} points at /admin/${route}, which is not a directory under ${ADMIN_DIR}`,
    );
  }
});

test("an unbuilt destination's URL falls back to a page that exists", () => {
  const projects = resolveDestination("projects");
  assert.equal(projects?.built, false);
  assert.equal(projects && liveRouteSegment(projects), "messages");
  assert.equal(projects && destinationHref(projects, "/admin"), "/admin/messages");

  const payments = resolveDestination("payments");
  assert.equal(payments?.built, false);
  assert.equal(payments && liveRouteSegment(payments), "financials");
  assert.equal(
    payments && destinationHref(payments, "/acme/admin"),
    "/acme/admin/financials",
  );
  // The legacy URLs still land where they always did.
  assert.equal(resolveDestination("financials")?.id, "payments");
  assert.equal(resolveDestination("payouts")?.id, "payments");

  // mywork has nowhere honest to send a URL yet, and says so.
  const mywork = resolveDestination("mywork");
  assert.equal(mywork?.built, false);
  assert.equal(mywork && liveRouteSegment(mywork), null);
  assert.equal(mywork && destinationHref(mywork, "/admin"), null);
});

test("a built destination renamed ahead of its route still points at the live one", () => {
  // spaces/catalog/people/appts/issues carry their target name and render at
  // their legacy route until the routing task moves them. Both facts are here
  // so no consumer has to guess which is which.
  const renamed: ReadonlyArray<readonly [string, string]> = [
    ["spaces", "tables"],
    ["catalog", "menu"],
    ["people", "roster"],
    ["appts", "sessions"],
    ["issues", "exceptions"],
  ];
  for (const [id, route] of renamed) {
    const d = resolveDestination(id);
    assert.equal(d?.built, true, `${id} must be built`);
    assert.equal(d && liveRouteSegment(d), route);
  }
});

/**
 * Every segment the admin router accepted before it delegated to this registry.
 *
 * This used to be SCRAPED out of `workspace-page-routing.ts`, which carried its
 * own `WORKSPACE_PAGE_ALIASES` map and `WORKSPACE_PAGE_SEGMENTS` allow-list.
 * That file is now four lines that call `resolveWorkspacePageId`, so scraping it
 * would assert that the registry agrees with itself. The list is frozen here
 * instead: these are URLs in the wild — bookmarks, emailed links, browser
 * history — and none of them may ever stop resolving, whatever the registry
 * does next.
 */
const SEGMENTS_THE_ROUTER_ACCEPTED_BEFORE_THE_REGISTRY: readonly string[] = [
  "overview", "messages", "calendar", "sessions", "menu", "roster", "clients",
  "reviews", "analytics", "website", "media", "pitches", "financials", "orders",
  "sales", "discounts", "pos", "tables", "preparation", "reservations", "events",
  "payouts", "settings",
  // aliases
  "inbox", "work", "talent", "site", "billing", "workspace",
];

test("every segment the router accepted before the registry still has a destination", () => {
  const accepted = SEGMENTS_THE_ROUTER_ACCEPTED_BEFORE_THE_REGISTRY;
  assert.ok(accepted.length >= 29, `expected the frozen URL list, found ${accepted.length}`);
  assert.ok(
    read(`${ADMIN_DIR}/workspace-page-routing.ts`).includes("resolveWorkspacePageId"),
    "the admin router must delegate to the registry",
  );
  for (const raw of accepted) {
    assert.ok(
      resolveDestination(raw) !== null,
      `/${raw} was an accepted admin URL and resolves to no destination`,
    );
  }
});

test("every real admin route is either a destination or a declared deep page", () => {
  // Deep pages are reached FROM a destination, not from the rail. Listing them
  // by hand is the point: a new top-level route that belongs in the nav fails
  // this test instead of quietly never appearing in it.
  const DEEP_PAGES: Readonly<Record<string, string>> = {
    account: "the signed-in person's own account, reached from the avatar menu",
    "activity-log": "audit trail, reached from Settings",
    bookings: "a single booking's detail, reached from Calendar and Sales",
    "channel-performance": "a report, reached from Analytics",
    "discover-inquiries": "a filtered inquiry list, reached from Messages",
    "discover-performance": "a report, reached from Analytics",
    operations: "legacy shell segment with no rail entry",
    policy: "workspace policy pages, reached from Settings",
    print: "printable output, opened from Orders and Reservations",
    production: "legacy shell segment with no rail entry",
    "site-settings": "reached from Website",
    triage: "a focused queue, reached from Messages",
  };
  const unaccounted = [...adminRouteDirs()].filter(
    (dir) => resolveDestination(dir) === null && !(dir in DEEP_PAGES),
  );
  assert.deepEqual(
    unaccounted.sort(),
    [],
    "these admin routes are in neither the destination registry nor the " +
      "declared deep-page list:\n" + unaccounted.join("\n"),
  );
});

// ── Visibility ───────────────────────────────────────────────────────

test("a business workspace sees People, but no talent sub-views and no Pitches", () => {
  const business = ctx({ workspaceType: "business" });
  const visible = visibleDestinations(business).map((d) => d.id);
  assert.ok(visible.includes("people"), "a business still has people");
  assert.ok(!visible.includes("pitches"), "Pitches needs a roster to pitch");

  const subs = visibleSubViews(DESTINATIONS.people, business).map((s) => s.id);
  assert.deepEqual(subs, ["everyone", "access"]);

  const talent = visibleSubViews(DESTINATIONS.people, ctx()).map((s) => s.id);
  assert.deepEqual(talent, ["everyone", "talent", "bookable", "access", "applications"]);
  assert.ok(visibleDestinations(ctx()).map((d) => d.id).includes("pitches"));
});

test("Media needs the agency plan", () => {
  for (const plan of ["free", "website", "studio"] as const) {
    assert.ok(
      !visibleDestinations(ctx({ plan })).some((d) => d.id === "media"),
      `Media must be hidden on ${plan}`,
    );
  }
  for (const plan of ["agency", "network"] as const) {
    assert.ok(
      visibleDestinations(ctx({ plan })).some((d) => d.id === "media"),
      `Media must be visible on ${plan}`,
    );
  }
  assert.ok(planMeets("network", "agency"));
  assert.ok(!planMeets("studio", "agency"));
});

test("the plan ladder mirrors PLAN_META, which cannot be imported here", () => {
  const src = read("src/components/admin/shell/internal/state/fixtures.ts");
  const block = src.slice(src.indexOf("export const PLAN_META"));
  const expected: Record<string, number> = {
    free: 0,
    website: 1,
    studio: 2,
    agency: 3,
    network: 4,
  };
  for (const [plan, rank] of Object.entries(expected)) {
    const found = new RegExp(`^\\s*${plan}: \\{[^}]*rank: (\\d+)`, "m").exec(block);
    assert.ok(found, `PLAN_META has no ${plan} row any more`);
    assert.equal(
      Number(found[1]),
      rank,
      `PLAN_META.${plan}.rank moved; PLAN_RANK in destinations.ts must move with it`,
    );
  }
});

test("the tenant flags gate Reservations and Events, and nothing else", () => {
  const off = visibleDestinations(ctx({ takesReservations: false, runsEvents: false }))
    .map((d) => d.id);
  assert.ok(!off.includes("reservations"));
  assert.ok(!off.includes("events"));
  assert.ok(off.includes("calendar") && off.includes("orders"));
});

test("Payments needs the billing permission, and My work needs the professional hat", () => {
  const assistant = ctx({ canManageBilling: false, professional: false });
  const ids = visibleDestinations(assistant).map((d) => d.id);
  assert.ok(!ids.includes("payments"));
  assert.ok(!ids.includes("mywork"));
  const pro = visibleDestinations(ctx({ professional: true })).map((d) => d.id);
  assert.ok(pro.includes("mywork"));
});

// ── Grouping ─────────────────────────────────────────────────────────

test("POS is never in a sidebar group", () => {
  for (const context of [ctx(), ctx({ posEnabled: false }), ctx({ workspaceType: "business" })]) {
    const groups = sidebarGroups(context);
    assert.ok(!groups.some((g) => g.group === "pos"), "the pos group must never render");
    const ids = groups.flatMap((g) => g.destinations.map((d) => d.id));
    assert.ok(!ids.includes("pos"), "POS owns the whole screen; it is not a rail row");
  }
  assert.ok(!SIDEBAR_GROUP_ORDER.includes("pos"));
  // It is still a real destination with a real URL.
  assert.ok(isPosSegment("pos"));
  assert.ok(!isPosSegment("sales"));
  assert.equal(destinationHref(DESTINATIONS.pos, "/acme/admin"), "/acme/admin/pos");
});

test("groups come out in rail order, empty ones dropped", () => {
  const groups = sidebarGroups(ctx({ plan: "free", workspaceType: "business" }));
  const order = groups.map((g) => g.group);
  assert.deepEqual(order, [...order].sort(
    (a, b) => SIDEBAR_GROUP_ORDER.indexOf(a) - SIDEBAR_GROUP_ORDER.indexOf(b),
  ));
  assert.ok(groups.every((g) => g.destinations.length > 0));
  assert.ok(groups.some((g) => g.group === "settings"), "Settings is always there");
  assert.equal(DESTINATIONS.settings.pinned, true);
});

test("the mobile tabs are the top priorities, and never POS", () => {
  const tabs = mobileTabs(ctx(), 5).map((d) => d.id);
  assert.deepEqual(tabs, ["overview", "messages", "calendar", "appts", "orders"]);
  assert.ok(!mobileTabs(ctx(), 20).some((d) => d.chrome === "pos"));
  const priorities = mobileTabs(ctx(), 20).map((d) => d.mobilePriority ?? 0);
  assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b));
});

// ── Labels ───────────────────────────────────────────────────────────

test("the label follows the preset", () => {
  assert.equal(destinationLabel(DESTINATIONS.catalog, "cafe"), "Menu and catalog");
  assert.equal(destinationLabel(DESTINATIONS.catalog, "solo"), "Services");
  assert.equal(destinationLabel(DESTINATIONS.catalog, "hybrid"), "Catalog");
  assert.equal(destinationLabel(DESTINATIONS.people, "cafe"), "Team");
  assert.equal(destinationLabel(DESTINATIONS.people, "hybrid"), "People");
  assert.equal(destinationShortLabel(DESTINATIONS.people, "cafe"), "People");
  assert.equal(destinationShortLabel(DESTINATIONS.reviews, "cafe"), "Reviews");
});

test("no label uses an em dash, and every icon is a real shell icon", () => {
  const icons = read("src/components/admin/shell/internal/primitives/icons.tsx");
  const known = new Set(
    [...icons.matchAll(/^\s*\| "([a-z-]+)"/gm)].map((m) => m[1]),
  );
  assert.ok(known.size > 20, `expected the icon union, found ${known.size}`);
  for (const d of DESTINATION_LIST) {
    assert.ok(known.has(d.icon), `${d.id} uses icon "${d.icon}", which does not exist`);
    const labels = [d.label, d.shortLabel ?? "", ...Object.values(d.presetLabels ?? {})];
    for (const label of labels) {
      assert.ok(!label.includes("—"), `${d.id} label "${label}" uses an em dash`);
    }
    for (const sub of d.subViews ?? []) {
      assert.ok(!sub.label.includes("—"), `${d.id}/${sub.id} uses an em dash`);
    }
  }
});
