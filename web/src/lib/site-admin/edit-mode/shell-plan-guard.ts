import { builderPlanAllows } from "@/lib/site-admin/builder-capabilities";

export function isShellMutationAllowedForPlan(input: {
  systemTemplateKey: string | null;
  planTier: string | null;
}): boolean {
  if (input.systemTemplateKey !== "site_shell") return true;
  return builderPlanAllows(input.planTier, "builder.shell.edit");
}

/**
 * WF-6 — is this workspace allowed to move header items between zones?
 *
 * Owner decision (2026-08-16): the BASIC header form controls (logo, nav
 * links, CTA) stay on Free; composing the bar's LAYOUT — the `regions` value —
 * is paid. That is the same line `builder.shell.edit` already draws
 * (`shellEditMode: "locked"` on free, `basic`/`full` on studio and up), so
 * this reuses the capability rather than inventing a second plan table that
 * could drift from it.
 *
 * Separate from `isShellMutationAllowedForPlan` because that predicate is
 * page-scoped (it asks "is this page the shell?"), while this one gates ONE
 * field of one section and is called from the header save action, where there
 * is no page template key in hand. `builderPlanAllows` normalizes first, so an
 * unknown or missing plan string collapses to `free` and this fails CLOSED.
 */
export function isHeaderRegionsEditAllowedForPlan(
  planTier: string | null | undefined,
): boolean {
  return builderPlanAllows(planTier ?? null, "builder.shell.edit");
}

/**
 * The one sentence the operator sees when the gate says no. Kept next to the
 * predicate so the UI lock and the server refusal cannot describe different
 * products.
 */
export const HEADER_REGIONS_PLAN_DENIED_REASON =
  "Custom header layout is a paid feature. Upgrade to Studio to move the logo, navigation, and buttons between zones.";
