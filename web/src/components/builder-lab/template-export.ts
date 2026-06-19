/**
 * template-export.ts (A3) — portable template/starter JSON serializer.
 *
 * `toPortableTemplateJson` strips non-portable DB/lifecycle fields and returns
 * only the fields that make sense to re-import into another environment:
 *
 *   kind, title, slug, description, category, gallery_tab, target_context,
 *   required_plan, tags, theme_tokens, builder_tree, schema_version
 *
 * EXCLUDED (non-portable): id, status, version, created_by, published_at,
 * rollout_percentage, tenant_allowlist, tenant_denylist, and all other DB
 * housekeeping columns (created_at, updated_at, source_tenant_id, etc.).
 *
 * `triggerTemplateDownload` serializes and triggers a client-side Blob download
 * as `<slug>.template.json`. Call from a click handler in the browser only.
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type {
  BuilderTemplateRow,
  BuilderTemplateKind,
  BuilderGalleryTab,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

// ── Allow-list ────────────────────────────────────────────────────────────────

/**
 * The exact set of portable field keys, in a stable order.
 * This is the single source of truth — the serializer uses it and tests assert
 * against it so the two can never drift.
 */
export const PORTABLE_TEMPLATE_KEYS = [
  "kind",
  "title",
  "slug",
  "description",
  "category",
  "gallery_tab",
  "target_context",
  "required_plan",
  "tags",
  "theme_tokens",
  "builder_tree",
  "schema_version",
] as const;

export type PortableTemplateKey = (typeof PORTABLE_TEMPLATE_KEYS)[number];

// ── Portable shape ────────────────────────────────────────────────────────────

export interface PortableTemplate {
  kind: BuilderTemplateKind;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  gallery_tab: BuilderGalleryTab;
  target_context: BuilderTemplateTarget;
  required_plan: "free" | "studio" | "agency" | "network";
  tags: string[];
  theme_tokens: Record<string, unknown> | null;
  builder_tree: BuilderNode[];
  schema_version: number;
}

// ── Serializer ────────────────────────────────────────────────────────────────

/**
 * Extract portable fields from a `BuilderTemplateRow`.
 *
 * The optional `tree` argument overrides `row.builder_tree` — pass it when
 * the caller has fetched a fresh tree from `getTemplateById` (e.g. for
 * built-in starters whose tree may have been patched on-disk since the DB row
 * was last synced).
 *
 * PURE — no I/O; safe to call in tests.
 */
export function toPortableTemplateJson(
  row: BuilderTemplateRow,
  tree?: BuilderNode[],
): PortableTemplate {
  return {
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    description: row.description ?? null,
    category: row.category,
    gallery_tab: row.gallery_tab,
    target_context: row.target_context,
    required_plan: row.required_plan,
    tags: [...(row.tags ?? [])],
    theme_tokens: row.theme_tokens ?? null,
    builder_tree: tree ?? row.builder_tree ?? [],
    schema_version: row.schema_version,
  };
}

// ── Download trigger (browser-only) ──────────────────────────────────────────

/**
 * Serialize `row` (optionally with an override `tree`) and trigger a browser
 * download of `<slug>.template.json`. Must be called from a click handler
 * (or other user-gesture context) in the browser.
 */
export function triggerTemplateDownload(
  row: BuilderTemplateRow,
  tree?: BuilderNode[],
): void {
  const portable = toPortableTemplateJson(row, tree);
  const json = JSON.stringify(portable, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${row.slug}.template.json`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Clean up synchronously — the click is enough to schedule the download.
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
