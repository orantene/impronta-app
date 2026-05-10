import type { BuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import { filterKindsForShippedElementCatalog } from "./mvp-allow-list";
import type { BuilderNodeOperationKind } from "./operations";
import type { BuilderNodeKind } from "./types";

/**
 * Phase 7A — Advanced Mode surfaces that insert **persisted** builder nodes
 * from the governed library (vs Simple Mode section templates).
 *
 * Rollout: paid workspace plans expose nested composition affordances; **free**
 * stays template-first until upgrade. Per-tenant DB kill-switch can layer on
 * later (`agencies` feature JSON) — call sites should always check this helper
 * rather than inlining plan checks.
 */
export function isAdvancedElementLibraryEnabledForPlan(
  plan: BuilderWorkspacePlan,
): boolean {
  return plan !== "free";
}

/**
 * When Advanced element composition is **disabled** (e.g. free plan), hide all
 * nested block insert affordances — operators still use the section library +
 * template flows (`insertSection`).
 */
export function filterKindsForAdvancedElementLibrary(
  kinds: ReadonlyArray<BuilderNodeKind>,
  advancedElementLibraryEnabled: boolean,
): BuilderNodeKind[] {
  if (!advancedElementLibraryEnabled) {
    return [];
  }
  return [...kinds];
}

/** Plan gate + shipped 7A catalog — use for every nested insert surface. */
export function gateNestedInsertKinds(
  kinds: ReadonlyArray<BuilderNodeKind>,
  advancedElementLibraryEnabled: boolean,
): BuilderNodeKind[] {
  return filterKindsForAdvancedElementLibrary(
    filterKindsForShippedElementCatalog(kinds),
    advancedElementLibraryEnabled,
  );
}

/**
 * Blocks **insert / paste / duplicate** when Advanced composition is off (e.g. free plan).
 * Move, remove, and patch stay allowed so existing nested trees remain editable.
 */
export function assertAdvancedLibraryAllowsOperation(
  operation: BuilderNodeOperationKind,
  advancedElementLibraryEnabled: boolean,
): { ok: true } | { ok: false; message: string } {
  if (advancedElementLibraryEnabled) return { ok: true };
  if (operation === "insert" || operation === "paste" || operation === "duplicate") {
    return {
      ok: false,
      message:
        "Adding or duplicating nested blocks requires a paid workspace plan. Upgrade for Advanced composition, or add sections from the library.",
    };
  }
  return { ok: true };
}
