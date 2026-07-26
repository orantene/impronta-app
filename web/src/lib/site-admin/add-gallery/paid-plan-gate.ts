import type { AddGalleryItem } from "./types";

/**
 * Paid-plan gate for Add-gallery inserts (social_feed and future paid blocks).
 *
 * Returns the operator-facing refusal message when the item is paid-gated and
 * the workspace is on the free plan, or null when the insert may proceed. The
 * message is a designed response — never a silently dead card — and publish
 * preflight enforces the same rule server-side as the backstop.
 */
export function paidPlanInsertBlockMessage(
  item: Pick<AddGalleryItem, "requiresPaidPlan">,
  workspacePlan: string,
): string | null {
  if (!item.requiresPaidPlan) return null;
  if (workspacePlan !== "free") return null;
  return "This block is available on paid plans. Upgrade in Settings, Plan & billing.";
}
