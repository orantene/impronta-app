/**
 * TUL-1463: "Leave a review" on a visit in the client account. Pure, no I/O.
 *
 * One rule decides what the visit page shows and what the server action accepts:
 *  - only the visit's own client, on this site's tenant;
 *  - only a completed visit (the existing review policy, `isBookingReviewable`: completed,
 *    or paid and the end has passed; the DB insert policy checks the same);
 *  - at most one review per visit: any review this client already left on the booking
 *    (published OR hidden by moderation) closes it, so a moderated review is never replaced;
 *  - an open review request for the visit is reused (its `/review/<token>` page) rather than
 *    a second way in.
 */
import { isBookingReviewable } from "@/lib/reviews/review-eligibility";

export type VisitReviewFacts = {
  bookingId: string;
  bookingTenantId: string | null;
  bookingClientUserId: string | null;
  /** The visit's inquiry client (a booking made before sign-in may carry no client id). */
  inquiryClientUserId: string | null;
  status: string;
  paymentStatus: string;
  endsAt: string | null;
  eventDate: string | null;
  /** talent_profiles on the booking. */
  talentProfileIds: readonly string[];
  /** Talent this client already reviewed on this booking (any status). */
  reviewedTalentIds: readonly string[];
  /** Token of an open (pending / sent) review request for this booking and client. */
  openRequestToken: string | null;
};

export type VisitReviewBlock = "not_signed_in" | "not_owner" | "wrong_tenant" | "not_completed" | "no_talent";

export type VisitReviewState =
  | { kind: "form"; talentProfileId: string }
  | { kind: "request"; href: string }
  | { kind: "done" }
  | { kind: "none"; reason: VisitReviewBlock };

export function decideVisitReview(input: {
  sessionUserId: string | null | undefined;
  siteTenantId: string | null | undefined;
  /** On a talent's own site: that talent. Elsewhere null. */
  hostTalentProfileId?: string | null;
  facts: VisitReviewFacts;
  nowMs?: number;
}): VisitReviewState {
  const f = input.facts;
  if (!input.sessionUserId) return { kind: "none", reason: "not_signed_in" };
  if (!input.siteTenantId || !f.bookingTenantId || f.bookingTenantId !== input.siteTenantId) return { kind: "none", reason: "wrong_tenant" };
  const owner = f.bookingClientUserId
    ? f.bookingClientUserId === input.sessionUserId
    : f.inquiryClientUserId === input.sessionUserId;
  if (!owner) return { kind: "none", reason: "not_owner" };
  if (!isBookingReviewable({ status: f.status, paymentStatus: f.paymentStatus, endsAt: f.endsAt, eventDate: f.eventDate, now: input.nowMs })) {
    return { kind: "none", reason: "not_completed" };
  }
  if (f.reviewedTalentIds.length > 0) return { kind: "done" };
  const token = f.openRequestToken?.trim();
  if (token) return { kind: "request", href: `/review/${encodeURIComponent(token)}` };
  const talent = pickReviewTalent(f.talentProfileIds, input.hostTalentProfileId ?? null);
  return talent ? { kind: "form", talentProfileId: talent } : { kind: "none", reason: "no_talent" };
}

/** The site's own talent when she is on the booking; otherwise the booking's only talent; else none. */
export function pickReviewTalent(talentIds: readonly string[], hostTalentProfileId: string | null): string | null {
  const ids = [...new Set(talentIds.filter(Boolean))];
  if (hostTalentProfileId && ids.includes(hostTalentProfileId)) return hostTalentProfileId;
  return ids.length === 1 ? ids[0]! : null;
}
