import {
  builderPlanAllows,
  getBuilderPlanPolicy,
} from "@/lib/site-admin/builder-capabilities";

export function isShellMutationAllowedForPlan(input: {
  systemTemplateKey: string | null;
  planTier: string | null;
}): boolean {
  if (input.systemTemplateKey !== "site_shell") return true;
  return builderPlanAllows(input.planTier, "builder.shell.edit");
}

/**
 * The plan's shell edit MODE, surfaced as its own accessor.
 *
 * `isShellMutationAllowedForPlan` collapses the three-valued policy
 * (`locked` | `basic` | `full`) to a boolean — right for "may this write
 * happen at all", but it cannot express the distinction the shell surfaces
 * actually need:
 *
 *   - `locked` (free)    — no shell editing; the dock shows ShellLockedState.
 *   - `basic`  (studio)  — the FORM inspectors. Brand, columns, social, legal:
 *                          the whole footer configuration as fields.
 *   - `full`   (agency+) — the above PLUS structural moves: replacing a
 *                          landmark wholesale from the variant gallery, and
 *                          freeform/zone-level node editing.
 *
 * Reading the policy rather than re-deriving a plan comparison keeps this on
 * the one source of truth in `builder-capabilities.ts`; a pricing change there
 * moves every gate at once.
 */
export function shellEditModeForPlan(
  planTier: string | null | undefined,
): "locked" | "basic" | "full" {
  return getBuilderPlanPolicy(planTier).shellEditMode;
}

/**
 * May this plan REPLACE a shell landmark from the variant gallery?
 *
 * Applying a header/footer variant discards the landmark's current children and
 * stamps a new subtree in their place. That is a structural, freeform-level
 * mutation — the paid tier per the owner's decision — not a field edit, so it
 * requires `full` rather than merely "not locked".
 */
export function isShellVariantApplyAllowedForPlan(
  planTier: string | null | undefined,
): boolean {
  return shellEditModeForPlan(planTier) === "full";
}
