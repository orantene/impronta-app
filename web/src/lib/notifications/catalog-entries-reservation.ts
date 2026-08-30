import "server-only";

import * as React from "react";
import ClientInquiryReceived from "../../../emails/client/InquiryReceived";
import ClientReplyReady from "../../../emails/client/ReplyReady";
import ClientBookingConfirmed from "../../../emails/client/BookingConfirmed";
import WorkspaceCoordinatorAssigned from "../../../emails/workspace/CoordinatorAssigned";
import type { AudienceContext, CatalogEntry, NotificationEvent } from "./types";
import { clientOrGuest, loadInquiryView, str, workspaceAdmins } from "./catalog-audiences";
import { pageUrl } from "./catalog-render";
import { normalizeTenantAppointmentsSettings } from "@/lib/scheduling/appointments-settings-types";
import { terminologyCopy } from "@/lib/scheduling/terminology";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function noun(event: NotificationEvent): string {
  return str(event.payload.termSingular) ?? "reservation";
}

async function hydrateReservation(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const base = await loadInquiryView(event, ctx);
  let termSingular = str(event.payload.termSingular) ?? "reservation";
  if (event.tenantId) {
    const { data } = await ctx.admin
      .from("agencies")
      .select("settings")
      .eq("id", event.tenantId)
      .maybeSingle();
    const settings = isPlainObject(data?.settings) ? data.settings : null;
    const appointments = isPlainObject(settings?.appointments) ? settings.appointments : null;
    termSingular = terminologyCopy(
      normalizeTenantAppointmentsSettings(appointments).terminology,
      "en",
    ).singular;
  }
  return {
    ...base,
    termSingular,
    startsAt: str(event.payload.startsAt) ?? str(base.eventDate),
  };
}

const RESERVATION_REQUESTED_CLIENT: CatalogEntry = {
  id: "reservation.requested.client",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["reservation.requested"],
  hydrate: hydrateReservation,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.inquiry_received",
    subject: (event) => `We received your ${noun(event)} request`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(ClientInquiryReceived, {
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.startsAt) ?? str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "inquiry",
      }),
  },
};

const RESERVATION_REQUEST_RECEIVED: CatalogEntry = {
  id: "reservation.request_received.workspace",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["reservation.requested"],
  hydrate: hydrateReservation,
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "booking",
    surface: "workspace",
    title: (event) => `New ${noun(event)} request`,
    body: (event) => str(event.payload.contactName) ?? "A guest requested a time.",
  },
  email: {
    templateId: "workspace.coordinator_assigned",
    subject: (event) => `New ${noun(event)} request`,
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceCoordinatorAssigned, {
        coordinatorName: recipient.displayName,
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.startsAt) ?? str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

const RESERVATION_PROPOSED_CLIENT: CatalogEntry = {
  id: "reservation.proposed.client",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["reservation.proposed"],
  hydrate: hydrateReservation,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.reply_ready",
    subject: (event) => `A time was proposed for your ${noun(event)}`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(ClientReplyReady, {
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        threadUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "inquiry",
      }),
  },
};

const RESERVATION_CONFIRMED_WORKSPACE: CatalogEntry = {
  id: "reservation.confirmed.workspace",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["reservation.confirmed"],
  hydrate: hydrateReservation,
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "booking",
    surface: "workspace",
    title: (event) => `${noun(event)} confirmed`,
    body: (event) => str(event.payload.contactName) ?? "A guest time is confirmed.",
  },
  email: {
    templateId: "workspace.coordinator_assigned",
    subject: (event) => `${noun(event)} confirmed`,
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceCoordinatorAssigned, {
        coordinatorName: recipient.displayName,
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.startsAt) ?? str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

const RESERVATION_CONFIRMED_CLIENT: CatalogEntry = {
  id: "reservation.confirmed.client",
  category: "bookings",
  defaultChannels: ["email"],
  required: false,
  triggers: ["reservation.confirmed"],
  hydrate: hydrateReservation,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.booking_confirmed",
    subject: (event) => `Your ${noun(event)} is confirmed`,
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(ClientBookingConfirmed, {
        clientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.startsAt) ?? str(event.payload.eventDate),
        eventLocation: str(event.payload.eventLocation),
        bookingUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

const RESERVATION_DECLINED_CLIENT: CatalogEntry = {
  id: "reservation.declined.client",
  category: "inquiry_updates",
  defaultChannels: ["email"],
  required: false,
  triggers: ["reservation.declined"],
  hydrate: hydrateReservation,
  resolveAudience: clientOrGuest,
  email: {
    templateId: "client.reply_ready",
    subject: (event) => `Your ${noun(event)} was declined`,
    render: ({ event, brand, unsubscribeUrl }) =>
      React.createElement(ClientReplyReady, {
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        threadUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "inquiry",
      }),
  },
};

const RESERVATION_HOLD_EXPIRING: CatalogEntry = {
  id: "reservation.hold_expiring.workspace",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["reservation.hold_expiring"],
  hydrate: hydrateReservation,
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "booking",
    surface: "workspace",
    title: (event) => `${noun(event)} hold expires soon`,
    body: (event) => str(event.payload.startsAt) ?? "A held time is about to lapse.",
  },
  email: {
    templateId: "workspace.coordinator_assigned",
    subject: (event) => `${noun(event)} hold expires soon`,
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(WorkspaceCoordinatorAssigned, {
        coordinatorName: recipient.displayName,
        contactName: str(event.payload.contactName),
        agencyName: brand.accountName,
        eventDate: str(event.payload.startsAt) ?? str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace activity",
      }),
  },
};

export const RESERVATION_CATALOG_ENTRIES: CatalogEntry[] = [
  RESERVATION_REQUESTED_CLIENT,
  RESERVATION_REQUEST_RECEIVED,
  RESERVATION_PROPOSED_CLIENT,
  RESERVATION_CONFIRMED_CLIENT,
  RESERVATION_CONFIRMED_WORKSPACE,
  RESERVATION_DECLINED_CLIENT,
  RESERVATION_HOLD_EXPIRING,
];
