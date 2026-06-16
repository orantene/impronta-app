/**
 * catalog-governance — PURE helpers that summarize a catalog row's admin
 * overrides into legible "governance chips". Split out of component-catalog.tsx
 * so the chip logic is unit-testable (and reused by catalog-row-table.tsx).
 *
 * A row's `overlay` carries every admin override (label/icon/category renames,
 * plan gate, locked props, default variant, default props, data-source
 * defaults). The catalog used to flag ANY override with a single tiny dot; these
 * helpers instead derive a typed, labeled list so the table can render a clear
 * chip per governance dimension ("🔒 2 locked", "defaults", "variant", …).
 */

import type { CatalogOverlayRow } from "@/lib/site-admin/add-gallery";

/** The governance dimensions surfaced as row chips, in display order. */
export type GovernanceChipKind =
  | "locked"
  | "defaults"
  | "variant"
  | "data"
  | "plan";

export interface GovernanceChip {
  kind: GovernanceChipKind;
  /** Short label shown in the chip (already includes any count). */
  label: string;
  /** Longer hover description. */
  title: string;
}

/** True when the JSON-object override is a non-empty record. */
function hasObjectEntries(v: Record<string, unknown> | null | undefined): boolean {
  return Boolean(v) && Object.keys(v as Record<string, unknown>).length > 0;
}

/**
 * Derive the governance chips for a row from its overlay. Returns [] when the
 * row has no governance-relevant overrides (a plain rename alone is NOT a
 * governance chip — that already shows as the effective label). Order is stable:
 * locked → defaults → variant → data → plan.
 */
export function governanceChips(
  overlay: CatalogOverlayRow | null | undefined,
): GovernanceChip[] {
  if (!overlay) return [];
  const chips: GovernanceChip[] = [];

  const lockedCount = overlay.locked_props?.length ?? 0;
  if (lockedCount > 0) {
    chips.push({
      kind: "locked",
      label: `🔒 ${lockedCount} locked`,
      title: `${lockedCount} prop${lockedCount === 1 ? "" : "s"} locked — tenants can't edit these once inserted`,
    });
  }

  if (hasObjectEntries(overlay.default_props)) {
    chips.push({
      kind: "defaults",
      label: "defaults",
      title: "Default props are merged over the component's defaults at insert",
    });
  }

  if (overlay.default_variant && overlay.default_variant.trim()) {
    chips.push({
      kind: "variant",
      label: `variant: ${overlay.default_variant.trim()}`,
      title: `Default variant "${overlay.default_variant.trim()}" applied at insert`,
    });
  }

  if (hasObjectEntries(overlay.data_source_defaults)) {
    chips.push({
      kind: "data",
      label: "data defaults",
      title: "Data-source defaults merged into the connected component's binding at insert",
    });
  }

  if (overlay.required_plan_override) {
    chips.push({
      kind: "plan",
      label: `plan: ${overlay.required_plan_override}`,
      title: `Required plan tightened to "${overlay.required_plan_override}"`,
    });
  }

  return chips;
}

/** True when the row has any admin override at all (governance OR cosmetic) —
 *  the broad signal the "Reset" affordance keys off. */
export function hasAnyOverride(
  overlay: CatalogOverlayRow | null | undefined,
): boolean {
  if (!overlay) return false;
  return (
    governanceChips(overlay).length > 0 ||
    Boolean(overlay.label_override) ||
    Boolean(overlay.icon_override) ||
    Boolean(overlay.category_override) ||
    overlay.availability_override === "hidden"
  );
}
