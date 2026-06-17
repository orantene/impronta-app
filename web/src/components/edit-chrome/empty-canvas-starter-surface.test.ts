/**
 * ONB-1 — unit tests for the per-surface starter-set selection that powers the
 * surface-parameterized EmptyCanvasStarter.
 *
 * Runs via `npx tsx --test` (Node test runner). No DOM — these are pure
 * functions over the design registry.
 *
 * THE CONTRACT THIS GUARDS. The starter picker is built ONCE and adopted by
 * every empty editable surface; the only per-surface difference is WHICH
 * starters are offered, and that difference is a pure function of the surface
 * (resolved from `surfaceKind`, a config value) — NOT a `surfaceKind === ...`
 * branch in the component. These tests pin:
 *   1. every surfaceKind maps to a starter surface (closed mapping),
 *   2. talent surfaces show talent+both, workspace surfaces show workspace+both,
 *   3. the filter applied to the REAL registry yields the right, non-empty set
 *      for each surface, and an undefined surface (legacy homepage) keeps ALL.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import { BUILDER_SURFACE_KINDS } from "@/lib/site-admin/builder-core/surface-kind";
import {
  starterSurfaceForKind,
  targetsForStarterSurface,
  starterSummariesForSurface,
  type EmptyCanvasStarterSurface,
} from "./empty-canvas-starter-surface";

test("every builder surfaceKind maps to a starter surface (closed mapping)", () => {
  for (const kind of BUILDER_SURFACE_KINDS) {
    const surface = starterSurfaceForKind(kind);
    assert.ok(
      surface === "talent" || surface === "workspace" || surface === "talent-site",
      `surfaceKind ${kind} resolved to an unexpected starter surface: ${surface}`,
    );
  }
});

test("talent_page resolves to the talent starter surface", () => {
  assert.equal(starterSurfaceForKind("talent_page"), "talent");
});

test("storefront / shell / lab surfaceKinds resolve to the workspace surface", () => {
  for (const kind of ["homepage", "cms_page", "site_shell", "platform_lab"] as const) {
    assert.equal(starterSurfaceForKind(kind), "workspace");
  }
});

test("targets: talent + talent-site offer talent|both; workspace offers workspace|both", () => {
  assert.deepEqual([...targetsForStarterSurface("talent")].sort(), ["both", "talent"]);
  assert.deepEqual(
    [...targetsForStarterSurface("talent-site")].sort(),
    ["both", "talent"],
  );
  assert.deepEqual(
    [...targetsForStarterSurface("workspace")].sort(),
    ["both", "workspace"],
  );
});

test("filter on the real registry yields the right, non-empty set per surface", () => {
  const surfaces: EmptyCanvasStarterSurface[] = ["talent", "talent-site", "workspace"];
  for (const surface of surfaces) {
    const allowed = new Set(targetsForStarterSurface(surface));
    const filtered = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, surface);
    assert.ok(
      filtered.length > 0,
      `surface ${surface} must offer at least one starter design`,
    );
    // Every offered design's target is allowed for this surface…
    for (const summary of filtered) {
      assert.ok(
        allowed.has(summary.target),
        `surface ${surface} offered design ${summary.id} (target=${summary.target}) outside its allowed set`,
      );
    }
    // …and no allowed design is dropped (filter is exactly the allowed subset).
    const expected = PAGE_DESIGN_SUMMARIES.filter((s) => allowed.has(s.target));
    assert.equal(filtered.length, expected.length);
  }
});

test("a single-subject (talent) surface never offers an agency/workspace-only home", () => {
  const talentSet = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "talent");
  assert.ok(
    talentSet.every((s) => s.target !== "workspace"),
    "talent surface leaked a workspace-only design",
  );
  // And an agency/workspace surface never offers a talent-only single-subject page.
  const workspaceSet = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "workspace");
  assert.ok(
    workspaceSet.every((s) => s.target !== "talent"),
    "workspace surface leaked a talent-only design",
  );
});

test("undefined surface (legacy homepage mount) keeps the FULL design set", () => {
  const all = starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, undefined);
  assert.equal(all.length, PAGE_DESIGN_SUMMARIES.length);
});

test("the union of talent + workspace sets covers every design (no orphan target)", () => {
  const talentIds = new Set(
    starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "talent").map((s) => s.id),
  );
  const workspaceIds = new Set(
    starterSummariesForSurface(PAGE_DESIGN_SUMMARIES, "workspace").map((s) => s.id),
  );
  for (const summary of PAGE_DESIGN_SUMMARIES) {
    assert.ok(
      talentIds.has(summary.id) || workspaceIds.has(summary.id),
      `design ${summary.id} (target=${summary.target}) is offered on NO surface`,
    );
  }
});
