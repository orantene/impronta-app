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

/**
 * TUL-1607/1608: the per-line Confirm / Decline panel mounts on the talent's Oferta tab for ANY real
 * inquiry. It must not depend on the talent approval row or the in-memory offer list (neither exists
 * for a per-line offer in the talent shell); the panel itself shows nothing unless the offer is sent
 * and the signed-in person owns a line on it.
 */
export function shouldMountLineConfirmations(realInquiryId: string | null | undefined): boolean {
  return typeof realInquiryId === "string" && realInquiryId.length > 0;
}
