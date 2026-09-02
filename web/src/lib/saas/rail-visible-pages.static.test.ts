/**
 * rail-visible-pages.static.test.ts — WP1 (dashboard-rails, 2026-09-02).
 *
 * The workspace sidebar rail used to be a hardcoded literal that ignored
 * `state.visiblePages`, so a business workspace (workspace_type=business) still
 * saw Roster and Pitches and got bounced to Overview on click. WP1 made the
 * rail a PROJECTION of visiblePages. These guards pin that, and that the dead
 * Operations/Production pages and the admin-nav island stay deleted.
 *
 * Source-scan (not runtime) because the rail component is a `"use client"`
 * module that cannot be imported into a plain node test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { visibleWorkspacePages } from "./workspace-type";
import type { WorkspacePage } from "@/components/admin/shell/internal/state/types";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const TYPES = "src/components/admin/shell/internal/state/types.ts";
const FIXTURES = "src/components/admin/shell/internal/state/fixtures.ts";
const SHELL = "src/components/admin/shell/internal/page-modules/WorkspaceShell.tsx";

test("WorkspacePage union dropped operations/production and gained reviews/analytics", () => {
  const src = read(TYPES);
  const union = src.slice(src.indexOf("export type WorkspacePage"), src.indexOf("export type WorkspacePage") + 900);
  assert.ok(!/\|\s*"operations"/.test(union), "operations still in WorkspacePage");
  assert.ok(!/\|\s*"production"/.test(union), "production still in WorkspacePage");
  assert.ok(/\|\s*"reviews"/.test(union), "reviews missing from WorkspacePage");
  assert.ok(/\|\s*"analytics"/.test(union), "analytics missing from WorkspacePage");
});

test("WORKSPACE_PAGES nav list matches the union change", () => {
  const src = read(FIXTURES);
  const list = src.slice(src.indexOf("export const WORKSPACE_PAGES"), src.indexOf("export const WORKSPACE_PAGES") + 400);
  assert.ok(!list.includes('"operations"'), "operations still in WORKSPACE_PAGES");
  assert.ok(!list.includes('"production"'), "production still in WORKSPACE_PAGES");
  assert.ok(list.includes('"reviews"') && list.includes('"analytics"'), "reviews/analytics missing from WORKSPACE_PAGES");
});

test("the rail is a projection of state.visiblePages, not a hardcoded literal", () => {
  const src = read(SHELL);
  assert.ok(src.includes("buildSidebarGroups(state.visiblePages"), "rail must be built from state.visiblePages");
  assert.ok(src.includes('label: "Sell and grow"'), '"Grow" group was not renamed to "Sell and grow"');
  assert.ok(!src.includes('case "operations"'), "operations router case still present");
  assert.ok(!src.includes('case "production"'), "production router case still present");
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
