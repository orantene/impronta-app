/**
 * rail-visible-pages.static.test.ts — WP1 (dashboard-rails, 2026-09-02),
 * re-pointed at the destination registry by T2 (2026-09-09).
 *
 * The workspace sidebar rail used to be a hardcoded literal that ignored
 * `state.visiblePages`, so a business workspace (workspace_type=business) still
 * saw Roster and Pitches and got bounced to Overview on click. WP1 made the
 * rail a PROJECTION of visiblePages. T2 made it a projection of
 * `lib/workspace/destinations.ts` AND visiblePages — the registry decides which
 * destinations exist and how they group, visiblePages decides which of them
 * this workspace can actually open, and a row is drawn only where both agree.
 *
 * The intent these guards carry is unchanged and must stay: THE RAIL CANNOT
 * SILENTLY LOSE A PAGE, and it cannot silently grow a row that bounces. What
 * changed is where the truth lives, so the assertions moved with it — the group
 * label literal ("Sell and grow", then "Sell") is no longer in the shell at all,
 * because the shell no longer names a group.
 *
 * Source-scan (not runtime) because the rail component is a `"use client"`
 * module that cannot be imported into a plain node test. The registry itself is
 * pure, so the parts of this that CAN run do run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { visibleWorkspacePages } from "./workspace-type";
import {
  DESTINATION_GROUP_LABELS,
  DESTINATION_LIST,
  SIDEBAR_GROUP_ORDER,
  destinationHref,
  liveRouteSegment,
  resolveDestination,
  subViewHref,
  DESTINATIONS,
} from "@/lib/workspace/destinations";
import {
  liveWorkspacePage,
  navWorkspacePages,
  resolveWorkspacePageId,
} from "@/lib/workspace/page-ids";
import { pathIsCanonical } from "@/components/admin/shell/canonical-routes";
import { RAIL_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-rail";
import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * Source with its prose removed: block comments and whole-line `//` / ` *`
 * comments. A guard that forbids a construct must forbid the CODE, not a
 * sentence explaining why the code is gone — a comment naming the field it
 * warns about would otherwise fail the very check it documents.
 */
const codeOnly = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");

const TYPES = "src/components/admin/shell/internal/state/types.ts";
const FIXTURES = "src/components/admin/shell/internal/state/fixtures.ts";
const SHELL = "src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx";
const NAV_HOOK = "src/components/admin/shell/internal/page-modules/workspace-nav.ts";
const NAV_GROUPS = "src/components/admin/shell/internal/page-modules/workspace-nav-groups.ts";
const IDENTITY_LOADER = "src/app/(workspace)/[tenantSlug]/_layout-identity.ts";
const DATA_BRIDGE = "src/components/admin/shell/internal/data-bridge.ts";
const DASHBOARD_I18N = "src/components/admin/shell/internal/dashboard-i18n.ts";
const ADMIN_ROUTES = "src/app/(workspace)/[tenantSlug]/admin";

test("WorkspacePage is the registry's ids plus its aliases, nothing hand-listed", () => {
  const src = read(TYPES);
  assert.ok(
    /export type WorkspacePage = DestinationId \| LegacyWorkspacePage;/.test(src),
    "WorkspacePage must be derived from the registry's DestinationId",
  );
  // The original claim, made against the thing that now defines the union. A
  // literal member list in types.ts was what let a page exist in the union and
  // nowhere else; deriving it makes a new destination a COMPILE error in
  // PAGE_META instead of a silent gap.
  const ids = DESTINATION_LIST.map((d) => d.id as string);
  assert.ok(!ids.includes("operations"), "operations is back in the registry");
  assert.ok(!ids.includes("production"), "production is back in the registry");
  assert.ok(ids.includes("reviews"), "reviews missing from the registry");
  assert.ok(ids.includes("analytics"), "analytics missing from the registry");
  // The legacy aliases still type-check, so no live admin URL falls off the map.
  const legacy = src.slice(src.indexOf("export type LegacyWorkspacePage"));
  for (const alias of DESTINATION_LIST.flatMap((d) => d.aliases)) {
    if (ids.includes(alias)) continue; // "overview" is both an id and its own alias
    assert.ok(
      legacy.includes(`| "${alias}"`),
      `${alias} is a live URL segment with no place in WorkspacePage`,
    );
  }
});

