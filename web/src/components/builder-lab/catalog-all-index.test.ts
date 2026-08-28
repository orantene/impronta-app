/**
 * O10 — unit tests for the unified "All" superset index pure logic: flatten
 * (code components ∪ published templates ∪ draft/in_review templates → one
 * deduped row list), facet counts, facet filtering, and column sorting. No
 * React — exercises catalog-all-index.ts directly via tsx --test.
 *
 * Run:
 *   node_modules/.bin/tsx --test src/components/builder-lab/catalog-all-index.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

import {
  applyAllIndexFilters,
  buildAllIndex,
  buildFilteredSortedIndex,
  emptyFacets,
  facetCounts,
  sortAllIndex,
  type AllIndexRow,
} from "./catalog-all-index";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function codeItem(over: Partial<CatalogAdminItem> = {}): CatalogAdminItem {
  return {
    id: "el-button",
    tab: "blocks",
    source: "code",
    status: "published",
    itemKind: "static",
    availability: "available",
    targetContext: "both",
    connectedSource: undefined,
    baseLabel: "Button",
    baseCategory: "buttons",
    baseIcon: "buttons",
    overlay: null,
    talentVisible: true,
    workspaceVisible: true,
    surfaceVisible: {
      talent_profile: true,
      talent_shell: true,
      workspace_page: true,
      workspace_shell: true,
    },
    labVisible: true,
    effectiveLabel: "Button",
    effectiveCategory: "buttons",
    ...over,
  };
}

function templateItem(over: Partial<CatalogAdminItem> = {}): CatalogAdminItem {
  return codeItem({
    id: "db-template:tmpl-1",
    source: "template",
    dbTemplateId: "tmpl-1",
    tab: "designs",
    status: "published",
    targetContext: "talent",
    baseLabel: "Hero",
    effectiveLabel: "Hero Banner",
    effectiveCategory: "headers",
    ...over,
  });
}

function templateRow(over: Partial<BuilderTemplateRow> = {}): BuilderTemplateRow {
  return {
    id: "tmpl-draft",
    kind: "section",
    status: "draft",
    target_context: "workspace",
    title: "Draft Section",
    slug: "draft-section",
    description: null,
    category: "sections",
    gallery_tab: "sections",
    tags: [],
    thumbnail_asset_id: null,
    hero_asset_id: null,
    required_plan: "studio",
    required_talent_tier: null,
    builder_tree: [],
    theme_tokens: null,
    data_binding_requirements: [],
    schema_version: 1,
    version: 1,
    published_at: null,
    source_tenant_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

// ── buildAllIndex ─────────────────────────────────────────────────────────────

test("buildAllIndex flattens code + template items and appends uncovered drafts", () => {
  const items = [codeItem(), templateItem()];
  const templates = [
    templateRow({ id: "tmpl-1" }), // already covered by templateItem.dbTemplateId
    templateRow({ id: "tmpl-draft", status: "draft" }),
    templateRow({ id: "tmpl-review", status: "in_review", title: "Awaiting Review" }),
  ];
  const rows = buildAllIndex(items, templates);
  // 2 catalog items + 2 uncovered template rows (tmpl-1 is deduped).
  assert.equal(rows.length, 4);

  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get("el-button")?.source, "code");
  assert.equal(byId.get("db-template:tmpl-1")?.source, "template");
  // The draft template (NOT a catalog item) is appended as a "draft" source.
  assert.equal(byId.get("db-template:tmpl-draft")?.source, "draft");
  assert.equal(byId.get("db-template:tmpl-review")?.source, "draft");
  assert.equal(byId.get("db-template:tmpl-review")?.status, "in_review");
  // A draft row has no surfaced gallery tab → null `tab`, raw token in tabLabel.
  assert.equal(byId.get("db-template:tmpl-draft")?.tab, null);
  assert.equal(byId.get("db-template:tmpl-draft")?.tabLabel, "sections");
});

test("buildAllIndex dedupes a covered template (no double-count)", () => {
  const items = [templateItem({ dbTemplateId: "tmpl-x" })];
  const templates = [templateRow({ id: "tmpl-x", status: "published" })];
  const rows = buildAllIndex(items, templates);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "template");
});

test("buildAllIndex reads plan from overlay override for catalog items", () => {
  const items = [
    codeItem({
      overlay: {
        item_ref: "el-button",
        source: "code",
        talent_enabled: true,
        workspace_enabled: true,
        label_override: null,
        icon_override: null,
        category_override: null,
        required_plan_override: "agency",
        availability_override: null,
      },
    }),
  ];
  const rows = buildAllIndex(items, []);
  assert.equal(rows[0].plan, "agency");
  assert.equal(rows[0].customized, true); // overlay present ⇒ customized
});

test("buildAllIndex draft rows carry the template's required_plan + target", () => {
  const rows = buildAllIndex([], [templateRow({ required_plan: "network", target_context: "platform" })]);
  assert.equal(rows[0].plan, "network");
  assert.equal(rows[0].target, "platform");
  assert.equal(rows[0].customized, false);
});

// ── facetCounts ───────────────────────────────────────────────────────────────

test("facetCounts tallies every dimension over the full set", () => {
  const items = [codeItem(), templateItem()];
  const templates = [
    templateRow({ id: "a", status: "draft" }),
    templateRow({ id: "b", status: "in_review" }),
  ];
  const counts = facetCounts(buildAllIndex(items, templates));
  assert.equal(counts.total, 4);
  assert.equal(counts.source.code, 1);
  assert.equal(counts.source.template, 1);
  assert.equal(counts.source.draft, 2);
  assert.equal(counts.status.published, 2);
  assert.equal(counts.status.draft, 1);
  assert.equal(counts.status.in_review, 1);
});

// ── applyAllIndexFilters ──────────────────────────────────────────────────────

test("applyAllIndexFilters narrows by source facet", () => {
  const rows = buildAllIndex([codeItem(), templateItem()], [templateRow({ id: "d" })]);
  const onlyDrafts = applyAllIndexFilters(rows, { ...emptyFacets(), source: "draft" });
  assert.equal(onlyDrafts.length, 1);
  assert.equal(onlyDrafts[0].source, "draft");
});

test("applyAllIndexFilters narrows by status facet (surfaces stuck in_review)", () => {
  const rows = buildAllIndex(
    [],
    [
      templateRow({ id: "1", status: "in_review" }),
      templateRow({ id: "2", status: "draft" }),
      templateRow({ id: "3", status: "in_review" }),
    ],
  );
  const stuck = applyAllIndexFilters(rows, { ...emptyFacets(), status: "in_review" });
  assert.equal(stuck.length, 2);
});

test("applyAllIndexFilters customized facet keeps only overlaid rows", () => {
  const items = [
    codeItem({ id: "plain" }),
    codeItem({
      id: "tuned",
      overlay: {
        item_ref: "tuned",
        source: "code",
        talent_enabled: true,
        workspace_enabled: true,
        label_override: "Renamed",
        icon_override: null,
        category_override: null,
        required_plan_override: null,
        availability_override: null,
      },
    }),
  ];
  const rows = buildAllIndex(items, []);
  const customized = applyAllIndexFilters(rows, { ...emptyFacets(), customized: true });
  assert.equal(customized.length, 1);
  assert.equal(customized[0].id, "tuned");
});

test("applyAllIndexFilters free-text query matches label, id, and tab token", () => {
  const rows = buildAllIndex(
    [codeItem({ id: "el-button", effectiveLabel: "Button" })],
    [templateRow({ id: "hero", title: "Hero One-Pager", gallery_tab: "sections" })],
  );
  assert.equal(applyAllIndexFilters(rows, { ...emptyFacets(), query: "hero" }).length, 1);
  assert.equal(applyAllIndexFilters(rows, { ...emptyFacets(), query: "button" }).length, 1);
  assert.equal(applyAllIndexFilters(rows, { ...emptyFacets(), query: "sections" }).length, 1);
  assert.equal(applyAllIndexFilters(rows, { ...emptyFacets(), query: "zzz" }).length, 0);
});

// ── sortAllIndex ──────────────────────────────────────────────────────────────

test("sortAllIndex status asc surfaces in_review first, archived last", () => {
  const rows: AllIndexRow[] = buildAllIndex(
    [],
    [
      templateRow({ id: "1", status: "published", title: "P" }),
      templateRow({ id: "2", status: "in_review", title: "R" }),
      templateRow({ id: "3", status: "archived", title: "A" }),
      templateRow({ id: "4", status: "draft", title: "D" }),
    ],
  );
  const sorted = sortAllIndex(rows, { key: "status", dir: "asc" });
  assert.deepEqual(
    sorted.map((r) => r.status),
    ["in_review", "draft", "published", "archived"],
  );
});

test("sortAllIndex respects direction toggle", () => {
  const rows = buildAllIndex(
    [],
    [
      templateRow({ id: "1", status: "in_review", title: "R" }),
      templateRow({ id: "2", status: "archived", title: "A" }),
    ],
  );
  const asc = sortAllIndex(rows, { key: "status", dir: "asc" });
  const desc = sortAllIndex(rows, { key: "status", dir: "desc" });
  assert.equal(asc[0].status, "in_review");
  assert.equal(desc[0].status, "archived");
});

test("sortAllIndex label sort is alphabetical + deterministic tiebreak", () => {
  const rows = buildAllIndex(
    [codeItem({ id: "b", effectiveLabel: "Banner" }), codeItem({ id: "a", effectiveLabel: "Avatar" })],
    [],
  );
  const sorted = sortAllIndex(rows, { key: "label", dir: "asc" });
  assert.deepEqual(sorted.map((r) => r.label), ["Avatar", "Banner"]);
});

// ── buildFilteredSortedIndex (end-to-end) ─────────────────────────────────────

test("buildFilteredSortedIndex runs flatten → filter → sort and reports counts", () => {
  const items = [codeItem(), templateItem()];
  const templates = [
    templateRow({ id: "x", status: "in_review", title: "Stuck" }),
    templateRow({ id: "y", status: "draft", title: "WIP" }),
  ];
  const { all, view, counts } = buildFilteredSortedIndex(
    items,
    templates,
    { ...emptyFacets(), source: "draft" },
    { key: "status", dir: "asc" },
  );
  assert.equal(all.length, 4);
  assert.equal(counts.total, 4);
  // Filtered to drafts (the two uncovered template rows), in_review first.
  assert.equal(view.length, 2);
  assert.equal(view[0].status, "in_review");
  assert.equal(view[1].status, "draft");
});
