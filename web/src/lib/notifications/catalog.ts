import "server-only";

import * as React from "react";
import NewWorkspaceAlert from "../../../emails/platform/NewWorkspaceAlert";
import UsageQuotaAlert from "../../../emails/platform/UsageQuotaAlert";
import SignupFailedAlert from "../../../emails/platform/SignupFailedAlert";
import TalentClaimInvite from "../../../emails/talent/ClaimInvite";
import TalentWelcome from "../../../emails/talent/Welcome";
import TalentProfileApproved from "../../../emails/talent/ProfileApproved";
import TalentJoinApproved from "../../../emails/talent/JoinApproved";
import TalentJoinDeclined from "../../../emails/talent/JoinDeclined";
import RosterJoinRequest from "../../../emails/workspace/RosterJoinRequest";
import WorkspaceTeamInvite from "../../../emails/workspace/TeamInvite";
import WorkspaceWelcome from "../../../emails/workspace/Welcome";
import BookingCanceled from "../../../emails/workspace/BookingCanceled";
import DayOfReminder from "../../../emails/notifications/DayOfReminder";
import SeatLimitReached from "../../../emails/workspace/SeatLimitReached";
import type { CatalogEntry } from "./types";
import {
  allRosterTalent,
  assignedCoordinator,
  clientOrGuest,
  emailInvitee,
  eventUser,
  loadInquiryView,
  platformAdmins,
  str,
  workspaceAdmins,
  workspaceManagersPlus,
} from "./catalog-audiences";
import { formatDateLabel, pageUrl, redeemHref, inquiryPathForRole } from "./catalog-render";
import { INQUIRY_CATALOG_ENTRIES } from "./catalog-entries-inquiry";
import { BILLING_CATALOG_ENTRIES } from "./catalog-entries-billing";
import { FORMS_CATALOG_ENTRIES } from "./catalog-entries-forms";
import { REVIEWS_CATALOG_ENTRIES } from "./catalog-entries-reviews";

/**
 * The notification catalog — a code-driven registry, one entry per
 * notification type (spec §2.1). Templates are React components, audience
 * resolvers are TypeScript functions, channels are compile-time imports.
 *
 * The inquiry-engine entries (spec §6, Phase 5) live in
 * `catalog-entries-inquiry.ts`; the render-only URL/date helpers live in
 * `catalog-render.ts`; `str` + the audience resolvers + inquiry hydrator live
 * in `catalog-audiences.ts`. All were extracted to keep this file under the
 * 800-line cap. This module assembles the full `NOTIFICATION_CATALOG` and owns
 * the platform-alert, workspace-invite, workspace/talent welcome, and self-test entries.
 */

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

// ─── Workspace invite entries (§12 producer conversions) ──────────────────────
//
// These replace direct `sendEmail` calls in the roster-invite + team-invite
// server actions with dispatcher-routed email. Recipients are email-only (no
// account yet), so the resolvers return a `guest` member and the dispatcher
// delivers email-only. Producers emit with the agency `tenantId` so the brand
// resolves to the workspace and the claim/redeem links land on its host.

/**
 * roster.claim_invite_requested → invite a talent to claim their roster
 * profile. Two producers emit this: the initial roster-add invite (no token,
 * redeems at /get-started) and the token-based resend from the talent profile
 * section (carries `redeemPath` + `expiresAtIso` + `isResend`). The template
 * shows the expiry line only when an `expiresAtIso` is supplied.
 */
