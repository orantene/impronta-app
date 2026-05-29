import "server-only";

import * as React from "react";
import NewWorkspaceAlert from "../../../emails/platform/NewWorkspaceAlert";
import UsageQuotaAlert from "../../../emails/platform/UsageQuotaAlert";
import SignupFailedAlert from "../../../emails/platform/SignupFailedAlert";
import TalentClaimInvite from "../../../emails/talent/ClaimInvite";
import TalentWelcome from "../../../emails/talent/Welcome";
import WorkspaceTeamInvite from "../../../emails/workspace/TeamInvite";
import WorkspaceWelcome from "../../../emails/workspace/Welcome";
import type { CatalogEntry } from "./types";
import {
  emailInvitee,
  eventUser,
  platformAdmins,
  str,
} from "./catalog-audiences";
import { formatDateLabel, pageUrl, redeemHref } from "./catalog-render";
import { INQUIRY_CATALOG_ENTRIES } from "./catalog-entries-inquiry";

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
 * the platform-alert, workspace-invite, account-welcome, and self-test entries.
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
  PLATFORM_NEW_WORKSPACE,
  PLATFORM_WORKSPACE_OVER_QUOTA,
  PLATFORM_SIGNUP_FAILED,
  ROSTER_CLAIM_INVITE,
  WORKSPACE_TEAM_INVITE,
  WORKSPACE_SIGNUP_WELCOME,
  TALENT_WELCOME_ENTRY,
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
