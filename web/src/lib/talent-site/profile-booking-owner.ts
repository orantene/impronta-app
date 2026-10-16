import { catalogDetailIsPurchase } from "@/components/public-booking/catalog-booking-logic";
import type { OfferingRequestDetail } from "@/app/t/[profileCode]/_shared/OfferingCta";

/**
 * TUL-707: one booking flow on the profile. When `CatalogBookingSheet` is
 * mounted it owns every "tulala:offering-instant" event except products and
 * untimed packages (the purchase rail). `OfferingInstantMount` must stay quiet
 * for the rest, otherwise both modals open on the same Reservar click.
 */
export function instantMountShouldHandle(
  d: Pick<OfferingRequestDetail, "kind" | "intent" | "durationMinutes" | "amountCents">,
  catalogSheetMounted: boolean,
): boolean {
  return !catalogSheetMounted || catalogDetailIsPurchase(d);
}
