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
import {
  applyStructureToItems,
  type CatalogStructureMap,
  type CatalogStructureRow,
} from "./catalog-structure";
import type { AddGalleryItem } from "./types";

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
      tab: "designs",
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

test("listGalleryItems applies the structure loader (item tab/category move) to the merged set", async () => {
  const deps = {
    listPublishedTemplates: async () => ({ ok: true as const, data: [] }),
    loadStructure: async () => ({
      "item:el-button": {
        ref: "item:el-button",
        kind: "item" as const,
        label_override: null,
        icon_override: null,
        parent_tab: "blocks",
        sort_order: null,
        created: false,
        hidden: false,
        category_override: "promos",
      },
    }),
  };

  const items = await listGalleryItems(workspaceCtx, deps);
  const moved = items.find((i) => i.id === "el-button");
  assert.ok(moved, "el-button should be present");
  assert.equal(moved!.tab, "blocks"); // moved by the structure row
  assert.equal(moved!.category, "promos");
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

test("buildCatalogAdminView: status from statusByRef for templates, derived for code", () => {
  const universe: AddGalleryItem[] = [
    item({ id: "el-x" }),
    item({ id: "db:d", insertMethod: "dbTemplate", targetContext: "both" }),
    item({ id: "db:e", insertMethod: "dbTemplate", targetContext: "both" }),
  ];
  const view = buildCatalogAdminView(universe, {}, { "db:d": "draft" });
  // Code items have NO lifecycle row → status is DERIVED from availability:
  // not-hidden ⇒ 'published' (the synthetic 'built-in' literal was removed).
  assert.equal(view.find((v) => v.id === "el-x")!.status, "published");
  assert.equal(view.find((v) => v.id === "db:d")!.status, "draft");
  assert.equal(view.find((v) => v.id === "db:e")!.status, "published"); // no entry → default
});

// ── F4: category/tab precedence — Lab (buildCatalogAdminView) == live gallery ──
// The live "+" gallery resolves placement as: base → overlay → structure, with
// the structure `item:<id>` row WINNING (it is the explicit "move this
// component" control; see listGalleryItems.finalize). The Builder Lab's Catalog
// Studio MUST resolve the same way, else the Lab shows a DIFFERENT category
// layout than production. These tests pin the precedence and assert parity with
// the live finalize ordering (applyCatalogOverlay → applyStructureToItems).

function structRow(
  over: Partial<CatalogStructureRow> & { ref: string },
): CatalogStructureRow {
  return {
    kind: "item",
    label_override: null,
    icon_override: null,
    parent_tab: null,
    sort_order: null,
    created: false,
    hidden: false,
    category_override: null,
    ...over,
  };
}

/** The LIVE finalize order: overlay first, then structure (structure wins). */
function liveResolve(
  it: AddGalleryItem,
  overlays: CatalogOverlayMap,
  structure: CatalogStructureMap,
  ctx: GalleryMergeContext,
): { tab: AddGalleryItem["tab"]; category: string } {
  const [withOverlay] = applyCatalogOverlay([it], overlays, ctx);
  const [out] = applyStructureToItems([withOverlay], structure);
  return { tab: out.tab, category: out.category };
}

test("F4: structure category WINS over overlay category (Lab == live)", () => {
  const it = item({ id: "el-button", category: "buttons", tab: "blocks" });
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({ category_override: "actions" }),
  };
  const structure: CatalogStructureMap = {
    "item:el-button": structRow({
      ref: "item:el-button",
      category_override: "hero",
    }),
  };

  // Live path: overlay sets "actions", structure overrides to "hero" → "hero".
  const live = liveResolve(it, overlays, structure, {
    galleryPolicy: POLICY,
    surfaceTarget: null,
    plan: null,
    talentTier: null,
  });
  assert.equal(live.category, "hero");

  // Lab path: buildCatalogAdminView with the structure map must match.
  const [row] = buildCatalogAdminView([it], overlays, {}, structure);
  assert.equal(
    row.effectiveCategory,
    live.category,
    "Lab effectiveCategory must equal the live-resolved category (structure wins)",
  );
  // baseCategory stays the genuine code default (not the structure value), so the
  // override-input placeholder still shows the real baseline.
  assert.equal(row.baseCategory, "buttons");
});

test("F4: overlay category applies when NO structure row (Lab == live)", () => {
  const it = item({ id: "el-button", category: "buttons" });
  const overlays: CatalogOverlayMap = {
    "el-button": overlay({ category_override: "actions" }),
  };
  const live = liveResolve(it, overlays, {}, {
    galleryPolicy: POLICY,
    surfaceTarget: null,
    plan: null,
    talentTier: null,
  });
  assert.equal(live.category, "actions");

  const [row] = buildCatalogAdminView([it], overlays, {}, {});
  assert.equal(row.effectiveCategory, "actions");
  assert.equal(row.effectiveCategory, live.category);
});

test("F4: structure tab move is reflected in the Lab row (Lab == live)", () => {
  const it = item({ id: "el-button", tab: "blocks", category: "buttons" });
  const structure: CatalogStructureMap = {
    "item:el-button": structRow({
      ref: "item:el-button",
      parent_tab: "designs",
    }),
  };
  const live = liveResolve(it, {}, structure, {
    galleryPolicy: POLICY,
    surfaceTarget: null,
    plan: null,
    talentTier: null,
  });
  assert.equal(live.tab, "designs");

  const [row] = buildCatalogAdminView([it], {}, {}, structure);
  assert.equal(row.tab, "designs");
  assert.equal(row.tab, live.tab);
});

test("F4: empty structure ⇒ overlay-only placement (back-compat identity)", () => {
  const it = item({ id: "el-button", category: "buttons", tab: "blocks" });
  const [row] = buildCatalogAdminView([it], {}, {});
  assert.equal(row.effectiveCategory, "buttons");
  assert.equal(row.tab, "blocks");
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
