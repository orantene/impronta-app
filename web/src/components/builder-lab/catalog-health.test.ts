/**
 * catalog-health.test.ts (D8) — unit tests for the PURE Catalog-health analyzer.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:
 *   node_modules/.bin/tsx --test src/components/builder-lab/catalog-health.test.ts
 *
 * Covers each of the four buckets `analyzeCatalogHealth` derives:
 *   1. orphaned category    — template.category not in the taxonomy
 *   2. unsatisfiable binding — connected template whose data source can't
 *                              resolve on its target (roster-on-talent / unknown)
 *   3. dead weight          — published > staleDays ago with zero adoption
 *   4. asymmetric surface    — visible on one surface of a pair but not the other
 *
 * No React — exercises catalog-health.ts directly. `CatalogAdminItem` /
 * `BuilderTemplateRow` are type-only imports (erased), so the barrel CSS
 * side-effect never loads.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { CatalogAdminItem } from "@/lib/site-admin/add-gallery";
import type { BuilderTemplateRow } from "@/lib/site-admin/builder-core/templates/registry-rows";

import {
  analyzeCatalogHealth,
  type AnalyzeCatalogHealthInput,
  type CatalogHealthBucketKey,
} from "./catalog-health";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function codeItem(over: Partial<CatalogAdminItem> = {}): CatalogAdminItem {
  return {
    id: "el-button",
    tab: "elements",
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
    tab: "sections",
    targetContext: "talent",
    baseLabel: "Hero",
    baseCategory: "hero",
    effectiveLabel: "Hero Banner",
    effectiveCategory: "hero",
    ...over,
  });
}

function templateRow(over: Partial<BuilderTemplateRow> = {}): BuilderTemplateRow {
  return {
    id: "tmpl-1",
    kind: "section",
    status: "published",
    target_context: "both",
    title: "Hero",
    slug: "hero",
    description: null,
    category: "hero",
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

const NOW = Date.parse("2026-06-18T00:00:00Z");

/** Build the analyzer input with sensible defaults + a deterministic clock. */
function input(
  over: Partial<AnalyzeCatalogHealthInput> = {},
): AnalyzeCatalogHealthInput {
  return {
    rows: [],
    templates: [],
    templateUsage: {},
    nowMs: NOW,
    ...over,
  };
}

function bucket(
  report: ReturnType<typeof analyzeCatalogHealth>,
  key: CatalogHealthBucketKey,
) {
  const b = report.buckets.find((x) => x.key === key);
  assert.ok(b, `bucket ${key} present`);
  return b!;
}

// ── Bucket 1: orphaned category ───────────────────────────────────────────────

test("orphaned_category flags a template whose category is not in the taxonomy", () => {
  // A code item establishes "buttons" as an in-taxonomy category. The template
  // uses "phantom-cat", which no code item declares ⇒ orphaned.
  const report = analyzeCatalogHealth(
    input({
      rows: [codeItem({ baseCategory: "buttons", effectiveCategory: "buttons" })],
      templates: [templateRow({ id: "t-orphan", category: "phantom-cat" })],
    }),
  );
  const b = bucket(report, "orphaned_category");
  assert.equal(b.issues.length, 1);
  assert.equal(b.issues[0].dbTemplateId, "t-orphan");
  assert.match(b.issues[0].detail, /phantom-cat/);
});

test("orphaned_category does NOT flag a template using a known code-item category", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [codeItem({ baseCategory: "hero", effectiveCategory: "hero" })],
      templates: [templateRow({ id: "t-ok", category: "Hero" })], // case-insensitive
    }),
  );
  assert.equal(bucket(report, "orphaned_category").issues.length, 0);
});

test("orphaned_category honors knownCategories (admin-created structure cats)", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [],
      templates: [templateRow({ id: "t", category: "custom-shelf" })],
      knownCategories: ["custom-shelf"],
    }),
  );
  assert.equal(bucket(report, "orphaned_category").issues.length, 0);
});

// ── Bucket 2: unsatisfiable binding ───────────────────────────────────────────

test("unsatisfiable_binding flags a talent-target template needing a roster source", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-roster",
          target_context: "talent",
          data_binding_requirements: ["featured_talent_profiles"],
        }),
      ],
    }),
  );
  const b = bucket(report, "unsatisfiable_binding");
  assert.equal(b.issues.length, 1);
  assert.equal(b.issues[0].dbTemplateId, "t-roster");
  assert.match(b.issues[0].detail, /roster/i);
});

test("unsatisfiable_binding flags an unknown/dropped data source key", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-unknown",
          target_context: "workspace",
          // not in BUILDER_DATA_SOURCE_REGISTRY — cast through unknown for the test
          data_binding_requirements: [
            "ghost_source" as unknown as BuilderTemplateRow["data_binding_requirements"][number],
          ],
        }),
      ],
    }),
  );
  const b = bucket(report, "unsatisfiable_binding");
  assert.equal(b.issues.length, 1);
  assert.match(b.issues[0].detail, /unknown data source/i);
});

test("unsatisfiable_binding does NOT flag a workspace template using a roster source", () => {
  // Roster sources are fine on a workspace target — only talent targets lack a roster.
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-ws",
          target_context: "workspace",
          data_binding_requirements: ["featured_talent_profiles"],
        }),
      ],
    }),
  );
  assert.equal(bucket(report, "unsatisfiable_binding").issues.length, 0);
});

