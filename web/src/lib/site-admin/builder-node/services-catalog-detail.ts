/**
 * Catalog offering → request detail + dock dispatch helpers.
 * Kept out of services-catalog-filter.tsx for the max-lines gate.
 */

import { intakeDetail } from "@/lib/talent/offering-intake";
import { deriveOfferingCta } from "@/lib/talent/offering-cta-derivation";
import { offeringWhereFromAttributes, type OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import { type TalentOffering } from "@/lib/talent/offerings-types";
import {
  PLATFORM_DEFAULT_BOOKING_POSTURE,
  type TalentBookingPosture,
} from "@/lib/talent/selling-booking-settings";
import { dispatchCatalogOffering } from "./catalog-offering-dispatch";

// F4 / WSF-B: one derivation (deriveOfferingCta) shared with OfferingCta and
// catalogRowCtaLabel. The talent default applies only to services that
// inherit; a service with its own instant mode books instantly, which the
// server (assertInstantPosture) already accepts.
export function deriveFor(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: TalentBookingPosture,
) {
  return deriveOfferingCta({ offering, defaults: { bookingPosture }, confirmsByHand });
}

export function detailFor(
  offering: TalentOffering,
  confirmsByHand: boolean,
  bookingPosture: TalentBookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
): OfferingRequestDetail {
  const { instant } = deriveFor(offering, confirmsByHand, bookingPosture);
  const where = offeringWhereFromAttributes(offering.attributes);
  return {
    offeringId: offering.id,
    talentProfileId: offering.talentProfileId,
    title: offering.title,
    kind: offering.kind,
    priceType: offering.priceType,
    priceDisplay: offering.priceDisplay,
    amountCents: offering.amountCents,
    currency: offering.currency,
    durationMinutes: offering.durationMinutes,
    allowPayInPerson: offering.allowPayInPerson,
    requireAccountToBook: offering.requireAccountToBook === true,
    reserveMode: offering.reserveMode,
    depositPct: offering.depositPct,
    cancellationHours: offering.cancellationHours,
    imageUrl: offering.imageUrls[0] ?? null,
    variants: offering.variants ?? [],
    addOns: offering.addOns ?? [],
    inventoryQty: offering.inventoryQty,
    capacityPoolId: offering.capacityPoolId,
    intent: instant ? "instant" : "request",
    description: offering.description,
    where: where.length ? where : undefined,
    ...intakeDetail(offering.attributes),
  };
}

export function dispatchOffering(
  offering: TalentOffering,
  confirmsByHand: boolean,
  startAt?: "when",
  inclusion?: string | null,
  bookingPosture: TalentBookingPosture = PLATFORM_DEFAULT_BOOKING_POSTURE,
) {
  dispatchCatalogOffering({
    offering,
    confirmsByHand,
    bookingPosture,
    detail: {
      ...detailFor(offering, confirmsByHand, bookingPosture),
      startAt,
      inclusion: inclusion ?? undefined,
    },
  });
}
