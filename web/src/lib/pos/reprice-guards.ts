/**
 * TUL-1349: the pure refusal rules `repriceAndValidate` applies to a stored
 * cart line, split out of draft.ts (file-size budget). Refusal only: nothing
 * here computes or changes a price.
 */
import { isSellableOnChannel } from "@/lib/offerings/guest-sellable";

/** Counter draft channels (`pos`, `pos:*`) are staff; anything else is a guest. */
export function isStaffChannel(sourceChannel: string | null | undefined): boolean {
  return sourceChannel === "pos" || (typeof sourceChannel === "string" && sourceChannel.startsWith("pos:"));
}

/**
 * Staff at the counter keep the status-only rule. EVERY other channel (the
 * guest cart, anything unknown) is held to D-10 / D-10a: published AND approved
 * AND public, so an item that later became agency_only, on_request or rejected
 * cannot take an instant charge.
 */
export function offeringSellableAtReprice(offering: Record<string, unknown>, sourceChannel: string | null | undefined): boolean {
  return isSellableOnChannel(offering, isStaffChannel(sourceChannel) ? "staff" : "guest");
}

/**
 * The chosen option must still exist and still belong to the item (every
 * channel). A HIDDEN option is refused for guests only: hidden options are the
 * staff-only and comp options a cashier legitimately sells.
 */
export function variantRefusedAtReprice(
  variant: { offering_id?: string; is_hidden?: boolean | null } | null,
  lineOfferingId: string | null,
  sourceChannel: string | null | undefined,
): boolean {
  if (!variant || variant.offering_id !== lineOfferingId) return true;
  return variant.is_hidden === true && !isStaffChannel(sourceChannel);
}

/** The one refusal for a line that can no longer be sold. */
export const ITEM_UNAVAILABLE = {
  ok: false as const,
  reason: "item_unavailable" as const,
  error: "This item is no longer available.",
};
