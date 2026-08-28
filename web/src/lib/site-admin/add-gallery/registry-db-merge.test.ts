/**
 * registry-db-merge.test.ts — WS4.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/registry-db-merge.test.ts
 *
 * Covers:
 *   1. builderTemplateRowToGalleryItem — pure row→item mapping + dbTemplate carriers.
 *   2. §E gating — target_context / required_plan / required_talent_tier.
 *   3. mergeGalleryItems — code catalog (allowed tabs) ∪ gated DB items.
 *   4. listGalleryItems — async entry, injected listPublishedTemplates fake,
 *      allowDbTemplates off ⇒ code-only (no DB call), fetch error ⇒ code-only.
 *
 * All deps are injected — no Supabase, no React, no server graph at import.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderGalleryPolicy } from "@/lib/site-admin/builder-core/config";
import type {
  BuilderTemplateRow,
  ListPublishedTemplatesFilter,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

import {
  builderTemplateRowToGalleryItem,
  codeGalleryItemsForPolicy,
  dbTemplateGalleryItemId,
  gateDbGalleryItems,
  listGalleryItems,
  mergeGalleryItems,
  templateTalentTierAllowed,
  templateTargetAllowed,
  type GalleryMergeContext,
} from "./registry-db-merge";

// ── fixtures ──────────────────────────────────────────────────────────────────

function makeRow(over: Partial<BuilderTemplateRow> = {}): BuilderTemplateRow {
  return {
    id: over.id ?? "row-1",
    kind: over.kind ?? "page_template",
    status: "published",
    target_context: over.target_context ?? "both",
    title: over.title ?? "Studio One-Pager",
    slug: over.slug ?? "studio-one-pager",
    description: over.description ?? "A clean one-page template.",
    category: over.category ?? "hero",
    gallery_tab: over.gallery_tab ?? "page_templates",
    tags: over.tags ?? ["clean", "minimal"],
    thumbnail_asset_id: over.thumbnail_asset_id ?? null,
    hero_asset_id: over.hero_asset_id ?? null,
    required_plan: over.required_plan ?? "free",
    required_talent_tier: over.required_talent_tier ?? null,
    builder_tree:
      over.builder_tree ??
      ([
        {
          id: "src-container",
          kind: "container",
          props: { layout: "stack", layerLabel: "Root" },
          children: [
            { id: "src-heading", kind: "heading", props: { text: "Hi", level: 1 } },
          ],
        },
      ] as unknown as BuilderTemplateRow["builder_tree"]),
    theme_tokens: null,
    data_binding_requirements: over.data_binding_requirements ?? [],
    schema_version: 1,
    version: 2,
    published_at: "2026-06-01T00:00:00Z",
    source_tenant_id: null,
    created_by: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

const ALL_TABS_POLICY: BuilderGalleryPolicy = {
  allowedTabs: ["blocks", "designs", "data", "page_templates"],
  allowDbTemplates: true,
};

// ── 1. row → item ──────────────────────────────────────────────────────────────

test("builderTemplateRowToGalleryItem maps row fields + dbTemplate carriers", () => {
  const row = makeRow({
    data_binding_requirements: ["featured_talent_profiles"],
    required_plan: "studio",
    target_context: "workspace",
    required_talent_tier: null,
  });
  const item = builderTemplateRowToGalleryItem(row, {
    previewImageUrl: "https://cdn.example/thumb.jpg",
  });

  assert.equal(item.id, dbTemplateGalleryItemId("row-1"));
  assert.equal(item.label, "Studio One-Pager");
  assert.equal(item.description, "A clean one-page template.");
  assert.equal(item.tab, "designs");
  assert.equal(item.category, "hero");
  assert.equal(item.insertMethod, "dbTemplate");
  assert.equal(item.availability, "available");
  assert.equal(item.previewType, "image-card");
  assert.equal(item.previewImageUrl, "https://cdn.example/thumb.jpg");
  assert.equal(item.dbTemplateId, "row-1");
  assert.equal(item.requiredPlan, "studio");
  assert.equal(item.targetContext, "workspace");
  assert.equal(item.itemKind, "connected"); // has a data binding requirement
  assert.ok(item.dbTemplateTree && item.dbTemplateTree.length === 1);
});

test("builderTemplateRowToGalleryItem falls back to icon-card without a preview image", () => {
  const item = builderTemplateRowToGalleryItem(makeRow());
  assert.equal(item.previewType, "icon-card");
  assert.equal(item.previewImageUrl, undefined);
  assert.equal(item.itemKind, "static"); // no data bindings
});

// ── 2. §E gating ────────────────────────────────────────────────────────────────

test("templateTargetAllowed: both is always visible; exact match required otherwise", () => {
  assert.equal(templateTargetAllowed("both", "talent"), true);
  assert.equal(templateTargetAllowed("workspace", "workspace"), true);
  assert.equal(templateTargetAllowed("workspace", "talent"), false);
  assert.equal(templateTargetAllowed("talent", null), true); // no surface constraint
});

test("templateTalentTierAllowed: tier-required rows hidden from surfaces without that tier", () => {
  assert.equal(templateTalentTierAllowed(null, null), true); // no requirement
  assert.equal(templateTalentTierAllowed("talent_pro", "talent_pro"), true);
  assert.equal(templateTalentTierAllowed("talent_pro", "talent_portfolio"), true); // higher
  assert.equal(templateTalentTierAllowed("talent_pro", "talent_basic"), false); // lower
  assert.equal(templateTalentTierAllowed("talent_pro", null), false); // no tier on surface
});

test("gateDbGalleryItems drops rows over plan / off-target / over-tier / wrong-tab", () => {
  const ctx: GalleryMergeContext = {
    galleryPolicy: ALL_TABS_POLICY,
    surfaceTarget: "workspace",
    plan: "studio",
    talentTier: null,
  };

  const ok = builderTemplateRowToGalleryItem(
    makeRow({ id: "ok", required_plan: "free", target_context: "workspace" }),
  );
  const overPlan = builderTemplateRowToGalleryItem(
    makeRow({ id: "over-plan", required_plan: "network" }),
  );
  const offTarget = builderTemplateRowToGalleryItem(
    makeRow({ id: "off-target", target_context: "talent" }),
  );
  const tierGated = builderTemplateRowToGalleryItem(
    makeRow({ id: "tier", required_talent_tier: "talent_pro" }),
  );

  const kept = gateDbGalleryItems([ok, overPlan, offTarget, tierGated], ctx);
  const keptIds = kept.map((i) => i.dbTemplateId);
  assert.deepEqual(keptIds, ["ok"]);
});

test("gateDbGalleryItems returns [] when policy.allowDbTemplates is false", () => {
  const item = builderTemplateRowToGalleryItem(makeRow());
  const kept = gateDbGalleryItems([item], {
    galleryPolicy: { ...ALL_TABS_POLICY, allowDbTemplates: false },
  });
  assert.deepEqual(kept, []);
});

test("gateDbGalleryItems: shell allow-list without page_templates drops full-page DB templates", () => {
  const pageTpl = builderTemplateRowToGalleryItem(
    makeRow({ id: "page-tpl", gallery_tab: "page_templates" }),
  );
  const sectionTpl = builderTemplateRowToGalleryItem(
    makeRow({ id: "sec-tpl", gallery_tab: "sections", kind: "section" }),
  );
  const shellTpl = builderTemplateRowToGalleryItem(
    makeRow({ id: "shell-tpl", gallery_tab: "shell", kind: "shell_header" }),
  );
  const kept = gateDbGalleryItems([pageTpl, sectionTpl, shellTpl], {
    galleryPolicy: {
      allowedTabs: ["blocks", "designs", "data", "shell"],
      allowDbTemplates: true,
    },
    surfaceTarget: "both",
    plan: "network",
  });
  const ids = kept.map((i) => i.dbTemplateId);
  assert.equal(ids.includes("page-tpl"), false);
  assert.ok(ids.includes("sec-tpl"));
  assert.ok(ids.includes("shell-tpl"));
});

// ── 3. merge ────────────────────────────────────────────────────────────────────

test("codeGalleryItemsForPolicy returns only items on allowed tabs", () => {
  const elementsOnly = codeGalleryItemsForPolicy({
    allowedTabs: ["elements"],
    allowDbTemplates: false,
  });
  assert.ok(elementsOnly.length > 0);
  assert.ok(elementsOnly.every((i) => i.tab === "blocks"));
});

test("codeGalleryItemsForPolicy: a page-builder allow-list without shell hides Shell cards", () => {
  const items = codeGalleryItemsForPolicy({
    allowedTabs: ["blocks", "designs", "data", "page_templates"],
    allowDbTemplates: false,
  });
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.tab !== "shell"));
});

test("mergeGalleryItems = code catalog (allowed tabs) followed by gated DB items", () => {
  const ctx: GalleryMergeContext = {
    galleryPolicy: { allowedTabs: ["page_templates"], allowDbTemplates: true },
    surfaceTarget: "both",
    plan: "network",
  };
  const dbItem = builderTemplateRowToGalleryItem(makeRow({ id: "dbx" }));
  const merged = mergeGalleryItems([dbItem], ctx);

  // page_templates maps onto Designs, so code design cards come first and the
  // gated DB item is appended. The page_templates token is what lets the DB
  // card through (shell surfaces omit it).
  assert.ok(merged.some((i) => i.dbTemplateId === "dbx"));
  assert.equal(
    merged.filter((i) => i.insertMethod !== "dbTemplate").every((i) => i.tab === "designs"),
    true,
  );
  const db = merged.find((i) => i.dbTemplateId === "dbx");
  assert.equal(db?.tab, "designs");
  assert.equal(db?.insertMethod, "dbTemplate");
});

// ── 4. listGalleryItems (async, injected) ────────────────────────────────────────

test("listGalleryItems: allowDbTemplates off ⇒ code-only, listPublishedTemplates NOT called", async () => {
  let called = false;
  const items = await listGalleryItems(
    { galleryPolicy: { allowedTabs: ["elements"], allowDbTemplates: false } },
    {
      listPublishedTemplates: async () => {
        called = true;
        return { ok: true, data: [] };
      },
    },
  );
  assert.equal(called, false);
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.insertMethod !== "dbTemplate"));
});

test("listGalleryItems: merges published rows + forwards target/plan filter", async () => {
  let seenFilter: ListPublishedTemplatesFilter | undefined;
  const items = await listGalleryItems(
    {
      galleryPolicy: { allowedTabs: ["page_templates"], allowDbTemplates: true },
      surfaceTarget: "workspace",
      plan: "agency",
    },
    {
      listPublishedTemplates: async (filter) => {
        seenFilter = filter;
        return { ok: true, data: [makeRow({ id: "live", target_context: "both" })] };
      },
    },
  );
  assert.equal(seenFilter?.targetContext, "workspace");
  assert.equal(seenFilter?.plan, "agency");
  const db = items.filter((i) => i.insertMethod === "dbTemplate");
  assert.equal(db.length, 1);
  assert.equal(db[0]!.dbTemplateId, "live");
});

test("listGalleryItems: fetch error degrades to code-only (never throws)", async () => {
  const items = await listGalleryItems(
    { galleryPolicy: ALL_TABS_POLICY, plan: "free" },
    {
      listPublishedTemplates: async () => ({ ok: false, error: "boom" }),
    },
  );
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.insertMethod !== "dbTemplate"));
});

test("listGalleryItems: resolvePreviewImageUrl is applied to mapped DB items", async () => {
  const items = await listGalleryItems(
    {
      galleryPolicy: { allowedTabs: ["page_templates"], allowDbTemplates: true },
      plan: "network",
    },
    {
      listPublishedTemplates: async () => ({
        ok: true,
        data: [makeRow({ id: "with-img" })],
      }),
      resolvePreviewImageUrl: async () => "https://cdn.example/x.jpg",
    },
  );
  const db = items.find((i) => i.dbTemplateId === "with-img");
  assert.equal(db?.previewImageUrl, "https://cdn.example/x.jpg");
  assert.equal(db?.previewType, "image-card");
});
