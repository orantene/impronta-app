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
 */

import type { OfferingRequestDetail } from "../_shared/OfferingCta";

let pending: OfferingRequestDetail | null = null;

export function setPendingOffering(d: OfferingRequestDetail | null): void {
  pending = d;
}

export function peekPendingOffering(): OfferingRequestDetail | null {
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
    }
  | undefined {
  if (!pending) return undefined;
  return {
    offering_id: pending.offeringId,
    title: pending.title,
    amount_cents: pending.amountCents,
    currency: pending.currency,
    price_type: pending.priceType,
    kind: pending.kind,
  };
}
