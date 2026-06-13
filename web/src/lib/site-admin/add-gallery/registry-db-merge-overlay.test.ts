/**
 * registry-db-merge-overlay.test.ts — P3 (catalog overlay).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/registry-db-merge-overlay.test.ts
 *
 * Covers the PURE overlay core:
 *   1. applyCatalogOverlay — subtract-only per-surface, availability-hidden,
 *      tighten-only plan gate, label/icon/category overrides, passthrough.
 *   2. buildCatalogAdminView — effective visibility from target ∩ overlay; hidden
 *      items remain listed (manageable).
 *   3. listGalleryItems — loadOverlays dep is applied to the merged set.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderGalleryPolicy } from "@/lib/site-admin/builder-core/config";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

import {
  applyCatalogOverlay,
  buildCatalogAdminView,
  listGalleryItems,
  type CatalogOverlayMap,
  type CatalogOverlayRow,
  type GalleryMergeContext,
} from "./registry-db-merge";
import type { AddGalleryItem } from "./types";

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

const talentCtx: GalleryMergeContext = {
  galleryPolicy: POLICY,
  surfaceTarget: "talent",
  plan: "free",
  talentTier: "talent_portfolio",
};
const workspaceCtx: GalleryMergeContext = {
  galleryPolicy: POLICY,
  surfaceTarget: "workspace",
  plan: "free",
  talentTier: null,
};

// ── 1. applyCatalogOverlay ────────────────────────────────────────────────────

test("applyCatalogOverlay subtracts per-surface (talent only)", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = { "el-button": overlay({ talent_enabled: false }) };
  assert.equal(applyCatalogOverlay(items, ov, talentCtx).length, 0);
  assert.equal(applyCatalogOverlay(items, ov, workspaceCtx).length, 1);
});

test("applyCatalogOverlay availability-hidden drops on every surface", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ availability_override: "hidden" }),
  };
  assert.equal(applyCatalogOverlay(items, ov, talentCtx).length, 0);
  assert.equal(applyCatalogOverlay(items, ov, workspaceCtx).length, 0);
});

test("applyCatalogOverlay applies label/icon/category overrides", () => {
  const items = [item()];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({
      label_override: "CTA",
      icon_override: "cta",
      category_override: "actions",
    }),
  };
  const [out] = applyCatalogOverlay(items, ov, workspaceCtx);
  assert.equal(out.label, "CTA");
  assert.equal(out.icon, "cta");
  assert.equal(out.category, "actions");
});

test("required_plan_override is tighten-only and drops under-plan surfaces", () => {
  const items = [item({ requiredPlan: undefined })];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ required_plan_override: "agency" }),
  };
  // free surface can't meet an agency override → dropped
  assert.equal(applyCatalogOverlay(items, ov, { ...workspaceCtx, plan: "free" }).length, 0);
  // network surface meets it → kept, effective requiredPlan tightened to agency
  const kept = applyCatalogOverlay(items, ov, { ...workspaceCtx, plan: "network" });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].requiredPlan, "agency");
});

test("applyCatalogOverlay passes items through unchanged when no overlay", () => {
  const items = [item()];
  const out = applyCatalogOverlay(items, {}, talentCtx);
  assert.equal(out.length, 1);
  assert.equal(out[0], items[0]); // same reference — untouched
});

// ── 2. buildCatalogAdminView ──────────────────────────────────────────────────

test("buildCatalogAdminView computes per-surface visibility and lists hidden items", () => {
  const universe: AddGalleryItem[] = [
    item({ id: "el-button" }),
    item({
      id: "db-template:abc",
      label: "Talent Hero",
      tab: "page_templates",
      insertMethod: "dbTemplate",
      targetContext: "talent",
    }),
  ];
  const ov: CatalogOverlayMap = {
    "el-button": overlay({ talent_enabled: false }),
  };
  const view = buildCatalogAdminView(universe, ov);
  assert.equal(view.length, 2); // hidden item still listed

  const button = view.find((v) => v.id === "el-button")!;
  assert.equal(button.source, "code");
  assert.equal(button.talentVisible, false); // overlay-disabled on talent
  assert.equal(button.workspaceVisible, true);

  const tpl = view.find((v) => v.id === "db-template:abc")!;
  assert.equal(tpl.source, "template");
  assert.equal(tpl.talentVisible, true); // target_context = talent
  assert.equal(tpl.workspaceVisible, false); // not targeted to workspace
});

// ── 3. listGalleryItems applies loadOverlays ──────────────────────────────────

function makeRow(over: Partial<BuilderTemplateRow> = {}): BuilderTemplateRow {
  return {
    id: over.id ?? "abc",
    kind: "page_template",
    status: "published",
    target_context: over.target_context ?? "both",
    title: over.title ?? "Both Surfaces Template",
    slug: "both-tpl",
    description: "",
    category: "hero",
    gallery_tab: "page_templates",
    tags: [],
    thumbnail_asset_id: null,
    hero_asset_id: null,
    required_plan: "free",
    required_talent_tier: null,
    builder_tree: [] as unknown as BuilderTemplateRow["builder_tree"],
    theme_tokens: null,
    data_binding_requirements: [],
    schema_version: 1,
    version: 1,
    published_at: "2026-06-01T00:00:00Z",
    source_tenant_id: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

test("listGalleryItems applies the overlay loader to the merged set", async () => {
  const templateId = "db-template:abc";
  const deps = {
    listPublishedTemplates: async () => ({ ok: true as const, data: [makeRow()] }),
    loadOverlays: async (): Promise<CatalogOverlayMap> => ({
      [templateId]: overlay({
        item_ref: templateId,
        source: "template",
        talent_enabled: false, // hide the 'both' template on talent only
      }),
    }),
  };

  const onTalent = await listGalleryItems(talentCtx, deps);
  const onWorkspace = await listGalleryItems(workspaceCtx, deps);

  assert.equal(onTalent.some((i) => i.id === templateId), false); // hidden on talent
  assert.equal(onWorkspace.some((i) => i.id === templateId), true); // kept on workspace
});

// ── W13: buildCatalogAdminView visibility matrix + status ─────────────────────

test("buildCatalogAdminView: target_context gates per-surface visibility (full matrix)", () => {
  const universe: AddGalleryItem[] = [
    item({ id: "db:t", insertMethod: "dbTemplate", targetContext: "talent" }),
    item({ id: "db:w", insertMethod: "dbTemplate", targetContext: "workspace" }),
    item({ id: "db:b", insertMethod: "dbTemplate", targetContext: "both" }),
    item({ id: "db:p", insertMethod: "dbTemplate", targetContext: "platform" }),
    item({ id: "el-x" }), // code → implicit "both"
  ];
  const view = buildCatalogAdminView(universe, {});
  const by = (id: string) => view.find((v) => v.id === id)!;
  assert.deepEqual([by("db:t").talentVisible, by("db:t").workspaceVisible], [true, false]);
  assert.deepEqual([by("db:w").talentVisible, by("db:w").workspaceVisible], [false, true]);
  assert.deepEqual([by("db:b").talentVisible, by("db:b").workspaceVisible], [true, true]);
  assert.deepEqual([by("db:p").talentVisible, by("db:p").workspaceVisible], [false, false]);
  assert.deepEqual([by("el-x").talentVisible, by("el-x").workspaceVisible], [true, true]);
});

test("buildCatalogAdminView: availability-hidden hides on both surfaces but item stays listed", () => {
  const universe: AddGalleryItem[] = [item({ id: "el-x" })];
  const view = buildCatalogAdminView(universe, {
    "el-x": overlay({ item_ref: "el-x", availability_override: "hidden" }),
  });
  assert.equal(view.length, 1); // still listed → re-enable-able
  assert.deepEqual([view[0].talentVisible, view[0].workspaceVisible], [false, false]);
});

test("buildCatalogAdminView: status from statusByRef for templates, 'built-in' for code", () => {
  const universe: AddGalleryItem[] = [
    item({ id: "el-x" }),
    item({ id: "db:d", insertMethod: "dbTemplate", targetContext: "both" }),
    item({ id: "db:e", insertMethod: "dbTemplate", targetContext: "both" }),
  ];
  const view = buildCatalogAdminView(universe, {}, { "db:d": "draft" });
  assert.equal(view.find((v) => v.id === "el-x")!.status, "built-in");
  assert.equal(view.find((v) => v.id === "db:d")!.status, "draft");
  assert.equal(view.find((v) => v.id === "db:e")!.status, "published"); // no entry → default
});

// ── W13: applyCatalogOverlay null-surface / null-plan contract (homepage/Lab) ──

test("applyCatalogOverlay: null surfaceTarget skips per-surface subtraction", () => {
  const items = [item()];
  const nullCtx: GalleryMergeContext = {
    galleryPolicy: POLICY,
    surfaceTarget: null,
    plan: "free",
    talentTier: null,
  };
  // talent_enabled:false but no surface → NOT subtracted
  assert.equal(
    applyCatalogOverlay(items, { "el-button": overlay({ talent_enabled: false }) }, nullCtx).length,
    1,
  );
  // availability-hidden still drops even with null surface
  assert.equal(
    applyCatalogOverlay(items, { "el-button": overlay({ availability_override: "hidden" }) }, nullCtx).length,
    0,
  );
});

test("applyCatalogOverlay: null plan skips the required_plan_override gate", () => {
  const items = [item()];
  const nullPlanCtx: GalleryMergeContext = {
    galleryPolicy: POLICY,
    surfaceTarget: "workspace",
    plan: null,
    talentTier: null,
  };
  assert.equal(
    applyCatalogOverlay(items, { "el-button": overlay({ required_plan_override: "network" }) }, nullPlanCtx).length,
    1,
  );
});
