import "server-only";

import * as React from "react";
import ClientInquiryReceived from "../../../emails/client/InquiryReceived";
import ClientOfferReady from "../../../emails/client/OfferReady";
import ClientBookingConfirmed from "../../../emails/client/BookingConfirmed";
import TalentInquiryInvited from "../../../emails/talent/InquiryInvited";
import TalentBookingConfirmed from "../../../emails/talent/BookingConfirmed";
import WorkspaceCoordinatorAssigned from "../../../emails/workspace/CoordinatorAssigned";
import WorkspaceOfferAccepted from "../../../emails/workspace/OfferAccepted";
import WorkspaceOfferDeclined from "../../../emails/workspace/OfferDeclined";
import WorkspaceAssignmentTimedOut from "../../../emails/workspace/AssignmentTimedOut";
import WorkspaceTalentDeclined from "../../../emails/workspace/TalentDeclined";
import InquiryCancelledEmail from "../../../emails/notifications/InquiryCancelled";
import type { CatalogEntry } from "./types";
import {
  allRosterTalent,
  assignedCoordinator,
  clientAndRosterTalent,
  clientOrGuest,
  coordinatorAndAdmins,
  invitedTalent,
  loadInquiryView,
  str,
  workspaceAdmins,
} from "./catalog-audiences";
import { pageUrl } from "./catalog-render";

/**
 * Inquiry-engine catalog entries (spec §6, Phase 5) — split out of `catalog.ts`
 * to keep that file under the 800-line cap. These subscribe to the engine's
 * domain events; the `triggers` strings match `ENGINE_EVENT_TYPES` values in
 * `@/lib/inquiry/inquiry-events`, kept as string literals (not an import) so the
 * catalog stays decoupled from the engine and there's no import cycle
 * (inquiry-events imports the catalog).
 *
 * Every entry here is EMAIL-ONLY. In-app bell notifications for these events
 * are already emitted by the engine's `notifyUsers` path (listener[1]); routing
 * in_app here too would double-notify.
 */

/** inquiry.submitted → client confirmation. */
const INQUIRY_SUBMITTED_CLIENT: CatalogEntry = {
  id: "inquiry.submitted.client",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["inquiry.submitted"],
  hydrate: loadInquiryView,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.inquiry_received",
    subject: () => "We've received your inquiry",
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(ClientInquiryReceived, {
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "inquiry",
      }),
  },
};

