import "server-only";

import * as React from "react";
import ReviewRequestInvite from "../../../emails/reviews/ReviewRequestInvite";
import ReviewRequestReminder from "../../../emails/reviews/ReviewRequestReminder";
import ReviewReceived from "../../../emails/reviews/ReviewReceived";
import type { AudienceMember, CatalogEntry, NotificationEvent } from "./types";
import { eventUser, str } from "./catalog-audiences";
import { formatDateLabel, pageUrl } from "./catalog-render";

/**
 * Reviews catalog entries (STANDING v2, spec §Phase 2) — the collection engine
 * built ON the existing notification stack (NOT a parallel email path). Three
 * entries route through the dispatcher, so they inherit `email_suppressions`,
 * per-category preferences, unsubscribe headers, and localized copy for free:
 *
 *   1. review.request_invite.client   — invite a past client to review a talent.
 *   2. review.received.talent         — tell the talent a client review published.
 *   3. review.request_reminder.client — one day-7 nudge for a still-pending request.
 *
 * All three sit in the `reviews` category (opt-out, default email + in_app).
 * Copy is neutral and incentive-free (FTC): a review is honest feedback from a
 * real booking, never rewarded. The invite + reminder CTA point at the public
 * single-use `/review/{token}` landing page (owned by the review-token route);
 * the received CTA points at the talent's Reviews page.
 *
 * These are dispatched DIRECTLY from the review server actions + the reminder
 * producer (not through the inquiry engine's `notifyUsers`), so each entry owns
 * its own channels with no double-notify risk.
 */

/**
 * The client a review request is addressed to — the in-app client account when
 * known (`clientUserId`), else the invited email as a guest. Mirrors the shape
 * of `clientOrGuest` but keys on the review request's own fields. A guest
 * collapses to email-only via the channel policy; a known client also gets the
 * in-app bell on their client surface.
 */
export const reviewInvitee = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const clientUserId = str(event.payload.clientUserId);
  if (clientUserId) return [{ kind: "user", userId: clientUserId, role: "client" }];
  const email = str(event.payload.invitedEmail);
  if (email) {
    return [
      { kind: "guest", email, displayName: str(event.payload.clientName), role: "client" },
    ];
  }
  return [];
};

/**
 * review.request_created → invite the past client to review the talent. The
 * `createReviewRequestAction` producer emits this with the agency `tenantId`
 * (brand + in-app surface), the invite token, and the talent/event context.
 */
const REVIEW_REQUEST_INVITE: CatalogEntry = {
  id: "review.request_invite.client",
  category: "reviews",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["review.request_created"],
  resolveAudience: reviewInvitee,
  in_app: {
    kind: "system",
    surface: "client",
    title: (event) => {
      const talent = str(event.payload.talentName) ?? "A talent you booked";
      return `${talent} would love your feedback`;
    },
    body: () => "Leave a review to share how it went. It takes about 20 seconds.",
    targetPayload: (event) => ({ reviewUrl: str(event.payload.reviewUrl) }),
  },
  email: {
    templateId: "review.request_invite",
    subject: (event) => {
      const talent = str(event.payload.talentName) ?? "A talent you booked";
      return `${talent} would love your feedback`;
    },
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(ReviewRequestInvite, {
        clientName: recipient.displayName ?? str(event.payload.clientName),
        talentName: str(event.payload.talentName),
        eventTitle: str(event.payload.eventTitle),
        eventDate: formatDateLabel(str(event.payload.eventDate)) ?? null,
        reviewUrl: str(event.payload.reviewUrl) ?? pageUrl(brand, "/"),
        brand,
        unsubscribeUrl,
        categoryLabel: "reviews",
      }),
  },
};

/**
 * review.request_reminded → a single, gentle day-7 follow-up for a still-pending
 * request. The `review-request-reminder` producer emits this with the same
 * payload shape as the invite; the entry re-uses the `reviewInvitee` audience.
 */
const REVIEW_REQUEST_REMINDER: CatalogEntry = {
  id: "review.request_reminder.client",
  category: "reviews",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["review.request_reminded"],
  resolveAudience: reviewInvitee,
  in_app: {
    kind: "system",
    surface: "client",
    title: (event) => {
      const talent = str(event.payload.talentName) ?? "A talent you booked";
      return `A quick reminder from ${talent}`;
    },
    body: () => "Your review still helps. It takes about 20 seconds.",
    targetPayload: (event) => ({ reviewUrl: str(event.payload.reviewUrl) }),
  },
  email: {
    templateId: "review.request_reminder",
    subject: (event) => {
      const talent = str(event.payload.talentName) ?? "A talent you booked";
      return `A quick reminder from ${talent}`;
    },
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(ReviewRequestReminder, {
        clientName: recipient.displayName ?? str(event.payload.clientName),
        talentName: str(event.payload.talentName),
        eventTitle: str(event.payload.eventTitle),
        eventDate: formatDateLabel(str(event.payload.eventDate)) ?? null,
        reviewUrl: str(event.payload.reviewUrl) ?? pageUrl(brand, "/"),
        brand,
        unsubscribeUrl,
        categoryLabel: "reviews",
      }),
  },
};

/**
 * review.published → tell the talent a client review of them just published. The
 * `submitTalentReviewAction` producer resolves the talent account from
 * `talent_profiles.user_id` and emits with `event.userId` (resolved by
 * `eventUser`) + the agency `tenantId`. CTA → the talent Reviews page.
 */
const REVIEW_RECEIVED: CatalogEntry = {
  id: "review.received.talent",
  category: "reviews",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["review.published"],
  resolveAudience: eventUser("talent"),
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "You received a review from a client",
    body: () => "Open your Reviews page to read it in full and reply.",
    // Destination = the talent Reviews PAGE, resolved through
    // NOTIFICATION_PAGE_TARGETS["talent-reviews"]. The body already tells the
    // talent to open their Reviews page and the email CTA already points at
    // `/talent/reviews`; the bell row was the only half with nowhere to go.
    // There is no reviews DRAWER on the talent surface — `reviews-moderation`
    // is the workspace staff queue — so a page target is the honest shape.
    targetDrawer: "talent-reviews",
  },
  email: {
    templateId: "review.received",
    subject: () => "You received a review from a client",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(ReviewReceived, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        eventTitle: str(event.payload.eventTitle),
        eventDate: formatDateLabel(str(event.payload.eventDate)) ?? null,
        reviewsUrl: pageUrl(brand, "/talent/reviews"),
        brand,
        unsubscribeUrl,
        categoryLabel: "reviews",
      }),
  },
};

/** The three review-collection entries, in catalog order. */
export const REVIEWS_CATALOG_ENTRIES: CatalogEntry[] = [
  REVIEW_REQUEST_INVITE,
  REVIEW_RECEIVED,
  REVIEW_REQUEST_REMINDER,
];
