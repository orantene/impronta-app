import type { AudienceMember } from "@/lib/notifications/types";

/**
 * Audience for guest-surface support mail. A ticket with no requester_user_id
 * and a contact_email MUST resolve a non-empty audience — otherwise Oran
 * replies into the void (eventUser returns [] on a null userId).
 */
export function resolveGuestSupportAudience(input: {
  requesterUserId: string | null;
  contactEmail: string | null;
  contactName?: string | null;
}): AudienceMember[] {
  const email = input.contactEmail?.trim();
  if (email) {
    return [
      {
        kind: "guest",
        email,
        displayName: input.contactName?.trim() || null,
        role: "guest",
      },
    ];
  }
  if (input.requesterUserId) {
    return [{ kind: "user", userId: input.requesterUserId, role: "guest" }];
  }
  return [];
}

/** True when the requester can only be reached via contact_email. */
export function shouldEmitGuestRequesterMail(input: {
  surface: string;
  requesterUserId: string | null;
  contactEmail: string | null;
}): boolean {
  return input.surface === "guest" && !input.requesterUserId && Boolean(input.contactEmail?.trim());
}

/** @deprecated use shouldEmitGuestRequesterMail */
export const shouldEmitGuestAgentReply = shouldEmitGuestRequesterMail;

/**
 * Distinct triggers (own event row) that must reach a pure guest by email.
 * Never add a second catalog entry on the non-.guest trigger.
 */
export const GUEST_REQUESTER_MAIL_TRIGGERS = [
  "support.message.agent.guest",
  "support.ticket.resolved.guest",
  "support.guest.contact.confirm",
  "support.ticket.autoclose.guest",
  "support.ticket.fixed.guest",
] as const;

/**
 * eventUser entries that must NOT grow a guest sibling.
 * proposed_action: workspace approve UI; guests cannot act.
 * feature_request: guests cannot file ideas (narrower CHECK).
 */
export const GUEST_UNREACHABLE_EVENTUSER_TRIGGERS = [
  "support.proposed_action.expired",
  "support.feature_request.updated",
] as const;

/**
 * Every catalog entry that uses eventUser. Decision (a) = guest sibling
 * with a distinct trigger. Decision (b) = must not reach a guest, with why.
 */
export const EVENTUSER_SUPPORT_DECISIONS = [
  {
    trigger: "support.message.agent",
    decision: "a" as const,
    sibling: "support.message.agent.guest",
    why: "Pure guests have no userId; agent replies must reach contact_email.",
  },
  {
    trigger: "support.ticket.resolved",
    decision: "a" as const,
    sibling: "support.ticket.resolved.guest",
    why: "Resolved state must reach the prospect inbox.",
  },
  {
    trigger: "support.ticket.autoclose",
    decision: "a" as const,
    sibling: "support.ticket.autoclose.guest",
    why: "Inactivity autoclose must tell the prospect.",
  },
  {
    trigger: "support.ticket.fixed",
    decision: "a" as const,
    sibling: "support.ticket.fixed.guest",
    why: "Issue-fixed mail must tell the prospect.",
  },
  {
    trigger: "support.proposed_action.expired",
    decision: "b" as const,
    sibling: null,
    why: "Workspace approve UI only. Guests cannot act on proposed fixes. in_app only.",
  },
  {
    trigger: "support.feature_request.updated",
    decision: "b" as const,
    sibling: null,
    why: "Guests cannot file ideas (narrower CHECK). No guest sibling.",
  },
] as const;
