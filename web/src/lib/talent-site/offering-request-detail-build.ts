/**
 * Builds the `tulala:offering-*` event payload from a public offering. PURE.
 *
 * One builder for the storefront card (`OfferingCta`) and the `#book` entry
 * (`book-entry.ts`), so a service opened from the link carries exactly what a
 * service tapped on the page carries.
 */
import { intakeDetail } from "@/lib/talent/offering-intake";
import {
  offeringWhereFromAttributes,
  type OfferingRequestDetail,
} from "@/lib/talent/offering-request-detail";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function buildOfferingRequestDetail(
  offering: TalentOffering,
  instant: boolean,
): OfferingRequestDetail {
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
