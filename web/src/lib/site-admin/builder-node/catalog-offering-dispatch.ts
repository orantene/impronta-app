/**
 * Vanity catalog offering click → booking sheet or ask flow.
 * Kept out of services-catalog-filter.tsx for the max-lines ratchet.
 */

import { openCatalogBookingChat } from "@/components/public-booking/catalog-booking-chat";
import {
  deriveOfferingCta,
  opensAskFlowOnly,
} from "@/lib/talent/offering-cta-derivation";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";

export function dispatchCatalogOffering(input: {
  offering: TalentOffering;
  confirmsByHand: boolean;
  detail: OfferingRequestDetail & { startAt?: "when"; inclusion?: string };
  bookingPosture?: TalentBookingPosture;
}): void {
  const bookingPosture = input.bookingPosture ?? PLATFORM_DEFAULT_BOOKING_POSTURE;
  const derived = deriveOfferingCta({
    offering: input.offering,
    defaults: { bookingPosture },
    confirmsByHand: input.confirmsByHand,
  });
  if (opensAskFlowOnly(derived.cta)) {
    openCatalogBookingChat({
      detail: input.detail,
      askAbout: [input.detail.title],
      from: "catalog",
    });
    return;
  }
  window.dispatchEvent(new CustomEvent(derived.eventName, { detail: input.detail }));
}
