/**
 * surface-matrix.test.ts — X1 (read-only 4-surface matrix projection).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/surface-matrix.test.ts
 *
 * Covers the PURE derivation `deriveSurfaceMatrix`, which projects the existing
 * 2-toggle overlay state (talent_enabled / workspace_enabled, surfaced as
 * talentVisible / workspaceVisible) onto the FOUR real builder surfaces. The
 * load-bearing assertion is the LOSSY mapping the audit found: the talent
 * Max-SITE-SHELL is governed by `workspace_enabled` (because
 * `buildSiteShellBuilderConfig` hardcodes surfaceTarget:'workspace'), NOT by the
 * Talent-Max toggle — so three of the four surfaces collapse onto one toggle.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogAdminView,
  deriveSurfaceMatrix,
  type CatalogOverlayMap,
  type CatalogOverlayRow,
  type CatalogSurfaceKey,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";

function item(over: Partial<AddGalleryItem> = {}): AddGalleryItem {
  return {
    id: "el-button",
    label: "Button",
    description: "",
    tab: "elements",
    category: "buttons",
    icon: "buttons",
    previewType: "icon-card",
    itemKind: "static",
    insertMethod: "nativeNode",
    dragSupported: true,
    availability: "available",
    sourceType: "native-freeform",
    targetContext: "both",
    ...over,
  };
}

function overlay(over: Partial<CatalogOverlayRow> = {}): CatalogOverlayRow {
  return {
    item_ref: "el-button",
    source: "code",
    talent_enabled: true,
    workspace_enabled: true,
    label_override: null,
    icon_override: null,
    category_override: null,
    required_plan_override: null,
    availability_override: null,
    ...over,
  };
}

/** Read one cell's visibility by surface key. */
function visByKey(
  cells: ReturnType<typeof deriveSurfaceMatrix>,
): Record<CatalogSurfaceKey, boolean> {
  return cells.reduce(
    (acc, c) => {
      acc[c.key] = c.visible;
      return acc;
    },
    {} as Record<CatalogSurfaceKey, boolean>,
  );
}

test("deriveSurfaceMatrix returns the four real surfaces in order", () => {
  const cells = deriveSurfaceMatrix({ talentVisible: true, workspaceVisible: true });
  assert.deepEqual(
    cells.map((c) => c.key),
    ["talent_profile", "talent_shell", "workspace_page", "workspace_shell"],
  );
});

test("all-visible: every surface shows when both toggles are on", () => {
  const v = visByKey(
    deriveSurfaceMatrix({ talentVisible: true, workspaceVisible: true }),
  );
  assert.equal(v.talent_profile, true);
  assert.equal(v.talent_shell, true);
  assert.equal(v.workspace_page, true);
  assert.equal(v.workspace_shell, true);
});

test("SURPRISE: hiding from Workspace also hides the talent SHELL (not the profile)", () => {
  // workspace_enabled=false → workspaceVisible=false. The talent profile follows
  // talent_enabled (still visible); the talent SHELL follows workspace_enabled, so
  // it goes dark together with the workspace surfaces.
  const v = visByKey(
    deriveSurfaceMatrix({ talentVisible: true, workspaceVisible: false }),
  );
  assert.equal(v.talent_profile, true, "talent profile follows talent_enabled");
  assert.equal(v.talent_shell, false, "talent SHELL follows workspace_enabled");
  assert.equal(v.workspace_page, false);
  assert.equal(v.workspace_shell, false);
});

test("hiding from Talent-Max hides ONLY the talent profile", () => {
  const v = visByKey(
    deriveSurfaceMatrix({ talentVisible: false, workspaceVisible: true }),
  );
  assert.equal(v.talent_profile, false);
  assert.equal(v.talent_shell, true, "talent shell is NOT governed by Talent-Max");
  assert.equal(v.workspace_page, true);
  assert.equal(v.workspace_shell, true);
});

test("governedBy exposes the lossy 3-on-1 toggle collapse", () => {
  const cells = deriveSurfaceMatrix({ talentVisible: true, workspaceVisible: true });
  const byKey = Object.fromEntries(cells.map((c) => [c.key, c.governedBy]));
  assert.equal(byKey.talent_profile, "talent_enabled");
  assert.equal(byKey.talent_shell, "workspace_enabled");
  assert.equal(byKey.workspace_page, "workspace_enabled");
  assert.equal(byKey.workspace_shell, "workspace_enabled");
  const workspaceGoverned = cells.filter(
    (c) => c.governedBy === "workspace_enabled",
  );
  assert.equal(workspaceGoverned.length, 3, "3 of 4 surfaces ride one toggle");
});

test("X4: composes over buildCatalogAdminView state (overlay → real 4-surface matrix)", () => {
  // X4 — `buildCatalogAdminView` now emits a per-surface `surfaceVisible` map, so
  // `deriveSurfaceMatrix(view)` reports the REAL independent toggles. A legacy
  // overlay with only `workspace_enabled:false` (no explicit per-surface columns)
  // falls back losslessly: talent_* ⇐ talent_enabled (true), workspace_* ⇐
  // workspace_enabled (false). The talent SHELL is NO LONGER chained to workspace.
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({ workspace_enabled: false }),
  };
  const [view] = buildCatalogAdminView([item()], overlays);
  const v = visByKey(deriveSurfaceMatrix(view));
  assert.equal(v.talent_profile, true);
  assert.equal(v.talent_shell, true, "X4: talent shell follows the TALENT value now");
  assert.equal(v.workspace_page, false);
  assert.equal(v.workspace_shell, false);
});

test("X4: independent per-surface columns drive the matrix exactly", () => {
  // An overlay carrying explicit X4 columns must be honored verbatim — each
  // surface independent, no 2-toggle fallback.
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({
      talent_profile_enabled: true,
      talent_shell_enabled: false,
      workspace_page_enabled: true,
      workspace_shell_enabled: false,
    }),
  };
  const [view] = buildCatalogAdminView([item()], overlays);
  const v = visByKey(deriveSurfaceMatrix(view));
  assert.equal(v.talent_profile, true);
  assert.equal(v.talent_shell, false);
  assert.equal(v.workspace_page, true);
  assert.equal(v.workspace_shell, false);
});

test("X4: a talent-only row shows on BOTH talent surfaces, hidden on workspace ones", () => {
  const [view] = buildCatalogAdminView([item({ targetContext: "talent" })], {});
  const v = visByKey(deriveSurfaceMatrix(view));
  // talent-targeted → both TALENT surfaces show (profile + shell); the workspace
  // surfaces stay hidden by the target gate. Pre-X4 the talent shell was wrongly
  // dark here because it rode the workspace toggle — this is the bug X4 fixes.
  assert.equal(v.talent_profile, true);
  assert.equal(v.talent_shell, true, "X4: talent shell is a TALENT surface now");
  assert.equal(v.workspace_page, false);
  assert.equal(v.workspace_shell, false);
});

test("availability_override 'hidden' blacks out all four surfaces", () => {
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({ availability_override: "hidden" }),
  };
  const [view] = buildCatalogAdminView([item()], overlays);
  const v = visByKey(deriveSurfaceMatrix(view));
  assert.equal(v.talent_profile, false);
  assert.equal(v.talent_shell, false);
  assert.equal(v.workspace_page, false);
  assert.equal(v.workspace_shell, false);
});
