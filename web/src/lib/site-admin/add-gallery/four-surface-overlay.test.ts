/**
 * four-surface-overlay.test.ts — X4 (true 4-surface overlay matrix).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/four-surface-overlay.test.ts
 *
 * Covers the PURE core X4 adds on top of the X1 read-only projection:
 *   1. legacyToFourSurface — the LOSSLESS 2→4 forward migration (the same mapping
 *      the SQL backfill implements). talent_* ⇐ talent_enabled, workspace_* ⇐
 *      workspace_enabled, missing ⇒ true.
 *   2. surfaceEnabledForRow — honors the explicit per-surface column when present,
 *      else falls back losslessly to the legacy pair; null row ⇒ enabled.
 *   3. applyCatalogOverlay with ctx.surfaceKey — precise per-surface subtraction
 *      (each of the four surfaces independent), with back-compat to the legacy
 *      surfaceTarget path when no surfaceKey is supplied.
 *   4. deriveSurfaceMatrix over a real `surfaceVisible` map — each surface reports
 *      its OWN column (the lossy 3-on-1 collapse is gone).
 *
 * Imports come DIRECTLY from `registry-db-merge.ts`, never the add-gallery barrel
 * (the barrel drags a `.css` side-effect into the test graph and breaks tsx).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCatalogOverlay,
  buildCatalogAdminView,
  deriveSurfaceMatrix,
  legacyToFourSurface,
  surfaceEnabledForRow,
  surfaceKeyToTarget,
  CATALOG_SURFACE_KEYS,
  type CatalogOverlayMap,
  type CatalogOverlayRow,
  type CatalogSurfaceKey,
  type GalleryMergeContext,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";
import type { BuilderGalleryPolicy } from "@/lib/site-admin/builder-core/config";

// ── fixtures ────────────────────────────────────────────────────────────────

function item(over: Partial<AddGalleryItem> = {}): AddGalleryItem {
  return {
    id: "el-button",
    label: "Button",
    description: "",
    tab: "blocks",
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

const POLICY: BuilderGalleryPolicy = {
    allowedTabs: ["blocks", "designs", "data", "page_templates"],
  allowDbTemplates: true,
};

function ctxFor(surfaceKey: CatalogSurfaceKey): GalleryMergeContext {
  return {
    galleryPolicy: POLICY,
    surfaceTarget: surfaceKeyToTarget(surfaceKey),
    surfaceKey,
    plan: "free",
    talentTier: "talent_portfolio",
  };
}

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

// ── 1. legacyToFourSurface — the lossless 2→4 forward migration ───────────────

test("legacyToFourSurface: talent_* ⇐ talent_enabled, workspace_* ⇐ workspace_enabled", () => {
  assert.deepEqual(
    legacyToFourSurface({ talent_enabled: true, workspace_enabled: false }),
    {
      talent_profile: true,
      talent_shell: true,
      workspace_page: false,
      workspace_shell: false,
    },
  );
  assert.deepEqual(
    legacyToFourSurface({ talent_enabled: false, workspace_enabled: true }),
    {
      talent_profile: false,
      talent_shell: false,
      workspace_page: true,
      workspace_shell: true,
    },
  );
});

test("legacyToFourSurface: missing legacy values default to true (COALESCE(...,true))", () => {
  assert.deepEqual(legacyToFourSurface({}), {
    talent_profile: true,
    talent_shell: true,
    workspace_page: true,
    workspace_shell: true,
  });
});

// ── 2. surfaceEnabledForRow — explicit column wins, legacy fallback otherwise ──

test("surfaceEnabledForRow: null/absent overlay ⇒ enabled on every surface", () => {
  for (const key of CATALOG_SURFACE_KEYS) {
    assert.equal(surfaceEnabledForRow(null, key), true);
    assert.equal(surfaceEnabledForRow(undefined, key), true);
  }
});

test("surfaceEnabledForRow: explicit per-surface column is honored verbatim", () => {
  const ov = overlay({
    // legacy pair says talent off / workspace on …
    talent_enabled: false,
    workspace_enabled: true,
    // … but the explicit X4 columns OVERRIDE the legacy fallback.
    talent_profile_enabled: true,
    talent_shell_enabled: false,
    workspace_page_enabled: false,
    workspace_shell_enabled: true,
  });
  assert.equal(surfaceEnabledForRow(ov, "talent_profile"), true);
  assert.equal(surfaceEnabledForRow(ov, "talent_shell"), false);
  assert.equal(surfaceEnabledForRow(ov, "workspace_page"), false);
  assert.equal(surfaceEnabledForRow(ov, "workspace_shell"), true);
});

test("surfaceEnabledForRow: absent X4 columns fall back losslessly to the legacy pair", () => {
  const ov = overlay({ talent_enabled: true, workspace_enabled: false });
  assert.equal(surfaceEnabledForRow(ov, "talent_profile"), true);
  assert.equal(surfaceEnabledForRow(ov, "talent_shell"), true); // ⇐ talent, NOT workspace
  assert.equal(surfaceEnabledForRow(ov, "workspace_page"), false);
  assert.equal(surfaceEnabledForRow(ov, "workspace_shell"), false);
});

// ── 3. applyCatalogOverlay honors all four surfaces via ctx.surfaceKey ─────────

test("applyCatalogOverlay: per-surface subtraction keys off the precise surfaceKey", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ talent_shell_enabled: false }),
  };
  // Only the talent SHELL surface drops this item; the other three keep it.
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("talent_shell")).length, 0);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("talent_profile")).length, 1);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("workspace_page")).length, 1);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("workspace_shell")).length, 1);
});

test("applyCatalogOverlay: legacy overlay (no X4 columns) subtracts per the lossless fallback", () => {
  const items = [item()];
  // workspace_enabled:false ⇒ both workspace surfaces drop; both talent surfaces
  // (incl. the shell) keep it (talent shell ⇐ talent value = true).
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ workspace_enabled: false }),
  };
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("talent_profile")).length, 1);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("talent_shell")).length, 1);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("workspace_page")).length, 0);
  assert.equal(applyCatalogOverlay(items, ov, ctxFor("workspace_shell")).length, 0);
});

test("applyCatalogOverlay: no surfaceKey ⇒ legacy 2-toggle surfaceTarget path (back-compat)", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ talent_enabled: false }),
  };
  const legacyTalentCtx: GalleryMergeContext = {
    galleryPolicy: POLICY,
    surfaceTarget: "talent",
    plan: "free",
    talentTier: null,
  };
  // No surfaceKey: falls through to the coarse talent_enabled check → dropped.
  assert.equal(applyCatalogOverlay(items, ov, legacyTalentCtx).length, 0);
});

test("applyCatalogOverlay: availability-hidden still drops on every surface", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ availability_override: "hidden" }),
  };
  for (const key of CATALOG_SURFACE_KEYS) {
    assert.equal(applyCatalogOverlay(items, ov, ctxFor(key)).length, 0);
  }
});

// ── 4. deriveSurfaceMatrix over the real per-surface visibility map ────────────

test("deriveSurfaceMatrix: each surface reports its OWN column (no 3-on-1 collapse)", () => {
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({
      talent_profile_enabled: true,
      talent_shell_enabled: false,
      workspace_page_enabled: false,
      workspace_shell_enabled: true,
    }),
  };
  const [view] = buildCatalogAdminView([item()], overlays);
  const cells = deriveSurfaceMatrix(view);
  const v = visByKey(cells);
  assert.equal(v.talent_profile, true);
  assert.equal(v.talent_shell, false);
  assert.equal(v.workspace_page, false);
  assert.equal(v.workspace_shell, true);
  // governedBy now names the real per-surface column for each cell.
  const governed = Object.fromEntries(cells.map((c) => [c.key, c.governedBy]));
  assert.equal(governed.talent_profile, "talent_profile_enabled");
  assert.equal(governed.talent_shell, "talent_shell_enabled");
  assert.equal(governed.workspace_page, "workspace_page_enabled");
  assert.equal(governed.workspace_shell, "workspace_shell_enabled");
});

test("deriveSurfaceMatrix: target_context still gates the matrix per surface", () => {
  // A workspace-only row is hidden on both TALENT surfaces, shown on workspace.
  const [view] = buildCatalogAdminView([item({ targetContext: "workspace" })], {});
  const v = visByKey(deriveSurfaceMatrix(view));
  assert.equal(v.talent_profile, false);
  assert.equal(v.talent_shell, false);
  assert.equal(v.workspace_page, true);
  assert.equal(v.workspace_shell, true);
});
