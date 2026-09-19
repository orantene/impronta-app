/**
 * Front Door Chat v2 / F06 — the guest Inquiries list, from the GUEST's side.
 *
 * Staff inbox segments (Needs action / Waiting / All) use `readConversationState`
 * as the business sees it (`needs_reply` = the guest wrote last). The dock
 * inverts that: "Needs you" is the guest's turn, "Waiting on them" is the
 * business's turn, "Done" is a resolved or terminal record.
 *
 * PURE: no I/O, no React. The list action (`listGuestInquiries`) fills the
 * additive fields; this module only chooses a segment, one state line, and
 * one record chip.
 */

import { readConversationState, readOpportunityState } from "@/lib/messaging/state";

export type GuestInquirySegment = "needs" | "wait" | "done";

export type GuestInquiryRecordChip = {
  readonly kind: string;
  readonly recordId: string;
  readonly paymentState: string | null;
  readonly fulfilmentState: string | null;
  readonly recordDate: string | null;
  readonly amountCents: number | null;
  readonly currency: string;
};

export type GuestInquiryRowInput = {
  readonly inquiryId: string;
  readonly contactName?: string | null;
  readonly projectLabel: string;
  readonly isDraft: boolean;
  readonly threadStatus: string;
  readonly conversationState?: string | null;
  readonly opportunityState?: string | null;
  readonly lastCustomerMessageAt?: string | null;
  readonly lastStaffMessageAt?: string | null;
  readonly resolvedAt?: string | null;
  readonly lostReason?: string | null;
  readonly currentOfferId?: string | null;
  readonly lastMessageAuthor?: "guest" | "agency" | null;
  readonly recordChip?: GuestInquiryRecordChip | null;
};

const PAY_NEEDS_GUEST = new Set(["requested", "opened", "failed", "expired"]);
const FULFILLED = new Set(["fulfilled", "seated", "checked_in", "cancelled"]);
const PLACEHOLDER_NAMES = new Set(["", "guest", "visitor"]);

function stateInput(row: GuestInquiryRowInput) {
  const chip = row.recordChip;
  return {
    conversationState: row.conversationState ?? null,
    opportunityState: row.opportunityState ?? null,
    lastCustomerMessageAt: row.lastCustomerMessageAt ?? (row.lastMessageAuthor === "guest" ? "1" : null),
    lastStaffMessageAt: row.lastStaffMessageAt ?? (row.lastMessageAuthor === "agency" ? "1" : null),
    resolvedAt: row.resolvedAt ?? null,
    lostReason: row.lostReason ?? null,
    status: row.threadStatus,
    currentOfferId: row.currentOfferId ?? null,
    unread: false,
    paid: chip?.paymentState === "paid" ? true : chip?.paymentState ? false : undefined,
  };
}

/** Newest live record wins; amount omitted when the reader had none. */
export function pickRecordChip(
  records: readonly GuestInquiryRecordChip[],
): GuestInquiryRecordChip | null {
  if (records.length === 0) return null;
  return records[records.length - 1] ?? null;
}

export function guestInquirySegment(row: GuestInquiryRowInput): GuestInquirySegment {
  const conv = readConversationState(stateInput(row));
  const opp = readOpportunityState(stateInput(row));
  const chip = row.recordChip ?? null;
  const status = (row.threadStatus ?? "").toLowerCase();

  if (conv === "resolved" || opp === "lost" || status === "closed" || status === "booked") {
    return "done";
  }
  if (chip && FULFILLED.has(chip.fulfilmentState ?? "") && chip.paymentState !== "requested" && chip.paymentState !== "opened") {
    return "done";
  }

  if (chip && PAY_NEEDS_GUEST.has(chip.paymentState ?? "")) return "needs";
  if (opp === "awaiting_acceptance" || opp === "accepted_awaiting_deposit") return "needs";
  if (status === "offer_pending") return "needs";
  if (conv === "awaiting_customer") return "needs";

  if (conv === "needs_reply") return "wait";
  if (row.isDraft) return "wait";
  return "wait";
}

export function rowsForGuestSegment(
  rows: readonly GuestInquiryRowInput[],
  segment: GuestInquirySegment,
): GuestInquiryRowInput[] {
  return rows.filter((row) => guestInquirySegment(row) === segment);
}

export function guestSegmentCounts(rows: readonly GuestInquiryRowInput[]): Record<GuestInquirySegment, number> {
  return {
    needs: rowsForGuestSegment(rows, "needs").length,
    wait: rowsForGuestSegment(rows, "wait").length,
    done: rowsForGuestSegment(rows, "done").length,
  };
}

/**
 * One sentence for the row. Never two chips. The family is conversation
 * first, then money, then fulfilment, so a paid open thread still reads as
 * waiting on the business rather than as "Paid" twice.
 */
export function guestStateLine(
  row: GuestInquiryRowInput,
  labels: {
    readonly needsReply: string;
    readonly awaitingYou: string;
    readonly pay: string;
    readonly hold: string;
    readonly offer: string;
    readonly done: string;
    readonly draft: string;
  },
): string {
  const segment = guestInquirySegment(row);
  const chip = row.recordChip;
  if (segment === "done") return labels.done;
  if (row.isDraft) return labels.draft;
  if (chip && PAY_NEEDS_GUEST.has(chip.paymentState ?? "")) return labels.pay;
  const opp = readOpportunityState(stateInput(row));
  if (opp === "awaiting_acceptance" || opp === "accepted_awaiting_deposit") return labels.offer;
  if (chip?.fulfilmentState === "hold") return labels.hold;
  if (segment === "needs") return labels.awaitingYou;
  return labels.needsReply;
}

function nameUncertain(contactName: string | null | undefined): boolean {
  const n = (contactName ?? "").trim().toLowerCase();
  return PLACEHOLDER_NAMES.has(n) || n.startsWith("pending");
}

/**
 * F06 "Same person?" row: identity is a placeholder AND this cookie owns
 * another conversation that is not Done. No merge writer (P2 is read only).
 */
export function showSamePersonBanner(rows: readonly GuestInquiryRowInput[]): boolean {
  const open = rows.filter((row) => guestInquirySegment(row) !== "done");
  if (open.length < 2) return false;
  return open.some((row) => nameUncertain(row.contactName));
}
