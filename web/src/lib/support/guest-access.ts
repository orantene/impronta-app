import type { SupabaseClient } from "@supabase/supabase-js";
import { supportFrom } from "./support-from";
import { mapTicketRow, type SupportTicketRow } from "./support-types";

export type GuestTicketIdentity = {
  guestSessionId: string | null;
  userId: string | null;
};

/**
 * Load a ticket by id with the service role, then allow ONLY if the
 * server-resolved guest session owns it, or a signed-in user is the
 * requester. Ticket ids are never trusted as proof of ownership.
 *
 * Session ids are NEVER accepted from the client. Callers must resolve
 * `identity.guestSessionId` via `resolveGuestSessionId()` (the
 * x-impronta-guest header). Extra fields on `identity` (e.g. a forged
 * `clientGuestSessionId`) are ignored.
 */
export async function loadOwnedGuestTicket(
  admin: SupabaseClient,
  ticketId: string,
  identity: GuestTicketIdentity,
): Promise<SupportTicketRow | null> {
  if (!ticketId) return null;
  const { data, error } = await supportFrom(admin, "support_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error || !data) return null;
  const ticket = mapTicketRow(data);
  if (!ticket) return null;

  if (identity.guestSessionId && ticket.guestSessionId === identity.guestSessionId) {
    return ticket;
  }
  if (identity.userId && ticket.requesterUserId === identity.userId) {
    return ticket;
  }
  return null;
}
