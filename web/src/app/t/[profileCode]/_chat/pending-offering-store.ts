"use client";

/**
 * Pending-offering store — the tiny seam between a storefront CTA click and
 * the guest-chat inquiry that follows.
 *
 * OfferingCta dispatches "tulala:offering-request"; TalentProfileChatLauncher
 * stashes the detail here and opens the panel; use-mini-chat-send attaches it
 * to the startGuestChatInquiry call (→ inquiries.source_context.offering) and
 * clears it once the inquiry is created. Module-scope on purpose: the CTA and
 * the launcher are separate React trees on the same page.
 *
 * Catalog booking sheet Chat/Ask also writes here (via openCatalogBookingChat)
 * with optional selection (variant, extras, slot, total) so Messages sees the
 * offering the visitor was building — not a blank thread.
 */

import type { OfferingRequestDetail } from "../_shared/OfferingCta";

/** Options / slot / total chosen in CatalogBookingSheet before Chat now. */
export type PendingOfferingSelection = {
  variantId?: string | null;
  variantLabel?: string | null;
  addOnIds?: string[];
  addOnLabels?: string[];
  slotLabel?: string | null;
  startsAt?: string | null;
  totalCents?: number | null;
};

export type PendingOfferingDetail = OfferingRequestDetail & {
  selection?: PendingOfferingSelection;
};

let pending: PendingOfferingDetail | null = null;

export function setPendingOffering(d: PendingOfferingDetail | null): void {
  pending = d;
}

export function peekPendingOffering(): PendingOfferingDetail | null {
  return pending;
}

export function clearPendingOffering(): void {
  pending = null;
}

/** The snake_case payload persisted onto inquiries.source_context.offering. */
export function pendingOfferingPayload():
  | {
      offering_id: string;
      title: string;
      amount_cents: number | null;
      currency: string;
      price_type: string;
      kind: string;
      variant_id?: string | null;
      variant_label?: string | null;
      add_on_ids?: string[];
      add_on_labels?: string[];
      slot_label?: string | null;
      starts_at?: string | null;
      total_cents?: number | null;
    }
  | undefined {
  if (!pending) return undefined;
  const sel = pending.selection;
  const total =
    sel?.totalCents != null && Number.isFinite(sel.totalCents) ? sel.totalCents : null;
  return {
    offering_id: pending.offeringId,
    title: pending.title,
    // Prefer the sheet total (base + extras) when the visitor built a selection.
    amount_cents: total ?? pending.amountCents,
    currency: pending.currency,
    price_type: pending.priceType,
    kind: pending.kind,
    ...(sel?.variantId != null ? { variant_id: sel.variantId } : {}),
    ...(sel?.variantLabel ? { variant_label: sel.variantLabel } : {}),
    ...(sel?.addOnIds && sel.addOnIds.length > 0 ? { add_on_ids: sel.addOnIds } : {}),
    ...(sel?.addOnLabels && sel.addOnLabels.length > 0 ? { add_on_labels: sel.addOnLabels } : {}),
    ...(sel?.slotLabel ? { slot_label: sel.slotLabel } : {}),
    ...(sel?.startsAt ? { starts_at: sel.startsAt } : {}),
    ...(total != null ? { total_cents: total } : {}),
  };
}