const ROSTER_CLAIM_INVITE: CatalogEntry = {
  id: "roster.claim_invite.talent",
  category: "roster_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["roster.claim_invite_requested"],
  resolveAudience: emailInvitee("talent"),
  email: {
    templateId: "talent.claim_invite",
    subject: (event) => {
      const agency = str(event.payload.workspaceName) ?? "A workspace";
      const prefix = event.payload.isResend ? "Reminder · " : "";
      return `${prefix}${agency} invited you to claim your profile on Tulala`;
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(TalentClaimInvite, {
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        talentDisplayName: recipient.displayName ?? str(event.payload.inviteeName),
        redeemUrl: redeemHref(brand, str(event.payload.redeemPath) ?? "/get-started"),
        expiresLabel: formatDateLabel(str(event.payload.expiresAtIso)),
        brand,
      }),
  },
};

/**
 * workspace.team_invite_sent → invite a new member to join a workspace team.
 * The token always carries an expiry, so `expiresAtIso` is expected; the
 * `redeemPath` is the `/team-invite/<id>` redeem route.
 */
const WORKSPACE_TEAM_INVITE: CatalogEntry = {
  id: "workspace.team_invite.invitee",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["workspace.team_invite_sent"],
  resolveAudience: emailInvitee("guest"),
  email: {
    templateId: "workspace.team_invite",
    subject: (event) => {
      const inviter = str(event.payload.inviterName) ?? "A teammate";
      const agency = str(event.payload.workspaceName) ?? "a workspace";
      return `${inviter} invited you to ${agency} on Tulala`;
    },
    render: ({ event, brand }) =>
      React.createElement(WorkspaceTeamInvite, {
        inviterName: str(event.payload.inviterName) ?? "A teammate",
        agencyName: str(event.payload.workspaceName) ?? brand.accountName,
        roleLabel: str(event.payload.roleLabel) ?? "Member",
        redeemUrl: redeemHref(brand, str(event.payload.redeemPath) ?? "/"),
        expiresLabel: formatDateLabel(str(event.payload.expiresAtIso)) ?? "soon",
        brand,
      }),
  },
};

// ─── Account-lifecycle welcomes (spec §6.6 / §12) ─────────────────────────────
//
// Both fire once at signup, before the user has any saved preferences, so the
// dispatcher's default-on channels apply. Email-only — the in-app surface the
// user is about to land on is itself the "welcome", so a bell would be noise.

/**
 * workspace.signup_welcome (§6.6) — the new workspace owner. `tenantId` carries
 * the agency brand so the email + dashboard link render on their host;
 * `userId` is the owner, resolved by `eventUser`. Producer:
 * `workspace-signup.server.ts` emits `workspace.signup_completed`.
 */
const WORKSPACE_SIGNUP_WELCOME: CatalogEntry = {
  id: "workspace.signup_welcome",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["workspace.signup_completed"],
  resolveAudience: eventUser("workspace_member"),
  email: {
    templateId: "workspace.signup_welcome",
    subject: (event) => {
      const ws = str(event.payload.workspaceName) ?? "Your workspace";
      return `${ws} is ready on Tulala`;
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(WorkspaceWelcome, {
        ownerName: recipient.displayName ?? str(event.payload.ownerName),
        workspaceName: str(event.payload.workspaceName) ?? brand.accountName,
        planLabel: str(event.payload.planLabel) ?? "Free",
        adminUrl: redeemHref(brand, str(event.payload.adminUrl) ?? "/"),
        publicUrl: redeemHref(brand, str(event.payload.publicUrl) ?? "/"),
        brand,
      }),
  },
};

/**
 * account.talent_welcome (§12: onboarding/actions.ts) — the freshly-onboarded
 * talent. Platform-scoped (`tenantId: null` → Tulala brand): a talent isn't
 * tenant-bound at onboarding, and the dashboard link points at the platform
 * host. `userId` is the talent, resolved by `eventUser`.
 */
const TALENT_WELCOME_ENTRY: CatalogEntry = {
  id: "account.talent_welcome",
  category: "workspace_activity",
  defaultChannels: ["email"],
  required: false,
  triggers: ["account.talent_onboarded"],
  resolveAudience: eventUser("talent"),
  email: {
    templateId: "account.talent_welcome",
    subject: (event, recipient) => {
      const full = str(event.payload.talentName) ?? recipient.displayName;
      const first = full?.trim() ? full.split(" ")[0] : null;
      return first ? `Welcome to Tulala, ${first}` : "Welcome to Tulala — your profile is ready";
    },
    render: ({ event, recipient, brand }) =>
      React.createElement(TalentWelcome, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        dashboardUrl: pageUrl(brand, "/talent"),
        brand,
      }),
  },
};

// ─── Booking + roster-moderation entries (Slice 15.5, direct dispatch) ────────
//
// Unlike the inquiry-engine entries (catalog-entries-inquiry.ts), these are
// dispatched directly from server actions — the pipeline cancel-booking action
// and the roster site-visibility actions — NOT through the engine's
// `notifyUsers` path. So no in_app bell is emitted upstream, and these entries
// own BOTH channels themselves with no double-notify risk. Producers emit with
// the agency `tenantId` (required for in_app delivery) and, for booking events,
// the source `inquiryId` (so `loadInquiryView` can hydrate contact + schedule).

/**
 * talent.profile_approved (spec §6.3) — a roster talent's profile was made
 * site-visible by a workspace admin (roster_only → site_visible). `userId` is
 * the talent (resolved by `eventUser`); `tenantId` is the agency, so the bell
 * lands on the talent's surface and the brand resolves to the workspace. The
 * producer passes an absolute `profileUrl` (the canonical /t/<code> page),
 * which `redeemHref` passes through unchanged.
 */
const TALENT_PROFILE_APPROVED: CatalogEntry = {
  id: "talent.profile_approved",
  category: "roster_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["talent.profile_approved"],
  resolveAudience: eventUser("talent"),
  in_app: {
    kind: "profile",
    surface: "talent",
    title: () => "Your profile is approved",
    body: () => "It's now visible and discoverable to clients.",
  },
  email: {
    templateId: "talent.profile_approved",
    subject: () => "Your profile is approved",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentProfileApproved, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        profileUrl: redeemHref(brand, str(event.payload.profileUrl) ?? "/talent"),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

// ─── Tenant Registration Engine (roster join requests, direct dispatch) ───────

/** roster.join_requested → workspace Manager+ for the tenant. */
const ROSTER_JOIN_REQUESTED: CatalogEntry = {
  id: "roster.join_requested.workspace",
  category: "roster_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["roster.join_requested"],
  resolveAudience: workspaceManagersPlus,
  in_app: {
    kind: "approval",
    surface: "workspace",
    title: (event) =>
      `${str(event.payload.talentName) ?? "A talent"} requested to join your roster`,
    body: () => "Review and approve or decline the request.",
  },
  email: {
    templateId: "roster.join_requested",
    subject: (event) =>
      `${str(event.payload.talentName) ?? "New talent"} wants to join your roster`,
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(RosterJoinRequest, {
        recipientName: recipient.displayName,
        talentName: str(event.payload.talentName),
        reviewUrl:
          str(event.payload.reviewUrl) ?? pageUrl(brand, "/admin/roster/registration"),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/** roster.join_approved → the applicant talent (event.userId). */
const ROSTER_JOIN_APPROVED: CatalogEntry = {
  id: "roster.join_approved.talent",
  category: "roster_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["roster.join_approved"],
  resolveAudience: eventUser("talent"),
  in_app: {
    kind: "approval",
    surface: "talent",
    title: (event) => {
      const team = str(event.payload.workspaceName);
      return team ? `You're on ${team}'s roster` : "Your roster request was approved";
    },
    body: () => "You're now part of the team roster.",
  },
  email: {
    templateId: "roster.join_approved",
    subject: (event) => {
      const team = str(event.payload.workspaceName);
      return team ? `You're on ${team}'s roster` : "Your roster request was approved";
    },
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentJoinApproved, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        workspaceName: str(event.payload.workspaceName),
        dashboardUrl: str(event.payload.dashboardUrl) ?? redeemHref(brand, "/talent"),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/** roster.join_rejected → the applicant talent (event.userId). */
const ROSTER_JOIN_REJECTED: CatalogEntry = {
  id: "roster.join_rejected.talent",
  category: "roster_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["roster.join_rejected"],
  resolveAudience: eventUser("talent"),
  in_app: {
    kind: "system",
    surface: "talent",
    title: () => "Update on your roster request",
    body: (event) => {
      const team = str(event.payload.workspaceName);
      return team
        ? `${team} isn't able to add you to their roster right now.`
        : "Your request wasn't approved at this time.";
    },
  },
  email: {
    templateId: "roster.join_rejected",
    subject: () => "Update on your roster request",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(TalentJoinDeclined, {
        talentName: str(event.payload.talentName) ?? recipient.displayName,
        workspaceName: str(event.payload.workspaceName),
        exploreUrl:
          str(event.payload.exploreUrl) ?? redeemHref(brand, "/talent/discover-agencies"),
        brand,
        unsubscribeUrl,
        categoryLabel: "roster",
      }),
  },
};

/**
 * booking.cancelled → the client (or guest). Surface-scoped to `client` so the
 * in-app bell lands on the client dashboard; the link points at the client's
 * own inquiry view.
 */
const BOOKING_CANCELLED_CLIENT: CatalogEntry = {
  id: "booking.cancelled.client",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.cancelled"],
  hydrate: loadInquiryView,
  resolveAudience: clientOrGuest,
  in_app: {
    kind: "booking",
    surface: "client",
    title: () => "Your booking was cancelled",
    body: (event) => {
      const date = str(event.payload.eventDate);
      return date
        ? `The booking for ${date} has been cancelled.`
        : "Your booking has been cancelled.";
    },
  },
  email: {
    templateId: "client.booking_cancelled",
    subject: () => "Your booking was cancelled",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(BookingCanceled, {
        recipientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

/**
 * booking.cancelled → every talent on the booking. Surface-scoped to `talent`;
 * the link points at the talent inquiry view.
 */
const BOOKING_CANCELLED_TALENT: CatalogEntry = {
  id: "booking.cancelled.talent",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.cancelled"],
  hydrate: loadInquiryView,
  resolveAudience: allRosterTalent,
  in_app: {
    kind: "booking",
    surface: "talent",
    title: () => "A booking was cancelled",
    body: (event) => {
      const contact = str(event.payload.contactName);
      const date = str(event.payload.eventDate);
      const who = contact ? `${contact}'s booking` : "A booking";
      return date ? `${who} on ${date} has been cancelled.` : `${who} has been cancelled.`;
    },
  },
  email: {
    templateId: "talent.booking_cancelled",
    subject: () => "A booking was cancelled",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(BookingCanceled, {
        recipientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, inquiryPathForRole("talent", event.inquiryId)),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

/**
 * booking.cancelled → the assigned coordinator. Surface-scoped to `workspace`;
 * the link points at the admin work queue.
 */
const BOOKING_CANCELLED_COORDINATOR: CatalogEntry = {
  id: "booking.cancelled.coordinator",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.cancelled"],
  hydrate: loadInquiryView,
  resolveAudience: assignedCoordinator,
  in_app: {
    kind: "booking",
    surface: "workspace",
    title: () => "A booking was cancelled",
    body: (event) => {
      const contact = str(event.payload.contactName);
      const date = str(event.payload.eventDate);
      const who = contact ? `${contact}'s booking` : "A booking";
      return date ? `${who} on ${date} has been cancelled.` : `${who} has been cancelled.`;
    },
  },
  email: {
    templateId: "workspace.booking_cancelled",
    subject: () => "A booking was cancelled",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(BookingCanceled, {
        recipientName: recipient.displayName ?? str(event.payload.contactName),
        contactName: str(event.payload.contactName),
        eventDate: str(event.payload.eventDate),
        inquiryUrl: pageUrl(brand, `/admin/work/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

// ─── Day-of booking reminder (spec §6.4, Slice 15.6, direct dispatch) ─────────
//
// The `booking-reminders` cron (24h before `event_date`) dispatches
// `booking.day_of_reminder` once per booking with the agency `tenantId`, the
// source `inquiryId` (so `loadInquiryView` hydrates schedule + roster), and a
// stable `eventId` (`booking-reminder:<bookingId>`) so a re-run is a dedupe
// no-op. Like booking.cancelled this is direct-dispatch (no engine `notifyUsers`
// upstream), so each entry owns BOTH channels. The client + every booked talent
// get the same "your event is tomorrow" message; the two surface-scoped entries
// exist only so the in-app bell routes to the right dashboard and the CTA points
// at each role's own inquiry view. No `contactName` is passed to the template —
// the heading is the neutral "Your event is tomorrow", not the client's name.

/**
 * booking.day_of_reminder → the client (or guest). Surface-scoped to `client`
 * so the in-app bell lands on the client dashboard; the link points at the
 * client's own inquiry view.
 */
const BOOKING_DAY_OF_REMINDER_CLIENT: CatalogEntry = {
  id: "booking.day_of_reminder.client",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.day_of_reminder"],
  hydrate: loadInquiryView,
  resolveAudience: clientOrGuest,
  in_app: {
    kind: "booking",
    surface: "client",
    title: () => "Your event is tomorrow",
    body: (event) => {
      const date = str(event.payload.eventDate);
      return date ? `Your booking on ${date} is tomorrow.` : "Your booking is tomorrow.";
    },
  },
  email: {
    templateId: "client.booking_day_of_reminder",
    subject: () => "Reminder: your event is tomorrow",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(DayOfReminder, {
        recipientName: recipient.displayName ?? str(event.payload.contactName),
        eventDate: formatDateLabel(str(event.payload.eventDate)) ?? null,
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, `/client/inquiries/${event.inquiryId}`),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

/**
 * booking.day_of_reminder → every talent on the booking. Surface-scoped to
 * `talent`; the link points at the talent inquiry view.
 */
const BOOKING_DAY_OF_REMINDER_TALENT: CatalogEntry = {
  id: "booking.day_of_reminder.talent",
  category: "bookings",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["booking.day_of_reminder"],
  hydrate: loadInquiryView,
  resolveAudience: allRosterTalent,
  in_app: {
    kind: "booking",
    surface: "talent",
    title: () => "Your event is tomorrow",
    body: (event) => {
      const date = str(event.payload.eventDate);
      return date ? `Your booking on ${date} is tomorrow.` : "Your booking is tomorrow.";
    },
  },
  email: {
    templateId: "talent.booking_day_of_reminder",
    subject: () => "Reminder: your event is tomorrow",
    render: ({ event, recipient, brand, unsubscribeUrl }) =>
      React.createElement(DayOfReminder, {
        recipientName: recipient.displayName,
        eventDate: formatDateLabel(str(event.payload.eventDate)) ?? null,
        eventLocation: str(event.payload.eventLocation),
        inquiryUrl: pageUrl(brand, inquiryPathForRole("talent", event.inquiryId)),
        brand,
        unsubscribeUrl,
        categoryLabel: "booking",
      }),
  },
};

// ─── Workspace over seat limit (spec §6.6, Slice 15.7, direct dispatch) ───────
//
// The weekly `usage-audit` cron sweeps every active tenant and, for any whose
// roster (agency_talent_roster rows, status != 'removed') exceeds its finite
// `agencies.talent_seat_limit`, dispatches `workspace.over_seat_limit` with the
// agency `tenantId`, the headcount + limit, and a stable `eventId`
// (`seat-limit:<tenant>:<auditDate>`). The date in the eventId means a same-day
// re-run is a dedupe no-op, while each weekly run re-nudges a still-over tenant.
//
// Direct dispatch (no engine `notifyUsers` upstream), so the single entry owns
// BOTH channels with no double-notify risk. Audience is the workspace
// owners/admins (`workspaceAdmins`); the in-app bell lands on the admin surface
// and the CTA points at the account + billing page. Category `workspace_activity`
// + `required: false` keeps it mutable, but the "absent toggle = on" rule means
// a workspace that hasn't customized prefs still gets email + in_app by default.
const WORKSPACE_OVER_SEAT_LIMIT: CatalogEntry = {
  id: "workspace.over_seat_limit",
  category: "workspace_activity",
  defaultChannels: ["email", "in_app"],
  required: false,
  triggers: ["workspace.over_seat_limit"],
  resolveAudience: workspaceAdmins,
  in_app: {
    kind: "system",
    surface: "workspace",
    title: () => "Your roster is over its plan limit",
    body: (event) => {
      const active = Number(event.payload.activeCount);
      const limit = Number(event.payload.seatLimit);
      return Number.isFinite(active) && Number.isFinite(limit)
        ? `Your roster has ${active} talent — above your plan's limit of ${limit}.`
        : "Your roster is above your plan's seat limit.";
    },
  },
  email: {
    templateId: "workspace.over_seat_limit",
    subject: () => "Your roster is over its plan limit",
    render: ({ event, recipient, brand, unsubscribeUrl }) => {
      const active = Number(event.payload.activeCount);
      const limit = Number(event.payload.seatLimit);
      return React.createElement(SeatLimitReached, {
        recipientName: recipient.displayName,
        workspaceName: str(event.payload.workspaceName),
        activeCount: Number.isFinite(active) ? active : null,
        seatLimit: Number.isFinite(limit) ? limit : null,
        planLabel: str(event.payload.planLabel),
        accountUrl: pageUrl(brand, "/admin/account"),
        brand,
        unsubscribeUrl,
        categoryLabel: "workspace",
      });
    },
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
  ...INQUIRY_CATALOG_ENTRIES,
  ...BILLING_CATALOG_ENTRIES,
  ...FORMS_CATALOG_ENTRIES,
  ...REVIEWS_CATALOG_ENTRIES,
  PLATFORM_NEW_WORKSPACE,
  PLATFORM_WORKSPACE_OVER_QUOTA,
  PLATFORM_SIGNUP_FAILED,
  ROSTER_CLAIM_INVITE,
  WORKSPACE_TEAM_INVITE,
  WORKSPACE_SIGNUP_WELCOME,
  TALENT_WELCOME_ENTRY,
  TALENT_PROFILE_APPROVED,
  ROSTER_JOIN_REQUESTED,
  ROSTER_JOIN_APPROVED,
  ROSTER_JOIN_REJECTED,
  BOOKING_CANCELLED_CLIENT,
  BOOKING_CANCELLED_TALENT,
  BOOKING_CANCELLED_COORDINATOR,
  BOOKING_DAY_OF_REMINDER_CLIENT,
  BOOKING_DAY_OF_REMINDER_TALENT,
  WORKSPACE_OVER_SEAT_LIMIT,
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
