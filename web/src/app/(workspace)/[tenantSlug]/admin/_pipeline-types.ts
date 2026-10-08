/**
 * Pipeline action result/row types (pure, no directive). Extracted verbatim
 * from `_pipeline-actions.ts`, which re-exports every name so import paths
 * stay byte-stable.
 */

import type { BookingTransaction } from "@/lib/bookings/transactions";
import type { ServicePricingType } from "@/lib/talent/services-menu-types";

export type PipelineActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export type InquiryPaymentState = {
  bookingId: string | null;
  totalRevenueCents: number | null;
  currency: string | null;
  transaction: BookingTransaction | null;
  /** 6.3 deposits: the configured deposit (cents), 0 when none. Drives the
   *  admin "Request deposit" / "Request balance" buttons. */
  depositAmountCents: number;
  /** Whether a deposit has already been collected (booking lifecycle). */
  depositPaid: boolean;
};

export type InquiryParticipant = {
  id: string;
  role: "client" | "coordinator" | "talent";
  status: "invited" | "active" | "declined" | "removed";
  talentProfileId: string | null;
  talentDisplayName: string | null;
  /** Real face for the lineup — directory 'card' crop, or null (→ initials). */
  talentPhotoUrl: string | null;
  /** One-line discipline (primary taxonomy term), e.g. "Editorial Model". */
  talentHeadline: string | null;
  userId: string | null;
  invitedAt: string | null;
};

export type InquiryAttachment = {
  id: string;
  filename: string;
  mimeType: string | null;
  byteSize: number | null;
  description: string | null;
  visibility: "staff" | "shared";
  uploadedBy: string | null;
  createdAt: string;
  /** Step 14 — optional kind tag (mood_board | contract | reference | other). */
  attachmentKind: string | null;
};

export type OfferDraftSnapshot = {
  offerId: string;
  offerVersion: number;
  inquiryVersion: number;
  totalClientPrice: number;
  coordinatorFee: number;
  currencyCode: string;
  notes: string | null;
  createdByName: string | null; // who created this offer (see offer-author.ts)
  // W6a — the negotiated commercial terms currently saved on this offer, for
  // the composer to display + edit. Defaulted (never null) so the composer always
  // has a coherent starting state; deposit amount is in minor units.
  terms: {
    depositPct: number;
    depositAmountCents: number;
    balanceMethod: "request_in_messages" | "pay_in_place" | "full_upfront";
    refundPolicy: "tiered" | "flexible" | "strict" | "manual";
  };
  lineItems: Array<{
    id: string;
    talentProfileId: string | null;
    talentDisplayName: string | null;
    label: string | null;
    /** Full offer-unit enum (extended for the services menu: half_day,
     *  per_person, per_contact, flat_package, custom). */
    pricingUnit: ServicePricingType;
    units: number;
    unitPrice: number;
    totalPrice: number;
    talentCost: number;
    notes: string | null;
    sortOrder: number;
    /** S18 — services-menu service this line was prefilled from; null = manual. */
    sourceServiceId: string | null;
  }>;
};

export type PayoutReceiverOption = {
  payoutAccountId: string;
  ownerType: "agency" | "profile" | "talent";
  ownerId: string;
  displayName: string;
  receiverKind: string;
};

export type WorkspaceCoordinatorCandidate = {
  userId: string;
  displayName: string;
  role: string;
  activeInquiryCount: number;
  status: "active" | "pending_acceptance";
};

export type CoordinatorAssignCandidate = {
  userId: string;
  displayName: string;
  /** 'staff' = agency member; 'talent' = roster talent appointee. */
  kind: "staff" | "talent";
  /** Staff: membership role (owner/admin/manager). Talent: discipline/headline. */
  role: string;
  status: "active" | "pending_acceptance";
  activeInquiryCount: number;
  /** True when this talent already holds a lineup row on this inquiry. */
  inLineup: boolean;
  photoUrl: string | null;
  headline: string | null;
};

export type SecondaryCoordinatorRow = {
  userId: string;
  participantId: string;
  name: string;
  inLineup: boolean;
};
