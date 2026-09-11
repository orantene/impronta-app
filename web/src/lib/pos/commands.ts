/**
 * L53 — POS command names and I/O. POS does not call `createPurchase`
 * per button press. Promotion and capacity attach to reprice / collection,
 * never to line mutation.
 */

export const POS_COMMANDS = [
  "createDraftOrder",
  "addLine",
  "updateLine",
  "removeLine",
  "repriceAndValidate",
  "submitToPreparation",
  "startCollection",
  "recordVerifiedCollection",
  "finalizeOrCancel",
] as const;

export type PosCommand = (typeof POS_COMMANDS)[number];

export type PosLineInput = {
  offeringId: string;
  variantId?: string | null;
  addonIds?: string[];
  units: number;
  /** Session this walk-in is against, when selling a class place. */
  sessionId?: string | null;
};

export type PosBuyerContact = {
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
};

export type PosCollectionMethod = "cash" | "online_card";

export type PosSaleView = {
  orderId: string;
  tenantId: string;
  status: string;
  currency: string;
  customerId: string | null;
  guestSessionId: string | null;
  context: string | null;
  visitId: string | null;
  spaceId: string | null;
  version: number;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  depositPaidCents: number;
  outstandingCents: number;
  prepState: "not_submitted" | "queued" | "acknowledged" | "ready" | "cancelled" | "amended";
  paymentState: "unpaid" | "pending" | "paid" | "cancelled";
  lines: Array<{
    id: string;
    offeringId: string | null;
    variantId: string | null;
    sessionId: string | null;
    label: string;
    units: number;
    unitCents: number;
    totalCents: number;
    kind: "catalog" | "custom";
    needsApproval: boolean;
    operatorUserId: string | null;
    bookingId: string | null;
    bookingKind: "talent_booking" | "agency_booking" | "admission" | null;
  }>;
};

export function posGuestSessionId(): string {
  return `pos:${crypto.randomUUID()}`;
}

export function isPosCommand(raw: string): raw is PosCommand {
  return (POS_COMMANDS as readonly string[]).includes(raw);
}
