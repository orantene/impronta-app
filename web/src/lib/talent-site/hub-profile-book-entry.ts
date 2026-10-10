import { resolveBookEntry, type BookEntry } from "@/lib/talent-site/book-entry";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import type { TalentOffering } from "@/lib/talent/offerings-types";

/** Hub `/t/<code>` book entry from public offerings (TUL-246). */
export function hubProfileBookEntry(
  offerings: readonly TalentOffering[],
  talentPlanKey: string | null | undefined,
): BookEntry {
  return resolveBookEntry({
    offerings,
    confirmsByHand: !talentOffersInstantBooking(talentPlanKey),
  });
}
