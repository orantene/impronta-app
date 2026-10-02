/**
 * Pure helpers for repair-duplicate-ids.mts (kept apart so tests import them
 * without a database client).
 */
import { dedupeTreeIds, findDuplicateNodeIds } from "../../src/lib/site-admin/builder-node/unique-ids";

export type Finding = { where: string; duplicates: string[] };

/** Duplicate ids in one tree, or null when the tree is clean or not an array. */
export function scanTree(where: string, tree: unknown): Finding | null {
  if (!Array.isArray(tree)) return null;
  const duplicates = findDuplicateNodeIds(tree);
  return duplicates.length > 0 ? { where, duplicates } : null;
}

export function repairTree(tree: unknown): { tree: unknown; remapped: number } {
  return Array.isArray(tree) ? dedupeTreeIds(tree) : { tree, remapped: 0 };
}

/** Non-demo QA accounts (is_demo=false). Everything else that is not a demo is "real". */
export const QA_CODES = new Set(["TAL-93900", "TAL-93901", "TAL-QAFIXFREE"]);

/** Bucket by `talent_profiles.is_demo`, then the explicit QA allow-list. */
export function classify(code: string, isDemo: boolean): "demo" | "qa" | "real" {
  if (isDemo) return "demo";
  return QA_CODES.has(code) ? "qa" : "real";
}

/** Only demos and allow-listed QA accounts may ever be rewritten. */
export function mayRepair(code: string, isDemo: boolean): boolean {
  return classify(code, isDemo) !== "real";
}
