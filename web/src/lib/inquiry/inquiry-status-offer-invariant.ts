import type { WorkspaceStatus } from "./inquiry-workspace-types";

export type OfferInvariantStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "expired"
  | "superseded"
  | "invalidated"
  | null;

/** Application-level invariant check — pair must be consistent (plan table). */
export function assertStatusOfferInvariant(
  inquiryStatus: WorkspaceStatus,
  offerStatus: OfferInvariantStatus,
): void {
  if (offerStatus === null || offerStatus === undefined) {
    const ok = ["draft", "submitted", "reviewing", "coordination"].includes(inquiryStatus);
    if (!ok) {
      throw new Error(`Invariant: inquiry=${inquiryStatus} with no offer is invalid`);
    }
    return;
  }

  if (offerStatus === "superseded") return;

  const ok =
    (offerStatus === "draft" && ["reviewing", "coordination"].includes(inquiryStatus)) ||
    (offerStatus === "sent" && inquiryStatus === "offer_pending") ||
    (offerStatus === "accepted" && ["approved", "booked"].includes(inquiryStatus)) ||
    (offerStatus === "rejected" && ["reviewing", "coordination"].includes(inquiryStatus)) ||
    (offerStatus === "withdrawn" && ["reviewing", "coordination"].includes(inquiryStatus)) ||
    (offerStatus === "expired" && inquiryStatus === "expired") ||
    (offerStatus === "invalidated" && ["reviewing", "coordination", "offer_pending", "closed_lost"].includes(inquiryStatus));

  if (!ok) {
    throw new Error(`Status-offer invariant violated: inquiry=${inquiryStatus} offer=${offerStatus}`);
  }
}
