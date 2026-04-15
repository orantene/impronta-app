import type { InquiryWorkspaceInquiry, InquiryWorkspaceOffer, InquiryWorkspaceRosterEntry } from "./inquiry-workspace-types";

export type OfferWarning = "roster_changed" | "details_changed";

/**
 * Soft warnings when draft offer may be stale vs inquiry/roster.
 * Without dedicated DB columns, uses inquiry.updated_at vs offer.updated_at as a coarse signal.
 */
export function computeOfferWarnings(input: {
  inquiry: InquiryWorkspaceInquiry;
  offer: InquiryWorkspaceOffer | null;
  roster: InquiryWorkspaceRosterEntry[];
}): OfferWarning[] {
  const { offer, inquiry } = input;
  if (!offer || offer.status !== "draft") return [];
  const warnings: OfferWarning[] = [];
  try {
    const offerT = new Date(offer.updated_at).getTime();
    const inqT = new Date(inquiry.updated_at).getTime();
    if (inqT > offerT + 500) {
      warnings.push("details_changed");
    }
  } catch {
    /* ignore */
  }
  return warnings;
}