/** inquiry.submitted → coordinator assignment notice (only when auto-assigned). */
const INQUIRY_SUBMITTED_COORDINATOR: CatalogEntry = {
  id: "inquiry.submitted.coordinator",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["inquiry.submitted"],
  hydrate: loadInquiryView,
  resolveAudience: assignedCoordinator,
  email: {
    templateId: "workspace.coordinator_assigned",
    subject: () => "New inquiry assigned to you",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceCoordinatorAssigned, {
        coordinatorName: recipient.displayName,
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

/** inquiry.submitted → invite notice to every talent on the roster at submit. */
const INQUIRY_SUBMITTED_TALENT: CatalogEntry = {
  id: "inquiry.submitted.talent",
  category: "roster_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["inquiry.submitted"],
  hydrate: loadInquiryView,
  resolveAudience: allRosterTalent,
  email: {
    templateId: "talent.inquiry_invited",
    subject: () => "You've been added to an inquiry",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentInquiryInvited, {
        talentName: recipient.displayName,
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/talent/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/** offer.sent → client "your offer is ready" (closes a P0 email gap). */
const OFFER_SENT_CLIENT: CatalogEntry = {
  id: "offer.sent.client",
  category: "offers",
  defaultChannels: ["email"],
  required: false,
  triggers: ["offer.sent"],
  hydrate: loadInquiryView,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.offer_ready",
    subject: () => "Your offer is ready",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(ClientOfferReady, {
        clientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        totalAmount: str(event.payload.offerTotal) ?? "",
        offerUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}?tab=offer`),
        brand,
        unsubscribeUrl,
        categoryLabel: "offer",
      }),
  },
};

/** booking.created → client confirmation (closes a P0 email gap). */
const BOOKING_CREATED_CLIENT: CatalogEntry = {
  id: "booking.created.client",
  category: "bookings",
  defaultChannels: ["email"],
  required: false,
  triggers: ["booking.created"],
  hydrate: loadInquiryView,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.booking_confirmed",
    subject: () => "Booking confirmed",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const bookingId = str(event.payload.bookingId);
      return React.createElement(ClientBookingConfirmed, {
        clientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        bookingUrl: pageUrl(
          brand,
          bookingId ? `/client/bookings/${bookingId}` : `/client/inquiries/${event.inquiryId}`,
        ),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      });
    },
  },
};

/** booking.created → confirmation to every talent on the booking (P0 gap). */
const BOOKING_CREATED_TALENT: CatalogEntry = {
  id: "booking.created.talent",
  category: "bookings",
  defaultChannels: ["email"],
  required: false,
  triggers: ["booking.created"],
  hydrate: loadInquiryView,
  resolveAudience: allRosterTalent,
  email: {
    templateId: "talent.booking_confirmed",
    subject: () => "Booking confirmed",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentBookingConfirmed, {
        talentName: recipient.displayName,
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiriesUrl: pageUrl(brand, `/talent/inquiries`),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

/** roster.talent_invited → invite notice to the one talent added post-submit. */
const ROSTER_TALENT_INVITED: CatalogEntry = {
  id: "roster.talent_invited.talent",
  category: "roster_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["roster.talent_invited"],
  hydrate: loadInquiryView,
  resolveAudience: invitedTalent,
  email: {
    templateId: "talent.inquiry_invited",
    subject: () => "You've been added to an inquiry",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentInquiryInvited, {
        talentName: recipient.displayName,
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/talent/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/** coordinator.assigned → notify the coordinator they now own this inquiry. */
const COORDINATOR_ASSIGNED: CatalogEntry = {
  id: "coordinator.assigned.coordinator",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["coordinator.assigned"],
  hydrate: loadInquiryView,
  resolveAudience: assignedCoordinator,
  email: {
    templateId: "workspace.coordinator_assigned",
    subject: () => "New inquiry assigned to you",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceCoordinatorAssigned, {
        coordinatorName: recipient.displayName,
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

/** offer.client_rejected → tell the coordinator the client declined the offer. */
const OFFER_DECLINED_WORKSPACE: CatalogEntry = {
  id: "offer.declined.workspace",
  category: "offers",
  defaultChannels: ["email"],
  required: false,
  triggers: ["offer.client_rejected"],
  hydrate: loadInquiryView,
  resolveAudience: assignedCoordinator,
  email: {
    templateId: "workspace.offer_declined",
    subject: () => "An offer was declined",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceOfferDeclined, {
        recipientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "offer",
      }),
  },
};

/**
 * approval.all_complete → tell the coordinator + workspace admins the client
 * accepted the offer (every approver signed off). This is the clean "offer
 * accepted" signal — the engine only emits it on the `approved` transition.
 */
const OFFER_ACCEPTED_WORKSPACE: CatalogEntry = {
  id: "offer.accepted.workspace",
  category: "offers",
  defaultChannels: ["email"],
  required: false,
  triggers: ["approval.all_complete"],
  hydrate: loadInquiryView,
  resolveAudience: coordinatorAndAdmins,
  email: {
    templateId: "workspace.offer_accepted",
    subject: () => "An offer was accepted",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceOfferAccepted, {
        recipientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        totalAmount: str(event.payload.offerTotal) ?? "",
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "offer",
      }),
  },
};

/**
 * coordinator.assignment_timed_out → auto-assignment lapsed without a
 * coordinator; alert workspace owners/admins to triage manually. (The inquiry
 * has no coordinator yet, so `assignedCoordinator` would be empty — this is
 * why the audience is `workspaceAdmins`.)
 */
const COORDINATOR_ASSIGNMENT_TIMED_OUT: CatalogEntry = {
  id: "coordinator.assignment_timed_out.workspace",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["coordinator.assignment_timed_out"],
  hydrate: loadInquiryView,
  resolveAudience: workspaceAdmins,
  email: {
    templateId: "workspace.assignment_timed_out",
    subject: () => "An inquiry needs a coordinator",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceAssignmentTimedOut, {
        recipientName: recipient.displayName,
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

/** roster.talent_declined → tell the coordinator a talent turned down the invite. */
const ROSTER_TALENT_DECLINED: CatalogEntry = {
  id: "roster.talent_declined.coordinator",
  category: "roster_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["roster.talent_declined"],
  hydrate: loadInquiryView,
  resolveAudience: assignedCoordinator,
  email: {
    templateId: "workspace.talent_declined",
    subject: () => "A talent declined an inquiry",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceTalentDeclined, {
        recipientName: recipient.displayName,
        talentName: str(event.payload.talentName),
        contactName: str(event.payload.contactName),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/**
 * inquiry.cancelled → notify everyone still attached to the inquiry (the
 * client/guest + all roster talent). The link points at each recipient's own
 * surface, branched on their resolved role.
 */
const INQUIRY_CANCELLED: CatalogEntry = {
  id: "inquiry.cancelled.participants",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["inquiry.cancelled"],
  hydrate: loadInquiryView,
  resolveAudience: clientAndRosterTalent,
  email: {
    templateId: "inquiry.cancelled",
    subject: () => "An inquiry has been cancelled",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const surface = recipient.role === "client" ? "client" : "talent";
      return React.createElement(InquiryCancelledEmail, {
        recipientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/${surface}/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "inquiry",
      });
    },
  },
};

/** The 13 inquiry-engine entries, in catalog order. */
export const INQUIRY_CATALOG_ENTRIES: CatalogEntry[] = [
  INQUIRY_SUBMITTED_CLIENT,
  INQUIRY_SUBMITTED_COORDINATOR,
  INQUIRY_SUBMITTED_TALENT,
  OFFER_SENT_CLIENT,
  BOOKING_CREATED_CLIENT,
  BOOKING_CREATED_TALENT,
  ROSTER_TALENT_INVITED,
  COORDINATOR_ASSIGNED,
  OFFER_DECLINED_WORKSPACE,
  OFFER_ACCEPTED_WORKSPACE,
  COORDINATOR_ASSIGNMENT_TIMED_OUT,
  ROSTER_TALENT_DECLINED,
  INQUIRY_CANCELLED,
];