test("unsatisfiable_binding ignores tenant-specific collection: keys", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-coll",
          target_context: "talent",
          data_binding_requirements: [
            "collection:abc" as unknown as BuilderTemplateRow["data_binding_requirements"][number],
          ],
        }),
      ],
    }),
  );
  assert.equal(bucket(report, "unsatisfiable_binding").issues.length, 0);
});

// ── Bucket 3: dead weight ─────────────────────────────────────────────────────

test("dead_weight flags a published template older than staleDays with zero adoption", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-stale",
          status: "published",
          published_at: "2026-01-01T00:00:00Z", // ~168 days before NOW
        }),
      ],
      templateUsage: {}, // never applied
      staleDays: 90,
    }),
  );
  const b = bucket(report, "dead_weight");
  assert.equal(b.issues.length, 1);
  assert.equal(b.issues[0].dbTemplateId, "t-stale");
  assert.match(b.issues[0].detail, /never applied/i);
});

test("dead_weight does NOT flag a stale template that HAS adoption", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-used",
          status: "published",
          published_at: "2026-01-01T00:00:00Z",
        }),
      ],
      templateUsage: { "t-used": { appliedCount: 3, tenantCount: 2 } },
      staleDays: 90,
    }),
  );
  assert.equal(bucket(report, "dead_weight").issues.length, 0);
});

test("dead_weight does NOT flag a recently-published template", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-fresh",
          status: "published",
          published_at: "2026-06-10T00:00:00Z", // 8 days before NOW
        }),
      ],
      templateUsage: {},
      staleDays: 90,
    }),
  );
  assert.equal(bucket(report, "dead_weight").issues.length, 0);
});

test("dead_weight ignores drafts and un-published templates", () => {
  const report = analyzeCatalogHealth(
    input({
      templates: [
        templateRow({
          id: "t-draft",
          status: "draft",
          published_at: null,
        }),
        templateRow({
          id: "t-archived",
          status: "archived",
          published_at: "2026-01-01T00:00:00Z",
        }),
      ],
      staleDays: 90,
    }),
  );
  assert.equal(bucket(report, "dead_weight").issues.length, 0);
});

// ── Bucket 4: asymmetric surface ──────────────────────────────────────────────

test("asymmetric_surface flags a row visible on talent profile but not talent shell", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [
        codeItem({
          id: "el-asym",
          surfaceVisible: {
            talent_profile: true,
            talent_shell: false,
            workspace_page: true,
            workspace_shell: true,
          },
        }),
      ],
    }),
  );
  const b = bucket(report, "asymmetric_surface");
  assert.equal(b.issues.length, 1);
  assert.equal(b.issues[0].rowId, "el-asym");
  assert.match(b.issues[0].detail, /talent/i);
});

test("asymmetric_surface flags a workspace page/shell mismatch", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [
        codeItem({
          id: "el-ws-asym",
          surfaceVisible: {
            talent_profile: true,
            talent_shell: true,
            workspace_page: false,
            workspace_shell: true,
          },
        }),
      ],
    }),
  );
  const b = bucket(report, "asymmetric_surface");
  assert.equal(b.issues.length, 1);
  assert.match(b.issues[0].detail, /workspace/i);
});

test("asymmetric_surface does NOT flag a symmetric row", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [
        codeItem({
          surfaceVisible: {
            talent_profile: true,
            talent_shell: true,
            workspace_page: false,
            workspace_shell: false,
          },
        }),
      ],
    }),
  );
  assert.equal(bucket(report, "asymmetric_surface").issues.length, 0);
});

// ── Aggregate ────────────────────────────────────────────────────────────────

test("analyzeCatalogHealth totals issues across all four buckets + jump targets", () => {
  const report = analyzeCatalogHealth(
    input({
      rows: [
        codeItem({ baseCategory: "buttons", effectiveCategory: "buttons" }),
        // asymmetric row (also a gallery template row, so it carries a jump target)
        templateItem({
          id: "db-template:t-asym",
          dbTemplateId: "t-asym",
          surfaceVisible: {
            talent_profile: false,
            talent_shell: true,
            workspace_page: true,
            workspace_shell: true,
          },
        }),
      ],
      templates: [
        templateRow({ id: "t-orphan", category: "nope" }), // orphan
        templateRow({
          id: "t-bind",
          target_context: "talent",
          data_binding_requirements: ["tenant_directory_search"],
        }), // unsatisfiable
        templateRow({
          id: "t-stale",
          published_at: "2026-01-01T00:00:00Z",
        }), // dead weight
      ],
      templateUsage: {},
    }),
  );
  // 1 orphan + 1 unsatisfiable + (t-stale + the other category-less? no) ...
  assert.equal(bucket(report, "orphaned_category").issues.length >= 1, true);
  assert.equal(bucket(report, "unsatisfiable_binding").issues.length, 1);
  assert.equal(bucket(report, "dead_weight").issues.length >= 1, true);
  assert.equal(bucket(report, "asymmetric_surface").issues.length, 1);
  // totalIssues == sum of bucket lengths
  const sum = report.buckets.reduce((n, b) => n + b.issues.length, 0);
  assert.equal(report.totalIssues, sum);
  assert.ok(sum >= 4);

  // The asymmetric row exposes its catalog rowId so a click can reuse the jump.
  const asym = bucket(report, "asymmetric_surface").issues[0];
  assert.equal(asym.rowId, "db-template:t-asym");
});
