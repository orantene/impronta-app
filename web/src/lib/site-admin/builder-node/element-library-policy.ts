import type { BuilderWorkspacePlan } from "@/lib/site-admin/builder-capabilities";
import {
  filterKindsForOwnerOnlyAccess,
  filterKindsForShippedElementCatalog,
} from "./mvp-allow-list";
import type { BuilderNodeOperationKind } from "./operations";
import type { BuilderNodeKind } from "./types";

/**
 * Phase 7A — Advanced Mode surfaces that insert **persisted** builder nodes
 * from the governed library (vs Simple Mode section templates).
 *
 * Rollout: paid workspace plans expose nested composition affordances; **free**
 * stays template-first until upgrade. Per-tenant DB kill-switch layered on
 * top of the plan rule — call sites should always check this helper rather
 * than inlining plan checks.
 *
 * Plan-only signature (no tenant override) — preserved for back-compat with
 * existing call sites + tests. New call sites should prefer
 * `resolveAdvancedElementLibraryEnabled` below to pick up the per-tenant
 * override loaded from `agency_entitlements.element_library_override`.
 */
export function isAdvancedElementLibraryEnabledForPlan(
  plan: BuilderWorkspacePlan,
): boolean {
  return plan !== "free";
}

/**
 * P7A-5 — Resolve effective 7A enablement with tenant override.
 *
 * Tri-state resolution:
 *   - override === true   → force-enable regardless of plan (beta opt-in)
 *   - override === false  → force-disable regardless of plan (kill switch)
 *   - override == null    → fall back to plan rule
 *
 * Loaders that fetch the tenant's entitlements row (server-side bridge)
 * pass the override column through to this resolver. Client-side call
 * sites read `advancedElementLibraryEnabled` from the EditContext, which
 * is computed once at provider mount using this function.
 */
export function resolveAdvancedElementLibraryEnabled(
  plan: BuilderWorkspacePlan,
  override: boolean | null | undefined,
): boolean {
  if (override === true) return true;
  if (override === false) return false;
  return isAdvancedElementLibraryEnabledForPlan(plan);
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

/**
 * Plan gate + shipped 7A catalog + owner-only gate — use for every nested
 * insert surface. `canInsertOwnerOnly` defaults to false (default-deny), so
 * raw-HTML `code` only appears for platform owners (super_admin); every
 * existing 2-arg call site keeps excluding it automatically.
 */
export function gateNestedInsertKinds(
  kinds: ReadonlyArray<BuilderNodeKind>,
  advancedElementLibraryEnabled: boolean,
  canInsertOwnerOnly = false,
): BuilderNodeKind[] {
  return filterKindsForOwnerOnlyAccess(
    filterKindsForAdvancedElementLibrary(
      filterKindsForShippedElementCatalog(kinds),
      advancedElementLibraryEnabled,
    ),
    canInsertOwnerOnly,
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
