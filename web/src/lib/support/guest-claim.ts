import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { supportFrom } from "./support-from";
import { mapTicketRow } from "./support-types";
import { verifiedEmailForGuestClaim } from "./guest-claim-email";

export { verifiedEmailForGuestClaim };

/**
 * Attach unclaimed guest tickets to a newly signed-in account.
 * Sweep A: current cookie session, requester_user_id IS NULL.
 * Sweep B: confirmed email match only (copy the client-guest-merge gate).
 * Keeps guest_session_id and surface='guest'.
 */
export async function claimGuestSupportTickets(input: {
  userId: string;
  guestSessionId: string | null;
  verifiedEmail: string | null;
}): Promise<{ claimed: number }> {
  const admin = createServiceRoleClient();
  if (!admin) return { claimed: 0 };

  const ids = new Set<string>();

  if (input.guestSessionId) {
    const { data, error } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("guest_session_id", input.guestSessionId)
      .is("requester_user_id", null);
    if (error) logServerError("support.guestClaim.session", error);
    for (const row of data ?? []) {
      const ticket = mapTicketRow(row);
      if (ticket) ids.add(ticket.id);
    }
  }

  const email = input.verifiedEmail?.trim().toLowerCase() ?? "";
  if (email) {
    const { data, error } = await supportFrom(admin, "support_tickets")
      .select("*")
      .ilike("contact_email", email)
      .is("requester_user_id", null)
      .eq("surface", "guest");
    if (error) logServerError("support.guestClaim.email", error);
    for (const row of data ?? []) {
      const ticket = mapTicketRow(row);
      if (ticket) ids.add(ticket.id);
    }
  }

  let claimed = 0;
  for (const id of ids) {
    const { data } = await supportFrom(admin, "support_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const ticket = mapTicketRow(data);
    if (!ticket || ticket.requesterUserId) continue;
    const { error } = await supportFrom(admin, "support_tickets")
      .update({ requester_user_id: input.userId })
      .eq("id", id)
      .is("requester_user_id", null);
    if (error) {
      logServerError("support.guestClaim.update", error);
      continue;
    }
    await supportFrom(admin, "support_ticket_events").insert({
      ticket_id: id,
      tenant_id: ticket.tenantId,
      actor_kind: "requester",
      actor_user_id: input.userId,
      event_type: "contact_updated",
      old_value: null,
      new_value: { claimed_by_user_id: input.userId },
    });
    claimed += 1;
  }
  return { claimed };
}