test("WORKSPACE_PAGES is the registry's built destinations, not a literal", () => {
  const src = read(FIXTURES);
  assert.ok(
    /export const WORKSPACE_PAGES: WorkspacePage\[\] = navWorkspacePages\(\);/.test(src),
    "WORKSPACE_PAGES must be a projection of the destination registry",
  );
  // The same list, computed here from the registry. The dead pages stay dead
  // and the reputation/analytics surfaces stay present — the original claim,
  // now made against the thing that produces the list.
  const pages = navWorkspacePages();
  assert.ok(!pages.includes("operations" as WorkspacePage), "operations is back");
  assert.ok(!pages.includes("production" as WorkspacePage), "production is back");
  for (const page of ["reviews", "analytics"] as WorkspacePage[]) {
    assert.ok(pages.includes(page), `${page} missing from WORKSPACE_PAGES`);
  }
});

test("THE RAIL CANNOT SILENTLY LOSE A PAGE: every built destination has a nav page", () => {
  // The original intent, re-expressed. A destination the registry says is built
  // must appear in the nav page list, or it is a screen with no door. The
  // reverse also holds: nothing may be in the list that is not a built
  // destination, or the rail draws a row onto a page that does not exist.
  const pages = new Set(navWorkspacePages());
  const built = DESTINATION_LIST.filter((d) => d.built);
  assert.ok(built.length >= 20, `expected the registry to be populated, found ${built.length}`);
  assert.equal(
    pages.size,
    built.length,
    `${built.length} built destinations produced ${pages.size} nav pages`,
  );
});

test("the rail is a projection of the registry, not a hardcoded literal", () => {
  const src = read(SHELL);
  assert.ok(src.includes("useWorkspaceNav()"), "rail must be built from the nav hook");
  assert.ok(src.includes("groups.map(renderItem)") || src.includes("group.items.map(renderItem)"),
    "rail must map over the hook's groups");
  assert.ok(src.includes("pinned.map(renderItem)"), "the pinned foot must come from the hook");
  // The five structures the registry replaced. Any one of them coming back is a
  // second list, which is the failure this consolidation exists to end.
  for (const dead of [
    /const SIDEBAR_GROUP_TEMPLATE/,
    /function buildSidebarGroups/,
    /const SIDEBAR_ICON/,
    /const subItemsFor =/,
    /const pageLabel =/,
  ]) {
    assert.ok(!dead.test(src), `${dead.source} is back in the shell`);
  }
  assert.ok(!src.includes('case "operations"'), "operations router case still present");
  assert.ok(!src.includes('case "production"'), "production router case still present");
});

test("the point of sale is never a sidebar row", () => {
  // The POS replaces the whole admin chrome and is entered from the centred
  // switch in the top bar. The registry drops its group from the rail; the
  // shell must not put it back by hand, which is what the pinned
  // `visiblePages.includes("pos")` row did.
  const src = read(SHELL);
  assert.ok(!/renderItem\("pos"\)/.test(src), "a pinned POS row is back in the sidebar");
  assert.ok(!src.includes('id: "pos-catalog"'), "the POS sub-rail is back in the sidebar");
  assert.ok(
    !SIDEBAR_GROUP_ORDER.includes("pos"),
    "the registry must keep the pos group out of the rail order",
  );
});

