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
  // Builder Studio (Wave 0 plumbing; behavior in WS-C/WS-D). Optional so existing
  // row constructors/tests don't need updating; the DB always supplies them.
  default_props?: Record<string, unknown> | null;
  locked_props?: string[];
  data_source_defaults?: Record<string, unknown> | null;
  rollout_percentage?: number;
  tenant_allowlist?: string[];
  tenant_denylist?: string[];
  changelog?: string | null;
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

// ── Publish / rollback version + note helpers (pure) ─────────────────────────

/**
 * The version a publish (or rollback re-publish) lands on: always one past the
 * current row version. History is forward-only — we never reuse or rewind a
 * version number, even when rolling back to an older revision's content.
 */
export function nextPublishedVersion(currentVersion: number): number {
  return currentVersion + 1;
}

/**
 * The audit note stamped on a rollback's revision snapshot. Kept pure + shared
 * so the action and its tests agree on the exact wording.
 */
export function rollbackRevisionNote(targetVersion: number): string {
  return `Rolled back to v${targetVersion}`;
}

/**
 * Normalize a publish-time changelog/note string (WS-D D4) into the value to
 * persist. Pure + shared so the publish action and its tests agree on the rule:
 *   - `undefined` ⇒ `undefined` (caller skips the column — leaves it untouched)
 *   - blank / whitespace-only ⇒ `null` (explicitly clears it)
 *   - otherwise ⇒ the trimmed string
 */
export function normalizeChangelog(
  raw: string | null | undefined,
): string | null | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

// ── Staged-rollout input normalizer (WS-D D3, pure) ──────────────────────────

/** Input for the `setTemplateRollout` action. All fields optional. */
export interface SetTemplateRolloutInput {
  rollout_percentage?: number;
  tenant_allowlist?: string[];
  tenant_denylist?: string[];
}

/** A simple UUID v4-ish shape check so a fat-fingered tenant id is dropped
 *  rather than persisted as a poison value the bucket can never match. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trim, lowercase, dedupe, and keep only well-formed UUIDs. PURE. */
export function normalizeTenantIdList(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    const id = v.trim().toLowerCase();
    if (id && UUID_RE.test(id)) seen.add(id);
  }
  return [...seen];
}

/**
 * Normalize a `setTemplateRollout` input into the exact column patch to persist.
 * PURE + shared so the action and its tests agree:
 *   - percentage is clamped to [0, 100] and rounded; omitted ⇒ column untouched.
 *   - allow/deny lists are trimmed/lowercased/deduped/UUID-filtered; omitted ⇒
 *     column untouched. A tenant id in BOTH lists is dropped from the allowlist
 *     (deny wins) so the persisted state matches the runtime decision order.
 */
export function normalizeRolloutPatch(
  input: SetTemplateRolloutInput,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (input.rollout_percentage !== undefined) {
    const n = Math.round(input.rollout_percentage);
    patch.rollout_percentage = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 100));
  }

  const deny =
    input.tenant_denylist !== undefined
      ? normalizeTenantIdList(input.tenant_denylist)
      : undefined;
  const allow =
    input.tenant_allowlist !== undefined
      ? normalizeTenantIdList(input.tenant_allowlist)
      : undefined;

  if (deny !== undefined) patch.tenant_denylist = deny;
  if (allow !== undefined) {
    // Deny wins: a tenant in both lists is removed from the allowlist so the
    // stored state can't imply a contradiction. Only de-conflict against deny
    // ids we know about (the incoming deny list, else the existing one is left
    // to the runtime gate, which already prefers deny).
    const denySet = new Set(deny ?? []);
    patch.tenant_allowlist = allow.filter((id) => !denySet.has(id));
  }

  return patch;
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
