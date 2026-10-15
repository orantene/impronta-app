import "server-only";

import * as React from "react";
import UnclaimedTalentBooking from "../../../emails/workspace/UnclaimedTalentBooking";
import type { CatalogEntry } from "./types";
import { str } from "./catalog-audiences";
import { loadUnclaimedBookingView, unclaimedTalentWorkspaceStaff } from "./catalog-audiences-unclaimed";
import { pageUrl, inquiryPathForRole } from "./catalog-render";

const isEs = (locale: string | null | undefined) => (locale ?? "").toLowerCase().startsWith("es");

/**
 * booking.confirmed → the workspace staff, when a booked talent has not claimed
 * their profile (TUL-647). Complements `booking.confirmed.talent`, which has
 * nobody to reach for those profiles. In-app + email.
 */
const BOOKING_CONFIRMED_UNCLAIMED_TALENT: CatalogEntry = {
  id: "booking.confirmed.unclaimed_talent",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.confirmed"],
  hydrate: loadUnclaimedBookingView,
  resolveAudience: unclaimedTalentWorkspaceStaff,
  in_app: {
    kind: "booking",
    surface: "workspace",
    title: (_event, recipient) =>
      isEs(recipient.locale)
        ? "Reserva para un talento sin perfil reclamado"
        : "Booking for a talent who hasn't claimed their profile",
    body: (event, recipient) => {
      const talent = str(event.payload.unclaimedTalentNames);
      return isEs(recipient.locale)
        ? `${talent ?? "El talento"} no ha reclamado su perfil y no fue notificado. Contáctalo directamente.`
        : `${talent ?? "The talent"} hasn't claimed their profile and was not notified. Reach out to them directly.`;
    },
  },
  email: {
    templateId: "workspace.unclaimed_talent_booking",
    subject: () => "A booking needs you: the talent has not claimed their profile",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(UnclaimedTalentBooking, {
        recipientName: recipient.displayName,
        talentNames: str(event.payload.unclaimedTalentNames),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, inquiryPathForRole("workspace_member", event.inquiryId)),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

export const UNCLAIMED_CATALOG_ENTRIES: CatalogEntry[] = [BOOKING_CONFIRMED_UNCLAIMED_TALENT];
