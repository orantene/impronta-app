import "server-only";

import * as React from "react";
import NewWorkspaceAlert from "../../../emails/platform/NewWorkspaceAlert";
import ClientInquiryReceived from "../../../emails/client/InquiryReceived";
import ClientOfferReady from "../../../emails/client/OfferReady";
import ClientBookingConfirmed from "../../../emails/client/BookingConfirmed";
import TalentInquiryInvited from "../../../emails/talent/InquiryInvited";
import TalentBookingConfirmed from "../../../emails/talent/BookingConfirmed";
import WorkspaceCoordinatorAssigned from "../../../emails/workspace/CoordinatorAssigned";
import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";
import { resolveInquiryRecipients } from "./recipients";
import type {
  AudienceContext,
  AudienceMember,
  CatalogEntry,
  NotificationEvent,
} from "./types";

/**
 * The notification catalog — a code-driven registry, one entry per
 * notification type (spec §2.1). Templates are React components, audience
 * resolvers are TypeScript functions, channels are compile-time imports.
 *
 * Phase 5 wires the inquiry engine through the dispatcher. The `triggers`
 * strings match `ENGINE_EVENT_TYPES` values in
 * `@/lib/inquiry/inquiry-events` — kept as string literals (not an import) so
 * the catalog stays decoupled from the engine and there's no import cycle
 * (inquiry-events imports this module).
 *
 * Every inquiry entry is EMAIL-ONLY. In-app bell notifications for these
 * events are already emitted by the engine's `notifyUsers` path
 * (listener[1]); routing in_app here too would double-notify.
 */

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Narrow an unknown payload value to a non-empty trimmed string, else null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/**
 * Build an absolute URL on the recipient's branded host. `brand.homeHref` is
 * the agency's primary custom domain when set (tenant resolved from host →
 * bare paths work), else the platform site URL.
 */
function pageUrl(brand: EmailBrand, path: string): string {
  return `${brand.homeHref.replace(/\/$/, "")}${path}`;
}

/**
 * Hydrate inquiry context for an inquiry-scoped event. The engine event only
 * carries its `data` block (e.g. `{ offerId }` or `{ bookingId }`); templates
 * + resolvers need the inquiry's contact, schedule, client + coordinator and —
 * when present — the current offer total. The dispatcher merges this into
 * `event.payload` before resolveAudience + render run.
 */
async function loadInquiryView(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const inquiryId = event.inquiryId;
  if (!inquiryId) return {};

  const { data } = await ctx.admin
    .from("inquiries")
    .select(
      "contact_name, contact_email, event_date, event_location, client_user_id, coordinator_id, current_offer_id",
    )
    .eq("id", inquiryId)
    .maybeSingle();
  if (!data) return {};
  const inq = data as {
    contact_name: string | null;
    contact_email: string | null;
    event_date: string | null;
    event_location: string | null;
    client_user_id: string | null;
    coordinator_id: string | null;
    current_offer_id: string | null;
  };

  let offerTotal: string | null = null;
  if (inq.current_offer_id) {
    const { data: offerRow } = await ctx.admin
      .from("inquiry_offers")
      .select("total_client_price, currency_code")
      .eq("id", inq.current_offer_id)
      .maybeSingle();
    const offer = offerRow as
      | { total_client_price: number | null; currency_code: string | null }
      | null;
    if (offer && offer.total_client_price != null) {
      offerTotal = `${offer.currency_code ?? ""} ${Number(offer.total_client_price).toFixed(2)}`.trim();
    }
  }

  return {
    contactName: inq.contact_name,
    contactEmail: inq.contact_email,
    eventDate: inq.event_date,
    eventLocation: inq.event_location,
    clientUserId: inq.client_user_id,
    coordinatorId: inq.coordinator_id,
    offerTotal,
  };
}

// ─── Audience resolvers ──────────────────────────────────────────────────────
// Read from the hydrated payload (loadInquiryView) + the shared recipient
// resolver. Each returns lightweight AudienceMembers; the dispatcher hydrates
// them to addresses and dedupes.

/** The inquiry client — the authenticated user if known, else the guest contact. */
const clientOrGuest = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const clientUserId = str(event.payload.clientUserId);
  if (clientUserId) return [{ kind: "user", userId: clientUserId, role: "client" }];
  const email = str(event.payload.contactEmail);
  if (email) {
    return [
      { kind: "guest", email, displayName: str(event.payload.contactName), role: "client" },
    ];
  }
  return [];
};

/** Every active talent on the inquiry roster, by their user account. */
const allRosterTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.inquiryId || !event.tenantId) return [];
  const r = await resolveInquiryRecipients(ctx.admin, event.inquiryId, event.tenantId);
  return r.talentUserIds.map((userId) => ({ kind: "user", userId, role: "talent" as const }));
};

/** The assigned coordinator, when the inquiry has one. */
const assignedCoordinator = async (event: NotificationEvent): Promise<AudienceMember[]> => {
  const coordinatorId = str(event.payload.coordinatorId);
  if (!coordinatorId) return [];
  return [{ kind: "user", userId: coordinatorId, role: "workspace_member" }];
};

/** The single talent named in a `roster.talent_invited` event. */
const invitedTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const talentProfileId = str(event.payload.talentProfileId);
  if (!talentProfileId) return [];
  const { data } = await ctx.admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  const userId = (data as { user_id: string | null } | null)?.user_id ?? null;
  if (!userId) return [];
  return [{ kind: "user", userId, role: "talent" }];
};

// ─── Inquiry-engine entries (Phase 5) ─────────────────────────────────────────

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

// ─── Self-test (Phase 2) ──────────────────────────────────────────────────────
//
// Exercises the full pipeline (audience → prefs → dedupe log → channel
// handlers) end-to-end without a real engine event. To run manually:
//   dispatchEventNotifications({
//     type: "notification.selftest",
//     tenantId: "<a real tenant id>",
//     userId: "<your user id>",
//     eventId: crypto.randomUUID(),
//     payload: {},
//   })
const SELF_TEST: CatalogEntry = {
  id: "platform.notification_selftest",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["notification.selftest"],
  resolveAudience: async (event) => {
    if (!event.userId) return [];
    return [{ kind: "user", userId: event.userId, role: "platform_admin" }];
  },
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Notification engine self-test",
    body: () => "If you can see this, the in-app channel is wired correctly.",
  },
  email: {
    templateId: "platform.notification_selftest",
    subject: () => "Tulala notification engine — self-test",
    render: ({ event, brand }) =>
      React.createElement(NewWorkspaceAlert, {
        workspaceName: String(event.payload.workspaceName ?? "Self-test workspace"),
        ownerEmail: String(event.payload.ownerEmail ?? "selftest@tulala.digital"),
        planLabel: String(event.payload.planLabel ?? "Agency"),
        adminUrl: String(event.payload.adminUrl ?? "https://tulala.digital/platform/admin"),
        brand,
      }),
  },
};

export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  INQUIRY_SUBMITTED_CLIENT,
  INQUIRY_SUBMITTED_COORDINATOR,
  INQUIRY_SUBMITTED_TALENT,
  OFFER_SENT_CLIENT,
  BOOKING_CREATED_CLIENT,
  BOOKING_CREATED_TALENT,
  ROSTER_TALENT_INVITED,
  SELF_TEST,
];

/** All catalog entries that subscribe to a given domain event type. */
export function findCatalogEntries(eventType: string): CatalogEntry[] {
  return NOTIFICATION_CATALOG.filter((entry) => entry.triggers.includes(eventType));
}
