import "server-only";

import * as React from "react";
import NewWorkspaceAlert from "../../../emails/platform/NewWorkspaceAlert";
import UsageQuotaAlert from "../../../emails/platform/UsageQuotaAlert";
import SignupFailedAlert from "../../../emails/platform/SignupFailedAlert";
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

/**
 * Workspace owners + admins for the event's tenant — the people who triage
 * ops-level alerts (assignment time-outs, offer outcomes). Keys on
 * `agency_memberships.profile_id` (→ `profiles.id`, the canonical user id);
 * the engine resolves `event.tenantId` from the inquiry before dispatch.
 *
 * NB: this deliberately selects `profile_id`, not `user_id` — that column
 * does not exist on `agency_memberships` (the `user_id` select in
 * `recipients.ts` is a latent bug that silently returns zero rows).
 */
const workspaceAdmins = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  if (!event.tenantId) return [];
  const { data, error } = await ctx.admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", event.tenantId)
    .eq("status", "active")
    .in("role", ["owner", "admin"]);
  if (error || !data) return [];
  return (data as Array<{ profile_id: string | null }>)
    .map((r) => r.profile_id)
    .filter((id): id is string => Boolean(id))
    .map((userId) => ({ kind: "user" as const, userId, role: "workspace_member" as const }));
};

/**
 * Offer-outcome audience: the assigned coordinator plus every workspace
 * owner/admin. The dispatcher dedupes by recipient, so a coordinator who is
 * also an admin is only notified once.
 */
const coordinatorAndAdmins = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const [coordinator, admins] = await Promise.all([
    assignedCoordinator(event),
    workspaceAdmins(event, ctx),
  ]);
  return [...coordinator, ...admins];
};

