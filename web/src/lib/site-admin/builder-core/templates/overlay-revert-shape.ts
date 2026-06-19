/**
 * overlay-revert-shape.ts — PURE (no "use server", no DB) helpers for G7's
 * per-row overlay REVERT. Split out of `catalog-overlay-actions.ts` so the
 * "pick the revert-target snapshot from an audit-row list" logic and the
 * snapshot→overlay-input reconstruction stay unit-testable without a Supabase
 * client.
 *
 * G7 reuses G1's `builder_lab_audit` rows: each overlay write appended a row
 * whose `before` JSON is the FULL pre-write `builder_catalog_overlay` row (or
 * null when the item had no overlay yet). Reverting one item means re-applying
 * the `before` snapshot of a chosen audit row — written back through the normal
 * overlay writer so the revert ALSO appends its own audit row and re-runs the
 * X3 tighten-only guard + X4/X6 dual-write.
 */

import type {
  CatalogOverlayRow,
  SetCatalogOverlayInput,
} from "@/lib/site-admin/add-gallery/registry-db-merge";
import type { BuilderLabAuditEntry } from "./builder-lab-audit-shape";

/** The overlay-mutating audit actions a per-item revert can target. */
const OVERLAY_ACTIONS = new Set(["overlay.set", "overlay.clear"]);

/** The plan: either re-apply a captured overlay snapshot, or clear the overlay
 *  (when the chosen audit row's `before` was null = item had no overlay then). */
export interface OverlayRevertPlan {
  /** The audit row we are reverting TO (its `before` is the target state). */
  auditId: string;
  /** When non-null, the overlay row to write back. When null, the target state
   *  was "no overlay" → the revert clears the overlay entirely. */
  snapshot: CatalogOverlayRow | null;
  /** Stable item key the snapshot applies to (for the writer + the new audit). */
  itemRef: string;
  /** ISO timestamp of the audit row we are reverting to (for UI labelling). */
  createdAt: string;
}

/**
 * Narrow an unknown audit `before`/`after` value to a CatalogOverlayRow. The
 * audit log stores the full overlay row as JSON; we accept anything carrying the
 * required `item_ref` + `source` keys and trust the column shape (the writer
 * round-trips it through the same upsert, which ignores unknown keys).
 */
export function isOverlaySnapshot(value: unknown): value is CatalogOverlayRow {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.item_ref === "string" && typeof v.source === "string";
}

/**
 * Pick which audit row's `before` snapshot a revert should restore.
 *
 * Given the reverse-chron (newest-first) audit entries for ONE item and the
 * `auditId` the admin clicked "revert to", return the plan: the chosen entry's
 * `before` is the state we restore. We deliberately revert to the row's `before`
 * (the state that existed JUST BEFORE that change) so "revert this item to its
 * state on (date)" reads as "undo this change and everything after it".
 *
 * Returns null when:
 *  - the id isn't in the list,
 *  - the chosen entry isn't an overlay action (lifecycle rows aren't overlay
 *    snapshots), or
 *  - the `before` is present but malformed (not an overlay row shape) — a null
 *    `before` is VALID (it means "revert to no overlay" → clear).
 */
export function pickRevertPlanFromAudit(
  entries: ReadonlyArray<BuilderLabAuditEntry>,
  auditId: string,
): OverlayRevertPlan | null {
  const entry = entries.find((e) => e.id === auditId);
  if (!entry) return null;
  if (!OVERLAY_ACTIONS.has(entry.action)) return null;

  // before === null is the legitimate "item had no overlay then" case.
  if (entry.before === null || entry.before === undefined) {
    return {
      auditId,
      snapshot: null,
      itemRef: entry.itemRef ?? "",
      createdAt: entry.createdAt,
    };
  }
  if (!isOverlaySnapshot(entry.before)) return null;
  return {
    auditId,
    snapshot: entry.before,
    itemRef: entry.before.item_ref,
    createdAt: entry.createdAt,
  };
}

/**
 * Reconstruct a `setComponentOverlay` input from a captured overlay snapshot.
 * Carries EVERY governance column forward (the legacy 2-toggle pair, the X4
 * 4-surface quad, the X6 lab axis, and all the override/Studio columns) so the
 * revert restores the item's full state in ONE write — re-applying just the
 * deltas would leave any column the bad tweak DIDN'T touch unchanged, which is
 * exactly the bug G7 fixes. Undefined optional columns are passed through as the
 * writer's `assign` only writes defined keys.
 */
export function snapshotToOverlayInput(
  snapshot: CatalogOverlayRow,
): SetCatalogOverlayInput {
  return {
    item_ref: snapshot.item_ref,
    source: snapshot.source,
    talent_enabled: snapshot.talent_enabled,
    workspace_enabled: snapshot.workspace_enabled,
    talent_profile_enabled: snapshot.talent_profile_enabled,
    talent_shell_enabled: snapshot.talent_shell_enabled,
    workspace_page_enabled: snapshot.workspace_page_enabled,
    workspace_shell_enabled: snapshot.workspace_shell_enabled,
    lab_enabled: snapshot.lab_enabled,
    label_override: snapshot.label_override,
    icon_override: snapshot.icon_override,
    category_override: snapshot.category_override,
    required_plan_override: snapshot.required_plan_override,
    availability_override: snapshot.availability_override,
    default_variant: snapshot.default_variant ?? null,
    default_props: snapshot.default_props ?? null,
    data_source_defaults: snapshot.data_source_defaults ?? null,
    locked_props: snapshot.locked_props ?? null,
  };
}