test("group labels and their order come from the registry", () => {
  // Six groups plus a pinned Settings. The shell names none of them: it reads
  // `group.label`, so the only place a rename can happen is the registry.
  assert.deepEqual(
    [...SIDEBAR_GROUP_ORDER],
    ["home", "operate", "sell", "relationships", "money", "grow", "settings"],
    "rail group order changed",
  );
  assert.equal(DESTINATION_GROUP_LABELS.home, null, "Overview renders without a heading");
  assert.equal(DESTINATION_GROUP_LABELS.settings, null, "Settings is pinned, not a headed group");
  for (const group of ["operate", "sell", "relationships", "money", "grow"] as const) {
    assert.equal(
      typeof DESTINATION_GROUP_LABELS[group],
      "string",
      `${group} lost its heading`,
    );
  }
  const shell = read(SHELL);
  assert.ok(!/label: "(Operate|Sell|Grow|Manage|People & Spaces)"/.test(shell),
    "a group label literal is back in the shell");
});

test("the nav hook reads the shell's own state and the registry, nothing else", () => {
  const hook = read(NAV_HOOK);
  const groups = read(NAV_GROUPS);
  assert.ok(hook.includes("useAdminShell()"), "the hook must read the shell state");
  assert.ok(hook.includes("state.visiblePages"), "the hook must honour visiblePages");
  assert.ok(hook.includes("sidebarGroups") || groups.includes("sidebarGroups"),
    "grouping must come from the registry");
  // Sub-item hrefs are built from the workspace base path. A hardcoded slug in
  // shell navigation is what admin-href-invariant.static.test.ts forbids.
  assert.ok(groups.includes("input.adminBase"), "sub-item hrefs must use the admin base path");
  assert.ok(!/\$\{[^}]*slug[^}]*\}\/admin/i.test(groups), "a tenant slug is hardcoded in the rail");
});

test("visibleWorkspacePages hides Pitches — and NOT People — for a business workspace", () => {
  const pages: WorkspacePage[] = ["overview", "messages", "people", "roster", "pitches", "reviews", "analytics", "settings"];
  const business = visibleWorkspacePages("business", pages);
  assert.ok(!business.includes("pitches"), "business must not see pitches");
  // `people` is People's live page (it was `roster` until the surface got its
  // own route). Hiding it dropped the People row from the rail of every
  // business workspace and clamped the page to Overview — a surface with no
  // door, not a surface that does not apply. A restaurant has staff; what it
  // cannot open is the roster's representation queues, and those are refused by
  // `assertRosterWorkspace` on the routes themselves.
  assert.ok(business.includes("people"), "business lost its People row again");
  // The legacy address must stay open too: /admin/roster is a live URL.
  assert.ok(business.includes("roster"), "business lost the roster's own address");
  assert.deepEqual(visibleWorkspacePages("talent", pages), pages, "talent sees every page verbatim");
});

