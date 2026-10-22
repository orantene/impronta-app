import { isClientCardKind } from "@/lib/messages-v5/client-thread-view";
import type { GuestMessageAuthorRole } from "@/lib/inquiry/guest-chat-contract";

type AuthorRow = {
  sender_user_id: string | null;
  guest_session_id: string | null;
  message_kind: string;
  metadata?: unknown;
};

type AuthorIdentity = { role: "client" | "coordinator" | "talent" };

/**
 * Who a thread row is, from the guest's point of view.
 *
 * TUL-1852: after the email-code sign-in the claim re-stamps the guest's own
 * lines with `sender_user_id = <the new client user>` (guest-claim-relink,
 * claim-everything). The row then looked up a participant identity by that user
 * id and could land on a talent/coordinator label. The inquiry's own client
 * (`clientUserId`) and the original guest session are authoritative for "this is
 * the guest", so they are checked before any participant lookup.
 */
export function deriveAuthorRole(
  row: AuthorRow,
  thisGuestSessionId: string,
  identityByUserId: ReadonlyMap<string, AuthorIdentity>,
  clientUserId: string | null = null,
): GuestMessageAuthorRole {
  // Guest's own message (this session), before or after the claim stamped a user id.
  if (row.guest_session_id && row.guest_session_id === thisGuestSessionId) return "guest";
  if (clientUserId && row.sender_user_id === clientUserId) return "guest";
  // A3 / SHELL-REQUESTS: a payment_paid (or other client card) with no sender
  // must still draw as a paid card, not a system note.
  if (!row.sender_user_id) {
    if (isClientCardKind(row.message_kind)) return "staff";
    return "system";
  }
  // Engine-authored lines ("Offer v3 sent", auto-ack) carry
  // metadata.system_event_type even when a staff user id is stamped as the
  // actor; they are system lines, never a staff bubble (Messages v5 rule:
  // ThreadMessage.system). Found live 2026-09-17 on the fixture tenant.
  const meta = row.metadata;
  if (meta && typeof meta === "object" && typeof (meta as { system_event_type?: unknown }).system_event_type === "string") {
    return "system";
  }
  const ident = identityByUserId.get(row.sender_user_id);
  if (!ident) return "other";
  if (ident.role === "coordinator") return "staff";
  if (ident.role === "talent") return "talent";
  // The client participant — for the guest that's effectively "their own
  // account" voice; render as guest-side so it aligns right.
  if (ident.role === "client") return "guest";
  return "other";
}

