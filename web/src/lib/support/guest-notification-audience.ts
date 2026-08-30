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

export function shouldEmitGuestAgentReply(input: {
  surface: string;
  requesterUserId: string | null;
  contactEmail: string | null;
}): boolean {
  return input.surface === "guest" && !input.requesterUserId && Boolean(input.contactEmail?.trim());
}
