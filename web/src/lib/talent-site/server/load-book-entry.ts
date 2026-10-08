import "server-only";

import { resolveBookEntry, type BookEntry } from "@/lib/talent-site/book-entry";
import { loadTalentSellingDefaults } from "@/lib/talent-site/server/load-max-site";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";

/**
 * Where `<site>#book` lands for this talent (TUL-246): reads her public
 * offerings once and lets the pure `resolveBookEntry` decide. Same inputs the
 * guest dock mount uses (public offerings, selling defaults, plan ceiling), so
 * the link and a tap on the service card agree. Fails to the plain inquire entry.
 */
export async function loadBookEntry(input: {
  talentProfileId: string;
  locale: string;
  confirmsByHand: boolean;
}): Promise<BookEntry> {
  try {
    const [offerings, defaults] = await Promise.all([
      loadPublicOfferingsForProfile(input.talentProfileId, input.locale),
      loadTalentSellingDefaults(input.talentProfileId),
    ]);
    return resolveBookEntry({ offerings, defaults, confirmsByHand: input.confirmsByHand });
  } catch {
    return { kind: "inquire" };
  }
}
