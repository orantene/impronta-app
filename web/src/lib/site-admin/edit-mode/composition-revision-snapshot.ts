/**
 * Pure helpers for reading builder extras from `cms_page_revisions.snapshot`.
 * Kept OUT of `composition-actions.ts` because that file is `"use server"` and
 * Next.js requires every export there to be an async Server Action.
 */

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import type {
  BuilderStyleClass,
  BuilderStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes";

function isStyleClass(value: unknown): value is BuilderStyleClass {
  return (
    Boolean(value) &&
    typeof (value as BuilderStyleClass).id === "string" &&
    typeof (value as BuilderStyleClass).name === "string" &&
    Boolean((value as BuilderStyleClass).style)
  );
}

/** Parse linked style classes stored alongside builderTree in revision snapshots. */
export function parseStyleClassesFromSnapshot(
  snapshot: unknown,
): BuilderStyleClassRegistry | undefined {
  if (!snapshot || typeof snapshot !== "object" || !("styleClasses" in snapshot)) {
    return undefined;
  }
  const raw = (snapshot as { styleClasses: unknown }).styleClasses;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, BuilderStyleClass> = {};
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (isStyleClass(val)) out[id] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseBuilderTreeFromSnapshot(
  snapshot: unknown,
): BuilderNodeTree | undefined {
  if (!snapshot || typeof snapshot !== "object" || !("builderTree" in snapshot)) {
    return undefined;
  }
  const tree = (snapshot as { builderTree: unknown }).builderTree;
  return Array.isArray(tree) && tree.length > 0 ? (tree as BuilderNodeTree) : undefined;
}
