/**
 * TUL-317: which state the talent's Oferta tab shows for the current offer.
 * Pure selector so the tab and tests share one rule.
 */
export type TalentOfferViewState = "approve_pending" | "approved" | "rejected" | "draft_cta";

export function selectTalentOfferView(input: {
  stage: string;
  myApprovalStatus: "pending" | "accepted" | "rejected" | null | undefined;
  hasSentOffer: boolean;
}): TalentOfferViewState {
  const { stage, myApprovalStatus, hasSentOffer } = input;
  if (myApprovalStatus === "accepted") return "approved";
  if (myApprovalStatus === "rejected") return "rejected";
  if (myApprovalStatus === "pending" && (hasSentOffer || stage === "hold")) return "approve_pending";
  return "draft_cta";
}
