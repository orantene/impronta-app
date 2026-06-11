/**
 * registry-rows.ts — DB row types for the builder_templates /
 * builder_template_revisions tables, plus the `computeDataBindingRequirements`
 * tree-walker that all write actions call before persisting.
 *
 * Kept pure (no I/O, no "use server") so tests can import it in the node
 * runner without Next.js bootstrapping.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { BuilderDataSourceKey } from "@/lib/site-admin/builder-node/data-bindings";
import {
  getBuilderNodeDataBinding,
  isCollectionDataSourceKey,
  BUILDER_COLLECTION_SOURCE_PREFIX,
} from "@/lib/site-admin/builder-node/data-bindings";

// ── Enum mirrors (keep in sync with the migration) ───────────────────────────

export type BuilderTemplateKind =
  | "element"
  | "section"
  | "connected"
  | "page_template"
  | "starter_kit";

export type BuilderTemplateStatus = "draft" | "in_review" | "published" | "archived";

export type BuilderTemplateTarget = "talent" | "workspace" | "both" | "platform";

export type BuilderGalleryTab = "sections" | "elements" | "connected" | "page_templates";

// ── DB row types ──────────────────────────────────────────────────────────────

/**
 * Full row as returned from `builder_templates` SELECT *.
 * All nullable columns that map to `NULL` in SQL are typed `T | null`.
 */
export interface BuilderTemplateRow {
  id: string;
  kind: BuilderTemplateKind;
  status: BuilderTemplateStatus;
  target_context: BuilderTemplateTarget;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  gallery_tab: BuilderGalleryTab;
  tags: string[];
  thumbnail_asset_id: string | null;
  hero_asset_id: string | null;
  required_plan: "free" | "studio" | "agency" | "network";
  required_talent_tier: string | null;
  builder_tree: BuilderNode[];
  theme_tokens: Record<string, unknown> | null;
  data_binding_requirements: BuilderDataSourceKey[];
  schema_version: number;
  version: number;
  published_at: string | null;
  source_tenant_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full row as returned from `builder_template_revisions` SELECT *.
 */
export interface BuilderTemplateRevisionRow {
  id: string;
  template_id: string;
  version: number;
  status: BuilderTemplateStatus;
  /** Full BuilderTemplateRow snapshot at publish time. */
  snapshot: BuilderTemplateRow;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Input shapes for write actions ───────────────────────────────────────────

/** Minimal required fields for createTemplateDraft. */
export interface CreateTemplateDraftInput {
  kind: BuilderTemplateKind;
  title: string;
  slug: string;
  category: string;
  gallery_tab: BuilderGalleryTab;
  target_context?: BuilderTemplateTarget;
  description?: string | null;
  tags?: string[];
  required_plan?: "free" | "studio" | "agency" | "network";
  required_talent_tier?: string | null;
  builder_tree?: BuilderNode[];
  theme_tokens?: Record<string, unknown> | null;
  source_tenant_id?: string | null;
  thumbnail_asset_id?: string | null;
  hero_asset_id?: string | null;
}

/** Partial update — all optional except id. */
export type UpdateTemplateDraftInput = Partial<
  Omit<
    CreateTemplateDraftInput,
    "kind" // kind is immutable after creation
  >
> & {
  id: string;
  builder_tree?: BuilderNode[];
};

/** Filters for listPublishedTemplates — all optional. */
export interface ListPublishedTemplatesFilter {
  /** Only return templates visible on this surface. */
  targetContext?: BuilderTemplateTarget | null;
  /** Only return templates on this gallery tab. */
  galleryTab?: BuilderGalleryTab | null;
  /** Only return templates whose required_plan rank ≤ this plan. */
  plan?: "free" | "studio" | "agency" | "network" | null;
  /**
   * Only return templates whose data_binding_requirements are all contained
   * in the provided set. Null / empty ⇒ no filtering on data sources.
   */
  dataSources?: BuilderDataSourceKey[] | null;
}

// ── computeDataBindingRequirements ────────────────────────────────────────────

/**
 * Walk a freeform BuilderNode tree and return the distinct
 * `BuilderDataSourceKey[]` referenced by any data-bound node.
 *
 * Rules:
 * - `section` and `container` nodes carry `props.dataBinding.sourceKey`.
 * - `collection:<id>` keys are included verbatim (WS4 handles reminting).
 * - Keys are deduped; order is stable (depth-first pre-order).
 *
 * This is called by every write action that persists `builder_tree` so
 * `data_binding_requirements` is always accurate at rest.
 */
export function computeDataBindingRequirements(
  tree: ReadonlyArray<BuilderNode>,
): BuilderDataSourceKey[] {
  const seen = new Set<string>();
  const result: BuilderDataSourceKey[] = [];

  function visit(node: BuilderNode): void {
    const binding = getBuilderNodeDataBinding(node);
    if (binding?.sourceKey) {
      const key = binding.sourceKey;
      if (!seen.has(key)) {
        seen.add(key);
        // collection: keys are opaque — include as-is; callers can filter them
        // with isCollectionDataSourceKey() if needed.
        result.push(key as BuilderDataSourceKey);
      }
    }

    // Recurse into children (section, container, split, accordion_item, etc.)
    const children = (node as { children?: BuilderNode[] }).children;
    if (Array.isArray(children)) {
      for (const child of children) {
        visit(child);
      }
    }
  }

  for (const node of tree) {
    visit(node);
  }

  return result;
}

// ── Plan rank helper (mirrors data-bindings.ts PLAN_RANK) ────────────────────

const PLAN_RANK: Record<string, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

/**
 * Returns true if `templatePlan` is available under `userPlan`.
 * e.g. templatePlan='studio', userPlan='agency' → true.
 */
export function templatePlanAllowed(
  templatePlan: string,
  userPlan: string | null | undefined,
): boolean {
  const required = PLAN_RANK[templatePlan] ?? 99;
  const current = PLAN_RANK[userPlan ?? "free"] ?? 0;
  return current >= required;
}

/**
 * Collect only the standard (non-collection) BuilderDataSourceKey values
 * from a set of requirements. Useful for plan-gating.
 */
export function standardDataSourceKeys(
  requirements: ReadonlyArray<BuilderDataSourceKey>,
): BuilderDataSourceKey[] {
  return requirements.filter(
    (k) => !isCollectionDataSourceKey(k),
  );
}

/**
 * Re-export the collection prefix so callers of this module don't need to
 * import from data-bindings directly.
 */
export { isCollectionDataSourceKey, BUILDER_COLLECTION_SOURCE_PREFIX };