test("the roster's talent-only routes still refuse a business workspace", () => {
  // The other half of the rule above. People is visible to everyone BECAUSE the
  // refusal lives on the routes that need it — if these guards go, hiding the
  // page id is the only thing standing between a business workspace and a
  // roster queue, and this test is what says so.
  for (const route of ["new", "applications", "registration", "rates"]) {
    const src = read(`${ADMIN_ROUTES}/roster/${route}/page.tsx`);
    assert.ok(
      /await assertRosterWorkspace\(/.test(src),
      `/admin/roster/${route} no longer refuses a business workspace`,
    );
  }
  // And the rail agrees with them: those three children are talent-only in the
  // registry, so a business workspace is never offered a link into a 404.
  const gated = (DESTINATIONS.people.subViews ?? []).filter(
    (s) => s.requires?.workspaceType === "talent",
  );
  assert.deepEqual(
    gated.map((s) => s.segment),
    ["applications", "registration", "rates"],
    "the rail's talent-only People children drifted from the routes that 404",
  );
});

test("the rail's preset comes from the tenant bridge, never from a literal", () => {
  // THE REGRESSION THIS EXISTS FOR. The hook held `bridgeTenantIdentity` and
  // still called the preset derivation with `industryPreset: undefined`, so
  // every workspace on the platform resolved to `hybrid`: no tenant ever saw
  // "Menu and catalog", "Team" or "Services", and a restaurant's rail row went
  // BACKWARDS from "Menu" to "Catalog". The runtime proof is in
  // workspace-nav-groups.test (bridge row → drawn label); this is the half a
  // pure test cannot see — that the shell hands over the row it is holding.
  const hook = codeOnly(read(NAV_HOOK));
  assert.ok(hook.includes("workspaceNavContext("), "the hook must build its context in one place");
  assert.ok(
    /tenantIdentity:\s*bridgeTenantIdentity/.test(hook),
    "the hook must pass the tenant identity bridge, whole",
  );
  assert.ok(
    !/industryPreset\s*:/.test(hook),
    "the hook is naming the preset field again instead of passing the bridge",
  );
  assert.ok(
    !/\bpreset\s*:/.test(hook),
    "the hook is building the nav preset by hand again",
  );
});

test("the identity bridge carries the industry preset from the agencies row", () => {
  // The other end of the same chain: the field has to be READ and it has to be
  // DECLARED, or the hook passes a bridge that never carries it.
  const loader = read(IDENTITY_LOADER);
  assert.ok(
    /industryPreset:\s*\n?\s*typeof data\.settings\?\.industry_preset === "string"/.test(loader),
    "loadTenantIdentity no longer reads settings.industry_preset onto the payload",
  );
  assert.ok(
    /industryPreset: string \| null;/.test(loader),
    "TenantIdentityPayload no longer declares industryPreset",
  );
  assert.ok(
    /industryPreset\?: string \| null;/.test(read(DATA_BRIDGE)),
    "the client data bridge no longer declares industryPreset",
  );
});

test("every registry sub-view names a route that exists today", () => {
  // A child is drawn under the row the operator just opened. One that 404s is
  // worse than an absent one, and nothing else in the build can see it: these
  // are data, not imports.
  //
  // The path checked here is the one `subViewHref` builds, taken from the same
  // helper the rail calls — `subViewHref` — rather than re-derived. An earlier
  // cut of this test re-implemented the `under` branch by hand, so a sub-view
  // with an `adminPath` would have been checked at an address no link points
  // to, and the guard would have passed on a 404.
  const missing: string[] = [];
  for (const destination of DESTINATION_LIST) {
    for (const view of destination.subViews ?? []) {
      const href = subViewHref(destination, view, "/admin");
      assert.notEqual(
        href,
        null,
        `${destination.id}/${view.id} hangs off a destination with no route at all`,
      );
      // "/admin/roster/rates" → ["roster","rates"]; "/admin" → [].
      const under = href!.split("?")[0]!.replace(/^\/admin\/?/, "");
      const parts = [ADMIN_ROUTES, ...under.split("/")].filter((p) => p !== "");
      const file = join(root, ...parts, "page.tsx");
      if (!existsSync(file)) missing.push(`${destination.id}/${view.id} → ${file}`);
    }
  }
  assert.deepEqual(missing, [], `sub-views pointing at nothing:\n${missing.join("\n")}`);
});

test("THE PEOPLE ROW OPENS THE PEOPLE SURFACE, from the rail and from the phone", () => {
  // THE DEFECT THIS EXISTS FOR. People carried `fallbackSegment: "roster"`, so
  // `liveRouteSegment` answered "roster" and EVERY link builder in the app —
  // the rail row, the mobile tab bar, `setPage`, the page router — sent an
  // operator to the old roster SPA. The nine screens at /admin/people were
  // reachable only by typing the URL: an engine with no door.
  const people = DESTINATIONS.people;
  assert.equal(liveRouteSegment(people), "people", "People's live route left /admin/people");
  assert.equal(
    people.fallbackSegment,
    undefined,
    "People has a fallback segment again, so every link points away from its surface",
  );
  // The rail row and the mobile tab both call this.
  assert.equal(destinationHref(people, "/impronta/admin"), "/impronta/admin/people");
  assert.equal(destinationHref(people, "/admin"), "/admin/people", "branded host");
  // `setPage` maps a page id to a segment through here, and the server layout
  // resolves the URL through the same function.
  assert.equal(resolveWorkspacePageId("people"), "people");
  assert.equal(liveWorkspacePage(people), "people");
  // The landing child is the surface itself, not a second address for it.
  const everyone = (people.subViews ?? []).find((s) => s.id === "everyone");
  assert.ok(everyone, "People lost its landing child");
  assert.equal(subViewHref(people, everyone!, "/impronta/admin"), "/impronta/admin/people");
  // And the shell yields to the real page instead of stacking the SPA on it.
  assert.equal(pathIsCanonical("/impronta/admin/people"), true);
  assert.equal(pathIsCanonical("/admin/people"), true, "branded host");
});

test("the roster keeps its own address and its own body", () => {
  // The other half. `roster` is now only an alias of People, and an alias that
  // re-pointed the SPA body would have left /admin/roster painting People and
  // the roster list with no address at all.
  assert.equal(resolveWorkspacePageId("roster"), "roster", "the roster SPA lost its body");
  assert.equal(
    pathIsCanonical("/impronta/admin/roster"),
    false,
    "/admin/roster must go on rendering the roster SPA",
  );
  // The rail still lights the People row there, because the alias resolves.
  assert.equal(resolveDestination("roster")?.id, "people");
});

test("every registry label the rail can draw has a Spanish row", () => {
  // The rail renders English literals through `copy.t()`, which is keyed by the
  // English string. A registry label with no ES_TEXT row renders in English on
  // a Spanish workspace, and nothing else notices.
  //
  // THE TABLE IS ASSEMBLED, SO THE CHECK MUST BE TOO. `ES_TEXT` is a literal
  // SPREAD OVER `RAIL_ES_TEXT`, which itself spreads `LINKS_ES_TEXT`. Scanning
  // only `dashboard-i18n.ts` source therefore missed every row that lives in a
  // sibling module — a guard reading one of several trees, which is how a row
  // that IS present reads as missing and, worse, how the extraction those
  // modules exist for gets blocked by its own guard. The inline literal still
  // has to be scanned (the file is `"use client"` and cannot be imported into a
  // node test), but the plain sibling modules can be imported, so they are.
  const src = read(DASHBOARD_I18N);
  const table = src.slice(src.indexOf("const ES_TEXT"));
  const translated = new Set([
    ...[...table.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*"/gm)].map((m) => m[1]),
    ...Object.keys(RAIL_ES_TEXT),
  ]);
  assert.ok(translated.size > 500, `expected the ES table, found ${translated.size} rows`);
  assert.ok(
    src.includes("...RAIL_ES_TEXT,"),
    "ES_TEXT no longer spreads RAIL_ES_TEXT, so the rows this test counts are not in the table",
  );
  const wanted = new Set<string>();
  for (const destination of DESTINATION_LIST) {
    if (!destination.built) continue;
    wanted.add(destination.label);
    for (const label of Object.values(destination.presetLabels ?? {})) wanted.add(label);
    for (const view of destination.subViews ?? []) wanted.add(view.label);
  }
  for (const group of SIDEBAR_GROUP_ORDER) {
    const label = DESTINATION_GROUP_LABELS[group];
    if (label !== null) wanted.add(label);
  }
  assert.deepEqual(
    [...wanted].filter((label) => !translated.has(label)),
    [],
    "a rail label has no Spanish",
  );
});

test("no source file imports the deleted admin-nav island", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next") continue;
        walk(p);
      } else if (/\.tsx?$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        if (/from\s+["']@\/lib\/admin\/admin-nav(-match)?["']/.test(src)) offenders.push(p);
      }
    }
  };
  walk(join(root, "src"));
  assert.deepEqual(offenders, [], `admin-nav island resurrected in: ${offenders.join(", ")}`);
});
