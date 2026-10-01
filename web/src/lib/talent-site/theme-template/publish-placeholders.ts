/**
 * Integration seams for S7 (publish). Drafts are frozen on open and re-keyed
 * on save by the drafts store (S2 helpers via canonical.ts), so the tree-level
 * freeze/ensure here are identity; key validation and draft loading are the
 * real S2 / S3 modules.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { DesignPayload } from "../theme-catalog/types";
import { designKeyIssues as designKeyIssueRows } from "../theme-releases/design-keys";

export { loadThemeDraft } from "./drafts.server";

/** Draft trees already carry stable keys (drafts store); nothing to add here. */
export function ensureDesignKeys(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return [...tree];
}

/** Draft trees are frozen when the draft is opened (drafts store). */
export function freezeDesignKeys(tree: ReadonlyArray<BuilderNode>): BuilderNode[] {
  return [...tree];
}

/** Duplicate design keys within a sibling list, as plain preflight messages. */
export function designKeyIssues(payload: DesignPayload): string[] {
  return designKeyIssueRows(payload).map(
    (i) => `${i.tree}${i.parentKey ? `/${i.parentKey}` : ""}: design key "${i.key}" is used by ${i.nodeIds.length} blocks.`,
  );
}
