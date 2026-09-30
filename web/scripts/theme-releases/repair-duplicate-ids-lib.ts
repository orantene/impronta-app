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

const DEMO_CODES = new Set(["TAL-93900"]); // Jorg Beauty
const QA_CODES = new Set(["TAL-93901"]); // Valeria

/** Bucket by profile code (not by the is_test_account flag). */
export function classify(code: string): "demo" | "qa" | "real" {
  if (DEMO_CODES.has(code)) return "demo";
  return QA_CODES.has(code) || /QA/i.test(code) ? "qa" : "real";
}
