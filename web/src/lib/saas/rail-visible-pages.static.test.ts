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
import { visibleWorkspacePages } from "./workspace-type";
import {
  DESTINATION_GROUP_LABELS,
  DESTINATION_LIST,
  SIDEBAR_GROUP_ORDER,
} from "@/lib/workspace/destinations";
import { navWorkspacePages } from "@/lib/workspace/page-ids";
import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const TYPES = "src/components/admin/shell/internal/state/types.ts";
const FIXTURES = "src/components/admin/shell/internal/state/fixtures.ts";
const SHELL = "src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx";
const NAV_HOOK = "src/components/admin/shell/internal/page-modules/workspace-nav.ts";
const NAV_GROUPS = "src/components/admin/shell/internal/page-modules/workspace-nav-groups.ts";

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

test("visibleWorkspacePages hides Roster and Pitches for a business workspace", () => {
  const pages: WorkspacePage[] = ["overview", "messages", "roster", "pitches", "reviews", "analytics", "settings"];
  const business = visibleWorkspacePages("business", pages);
  assert.ok(!business.includes("roster"), "business must not see roster");
  assert.ok(!business.includes("pitches"), "business must not see pitches");
  assert.deepEqual(visibleWorkspacePages("talent", pages), pages, "talent sees every page verbatim");
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
