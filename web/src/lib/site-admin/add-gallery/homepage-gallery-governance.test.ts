/**
 * homepage-gallery-governance.test.ts
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/homepage-gallery-governance.test.ts
 *
 * Regression guard for the homepage Add-Gallery governance bug:
 *
 *   The agency homepage IS a workspace page, but its surface config shipped with
 *   no `surfaceKey` and `allowDbTemplates: false`. The live `add-gallery-panel`
 *   only ran the overlay-applying fetch when `allowDbTemplates` was true, so the
 *   homepage painted the RAW code catalog — a component disabled or archived in
 *   the Builder Lab still appeared in the homepage "+" gallery (proven by live
 *   browser QA: `el-divider`/`el-row` disabled for Workspace Page were removed
 *   from a freeform `cms_page` gallery but NOT from the homepage editor).
 *
 * Two assertions lock the fix:
 *   1. CONFIG — `buildHomepageBuilderConfig` now declares the homepage's gallery
 *      audience as `workspace_page` / `workspace`, exactly like the freeform
 *      `cms_page` surface, so the Lab's Workspace Page column governs it.
 *   2. BEHAVIOUR — `applyCatalogOverlay` subtracts a Lab-disabled AND a
 *      Lab-archived component under a policy with `allowDbTemplates: false`,
 *      proving overlay governance is INDEPENDENT of the DB-template flag (the
 *      panel must therefore apply it on every surface, not just DB ones).
 *
 * Imports come DIRECTLY from `registry-db-merge.ts`, never the add-gallery barrel
 * (the barrel drags a `.css` side-effect into the test graph and breaks tsx).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCatalogOverlay,
  surfaceKeyToTarget,
  type CatalogOverlayMap,
  type CatalogOverlayRow,
  type GalleryMergeContext,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";
import {
  buildHomepageBuilderConfig,
  type BuilderGalleryPolicy,
} from "@/lib/site-admin/builder-core/config";
import type { BuilderSurfaceAdapter } from "@/lib/site-admin/builder-core/surface-adapter";

// ── fixtures ────────────────────────────────────────────────────────────────

function item(over: Partial<AddGalleryItem> = {}): AddGalleryItem {
  return {
    id: "el-divider",
    label: "Divider",
    description: "",
    tab: "blocks",
    category: "layout",
    icon: "minus",
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
    item_ref: "el-divider",
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

// The homepage's real policy: structural tabs, NO DB templates — the exact
// surface whose panel used to skip overlay application.
const HOMEPAGE_POLICY: BuilderGalleryPolicy = {
  allowedTabs: ["blocks", "designs", "data"],
  allowDbTemplates: false,
  surfaceKey: "workspace_page",
  surfaceTarget: "workspace",
};

function homepageCtx(): GalleryMergeContext {
  return {
    galleryPolicy: HOMEPAGE_POLICY,
    surfaceTarget: surfaceKeyToTarget("workspace_page"),
    surfaceKey: "workspace_page",
    plan: "agency",
    talentTier: null,
  };
}

// `buildHomepageBuilderConfig` only reads the adapter for the `surface` field;
// `galleryPolicy` is static, so a minimal stub adapter is sufficient here.
const STUB_ADAPTER = { kind: "homepage" } as unknown as BuilderSurfaceAdapter;

// ── 1. config: the homepage is governed as a workspace page ───────────────────

test("homepage gallery policy declares workspace_page governance (surfaceKey + surfaceTarget)", () => {
  const { galleryPolicy } = buildHomepageBuilderConfig(STUB_ADAPTER);
  // The Lab's Workspace Page column must bite on the homepage, mirroring the
  // freeform cms_page surface. Without surfaceKey there is nothing to key the
  // per-surface subtraction on, and deactivation from the Lab is a no-op.
  assert.equal(galleryPolicy.surfaceKey, "workspace_page");
  assert.equal(galleryPolicy.surfaceTarget, "workspace");
  // The homepage still does NOT offer the DB "Page Templates" tab — the fix is
  // about governance, not about adding templates to the homepage.
  assert.equal(galleryPolicy.allowDbTemplates, false);
});

// ── 2. behaviour: overlay applies regardless of allowDbTemplates ──────────────

test("a Workspace-Page-disabled component is subtracted on the homepage (allowDbTemplates:false)", () => {
  const items = [item()];
  const overlays: CatalogOverlayMap = {
    "el-divider": overlay({ workspace_page_enabled: false }),
  };
  // Disabled for Workspace Page ⇒ gone from the homepage gallery.
  assert.equal(applyCatalogOverlay(items, overlays, homepageCtx()).length, 0);
});

test("a globally-archived component is subtracted on the homepage (allowDbTemplates:false)", () => {
  const items = [item()];
  const overlays: CatalogOverlayMap = {
    "el-divider": overlay({ availability_override: "hidden" }),
  };
  // A Lab "Archive / hide everywhere" must never leak into any live gallery —
  // including the homepage, which previously skipped overlay application.
  assert.equal(applyCatalogOverlay(items, overlays, homepageCtx()).length, 0);
});

test("an enabled component still shows on the homepage (control)", () => {
  const items = [item()];
  const overlays: CatalogOverlayMap = {
    "el-divider": overlay({ workspace_page_enabled: true }),
  };
  assert.equal(applyCatalogOverlay(items, overlays, homepageCtx()).length, 1);
});
