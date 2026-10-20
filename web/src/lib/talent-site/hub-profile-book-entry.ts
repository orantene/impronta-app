import { bookEntryFrom, listBookableOfferings, type BookEntry } from "@/lib/talent-site/book-entry";
import { talentOffersInstantBooking } from "@/lib/scheduling/talent-booking-mode";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { offeringId8 } from "@/lib/talent/service-share-hash";

/**
 * Hub `/t/<code>` book entry from public offerings (TUL-246). TUL-1270 #13: the
 * sheet entry also carries every bookable service by id8 so a shared
 * `/t/<code>#book-<id8>` link opens that service, not the preferred one.
 */
export function hubProfileBookEntry(
  offerings: readonly TalentOffering[],
  talentPlanKey: string | null | undefined,
): BookEntry {
  const bookable = listBookableOfferings({
    offerings,
    confirmsByHand: !talentOffersInstantBooking(talentPlanKey),
  });
  const entry = bookEntryFrom(bookable);
  if (entry.kind !== "sheet") return entry;
  const targets: Record<string, { eventName: string; detail: (typeof bookable)[number]["detail"] }> = {};
  for (const b of bookable) targets[offeringId8(b.offering.id)] = { eventName: b.eventName, detail: b.detail };
  return { ...entry, targets };
}
