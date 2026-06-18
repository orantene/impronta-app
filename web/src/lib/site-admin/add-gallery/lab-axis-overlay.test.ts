/**
 * lab-axis-overlay.test.ts — X6 (the independent Builder-Lab visibility axis).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/lab-axis-overlay.test.ts
 *
 * Covers the PURE read logic X6 adds on top of the X4 four-surface matrix:
 *   1. labEnabledForRow — null/absent row ⇒ Lab-visible; explicit `lab_enabled`
 *      honored verbatim; an absent column on a present row ⇒ true (the DB DEFAULT,
 *      no legacy fallback). This is the FIFTH axis — orthogonal to the four tenant
 *      surfaces and to target_context.
 *   2. buildCatalogAdminView.labVisible — the lab toggle ∩ not availability-hidden,
 *      NEVER gated by target_context (a workspace-only row is still Lab-visible).
 *   3. applyCatalogOverlay with ctx.isLab — the Lab merge subtracts on lab_enabled;
 *      a tenant merge (no isLab) never does. Orthogonality both ways: disabling a
 *      tenant surface doesn't hide from the Lab, and lab_enabled:false doesn't hide
 *      from a tenant surface.
 *
 * Imports come DIRECTLY from `surface-keys.ts` / `registry-db-merge.ts`, never the
 * add-gallery barrel (the barrel drags a `.css` side-effect into the test graph
 * and breaks tsx).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { labEnabledForRow } from "./surface-keys";
import {
  applyCatalogOverlay,
  buildCatalogAdminView,
  surfaceKeyToTarget,
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

const POLICY: BuilderGalleryPolicy = {
  allowedTabs: ["layout", "elements", "sections", "connected", "page_templates"],
  allowDbTemplates: true,
};

/** The Builder Lab merge context: isLab=true, no surfaceKey (the Lab carries
 *  none), no surface target (authors for every audience). */
const LAB_CTX: GalleryMergeContext = {
  galleryPolicy: POLICY,
  surfaceTarget: null,
  isLab: true,
  plan: "free",
  talentTier: "talent_portfolio",
};

function tenantCtx(surfaceKey: CatalogSurfaceKey): GalleryMergeContext {
  return {
    galleryPolicy: POLICY,
    surfaceTarget: surfaceKeyToTarget(surfaceKey),
    surfaceKey,
    plan: "free",
    talentTier: "talent_portfolio",
  };
}

// ── 1. labEnabledForRow — explicit column wins, default-true otherwise ─────────

test("labEnabledForRow: null/undefined overlay ⇒ Lab-visible", () => {
  assert.equal(labEnabledForRow(null), true);
  assert.equal(labEnabledForRow(undefined), true);
});

test("labEnabledForRow: explicit lab_enabled is honored verbatim", () => {
  assert.equal(labEnabledForRow(overlay({ lab_enabled: false })), false);
  assert.equal(labEnabledForRow(overlay({ lab_enabled: true })), true);
});

test("labEnabledForRow: absent column on a present row ⇒ true (DB default, no legacy fallback)", () => {
  // A row that disables every tenant surface but says nothing about the Lab is
  // STILL Lab-visible — the axes are independent.
  const ov = overlay({
    talent_enabled: false,
    workspace_enabled: false,
    talent_profile_enabled: false,
    talent_shell_enabled: false,
    workspace_page_enabled: false,
    workspace_shell_enabled: false,
  });
  assert.equal(labEnabledForRow(ov), true);
});

// ── 2. buildCatalogAdminView.labVisible — independent of target_context ────────

test("buildCatalogAdminView: labVisible reflects lab_enabled, gated only by availability", () => {
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({ lab_enabled: false }),
  };
  const [view] = buildCatalogAdminView([item()], overlays);
  assert.equal(view.labVisible, false);

  const [enabled] = buildCatalogAdminView([item()], {
    "el-button": overlay({ lab_enabled: true }),
  });
  assert.equal(enabled.labVisible, true);

  // No overlay ⇒ Lab-visible.
  const [bare] = buildCatalogAdminView([item()], {});
  assert.equal(bare.labVisible, true);
});

test("buildCatalogAdminView: availability-hidden also hides from the Lab", () => {
  const [view] = buildCatalogAdminView([item()], {
    "el-button": overlay({ lab_enabled: true, availability_override: "hidden" }),
  });
  assert.equal(view.labVisible, false);
});

test("buildCatalogAdminView: labVisible is NOT gated by target_context", () => {
  // A workspace-only row is hidden on both talent surfaces but STILL Lab-visible
  // — the Lab authors for every audience.
  const [view] = buildCatalogAdminView([item({ targetContext: "workspace" })], {});
  assert.equal(view.surfaceVisible.talent_profile, false);
  assert.equal(view.labVisible, true);
});

// ── 3. applyCatalogOverlay honors the Lab axis only when ctx.isLab ─────────────

test("applyCatalogOverlay: isLab subtracts a lab_enabled:false row from the Lab gallery", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = { "el-button": overlay({ lab_enabled: false }) };
  assert.equal(applyCatalogOverlay(items, ov, LAB_CTX).length, 0);
});

test("applyCatalogOverlay: isLab keeps a lab_enabled:true (or absent) row", () => {
  const items = [item()];
  assert.equal(
    applyCatalogOverlay(items, { "el-button": overlay({ lab_enabled: true }) }, LAB_CTX).length,
    1,
  );
  // Absent column ⇒ default true ⇒ kept.
  assert.equal(
    applyCatalogOverlay(items, { "el-button": overlay() }, LAB_CTX).length,
    1,
  );
});

test("applyCatalogOverlay: a TENANT merge (no isLab) never subtracts on lab_enabled", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = { "el-button": overlay({ lab_enabled: false }) };
  // lab_enabled:false must NOT hide the component from any tenant surface.
  for (const key of ["talent_profile", "talent_shell", "workspace_page", "workspace_shell"] as const) {
    assert.equal(applyCatalogOverlay(items, ov, tenantCtx(key)).length, 1);
  }
});

test("applyCatalogOverlay: disabling tenant surfaces never hides from the Lab", () => {
  const items = [item()];
  // Every tenant surface off, but lab_enabled left at its default (true).
  const ov: CatalogOverlayMap = {
    "el-button": overlay({
      talent_profile_enabled: false,
      talent_shell_enabled: false,
      workspace_page_enabled: false,
      workspace_shell_enabled: false,
    }),
  };
  assert.equal(applyCatalogOverlay(items, ov, LAB_CTX).length, 1);
});

test("applyCatalogOverlay: availability-hidden still drops from the Lab", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ lab_enabled: true, availability_override: "hidden" }),
  };
  assert.equal(applyCatalogOverlay(items, ov, LAB_CTX).length, 0);
});