/** Inquiry-cancellation audience: the client (or guest) plus all roster talent. */
const clientAndRosterTalent = async (
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const [client, talent] = await Promise.all([
    clientOrGuest(event),
    allRosterTalent(event, ctx),
  ]);
  return [...client, ...talent];
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

/**
 * All platform administrators (Phase 10). Identified by
 * `profiles.app_role = 'super_admin'` — the live schema has NO `platform_role`
 * column (see migration 20260520224524_platform_media_settings.sql:99-101,
 * where the same `OR platform_role` clause had to be trimmed because it failed
 * column-resolution). When Track B.2 adds `platform_role`, widen this query to
 * dual-read, matching `getPlatformRole` in `@/lib/access/platform-role`.
 *
 * Platform alerts must be emitted with `tenantId = null` so the dispatcher
 * resolves the platform brand — the `/platform/admin/*` links then point at the
 * platform host rather than an agency's custom domain.
 */
const platformAdmins = async (
  _event: NotificationEvent,
  ctx: AudienceContext,
): Promise<AudienceMember[]> => {
  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id")
    .eq("app_role", "super_admin");
  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((r) => ({
    kind: "user" as const,
    userId: r.id,
    role: "platform_admin" as const,
  }));
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

// ─── Platform admin entries (Phase 10) ────────────────────────────────────────
//
// Audience is always `platformAdmins` (every `app_role = 'super_admin'`).
// Producers MUST emit these with `tenantId = null` so the dispatcher resolves
// the platform brand and the `/platform/admin/*` CTA points at the platform
// host. The render fns deliberately ignore `unsubscribeUrl` — the platform
// templates take no such prop, and operational alerts to staff aren't an
// opt-out surface (the dispatcher still sets the List-Unsubscribe header for
// the non-required `platform_alerts` category, which is harmless here).
//
// These entries are catalog-ready; the upstream producers (signup flow,
// usage-audit cron, signup-failure path) don't yet emit notification events —
// wiring them is a documented follow-up (spec §12 migration table).

/** platform.new_workspace → alert platform admins that a workspace signed up. */
const PLATFORM_NEW_WORKSPACE: CatalogEntry = {
  id: "platform.new_workspace",
  category: "platform_alerts",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["platform.new_workspace", "workspace.created"],
  resolveAudience: platformAdmins,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: (event) => `${str(event.payload.workspaceName) ?? "A new workspace"} signed up`,
    body: (event) => {
      const plan = str(event.payload.planLabel);
      return plan ? `New ${plan} workspace on Tulala.` : "New workspace on Tulala.";
    },
  },
  email: {
    templateId: "platform.new_workspace",
    subject: (event) => `New workspace: ${str(event.payload.workspaceName) ?? "signup"}`,
    render: ({ event, brand }) =>
      React.createElement(NewWorkspaceAlert, {
        workspaceName: str(event.payload.workspaceName) ?? "New workspace",
        ownerEmail: str(event.payload.ownerEmail) ?? "—",
        planLabel: str(event.payload.planLabel) ?? "Free",
        adminUrl: pageUrl(brand, "/platform/admin/tenants"),
        brand,
      }),
  },
};

/** platform.workspace_over_quota → usage-audit cron flags a workspace over quota. */
const PLATFORM_WORKSPACE_OVER_QUOTA: CatalogEntry = {
  id: "platform.workspace_over_quota",
  category: "platform_alerts",
  defaultChannels: ["email"],
  required: false,
  triggers: ["platform.workspace_over_quota"],
  resolveAudience: platformAdmins,
  email: {
    templateId: "platform.workspace_over_quota",
    subject: (event) => `${str(event.payload.workspaceName) ?? "A workspace"} is over quota`,
    render: ({ event, brand }) =>
      React.createElement(UsageQuotaAlert, {
        workspaceName: str(event.payload.workspaceName) ?? "A workspace",
        metricLabel: str(event.payload.metricLabel) ?? "usage",
        usageLabel: str(event.payload.usageLabel) ?? "over the plan limit",
        adminUrl: pageUrl(brand, "/platform/admin/tenants"),
        brand,
      }),
  },
};

/**
 * platform.workspace_signup_failed → a workspace signup didn't complete.
 * Spec §6.6 lists the id as `workspace.signup_failed`; the §12 remediation note
 * directs the producer to emit `platform.workspace_signup_failed`. We subscribe
 * to both so whichever the signup-failure path emits routes here. Scoped to
 * platform admins only — the one existing template is admin-toned ("may need a
 * manual follow-up"); a user-facing variant is a documented follow-up.
 */
const PLATFORM_SIGNUP_FAILED: CatalogEntry = {
  id: "platform.workspace_signup_failed",
  category: "platform_alerts",
  defaultChannels: ["email"],
  required: false,
  triggers: ["platform.workspace_signup_failed", "workspace.signup_failed"],
  resolveAudience: platformAdmins,
  email: {
    templateId: "platform.workspace_signup_failed",
    subject: () => "A workspace signup didn't complete",
    render: ({ event, brand }) =>
      React.createElement(SignupFailedAlert, {
        attemptedEmail:
          str(event.payload.attemptedEmail) ?? str(event.payload.ownerEmail) ?? "unknown",
        reason: str(event.payload.reason) ?? "Unknown error",
        adminUrl: pageUrl(brand, "/platform/admin/tenants"),
        brand,
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
  COORDINATOR_ASSIGNED,
  OFFER_DECLINED_WORKSPACE,
  OFFER_ACCEPTED_WORKSPACE,
  COORDINATOR_ASSIGNMENT_TIMED_OUT,
  ROSTER_TALENT_DECLINED,
  INQUIRY_CANCELLED,
  PLATFORM_NEW_WORKSPACE,
  PLATFORM_WORKSPACE_OVER_QUOTA,
  PLATFORM_SIGNUP_FAILED,
  SELF_TEST,
];

/** All catalog entries that subscribe to a given domain event type. */
export function findCatalogEntries(eventType: string): CatalogEntry[] {
  return NOTIFICATION_CATALOG.filter((entry) => entry.triggers.includes(eventType));
}

/**
 * A single catalog entry by its globally-unique id (e.g. "offer.sent.client"),
 * or null. The dispatch_log row stores this id in `catalog_entry_id`, so the
 * digest + retry crons resolve a logged row back to its entry (category,
 * template, render fn) through this lookup.
 */
export function findCatalogEntryById(id: string): CatalogEntry | null {
  return NOTIFICATION_CATALOG.find((entry) => entry.id === id) ?? null;
}
