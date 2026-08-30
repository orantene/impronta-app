/**
 * Role-free claim matching. Talent and operator sign-in use the same rules
 * as client sign-in. Sweep B still requires a confirmed email at the caller.
 */
export function guestTicketMatchesClaim(
  ticket: {
    requesterUserId: string | null;
    guestSessionId: string | null;
    surface: string;
    contactEmail: string | null;
  },
  input: {
    guestSessionId: string | null;
    verifiedEmail: string | null;
  },
): boolean {
  if (ticket.requesterUserId) return false;
  if (input.guestSessionId && ticket.guestSessionId === input.guestSessionId) {
    return true;
  }
  const email = input.verifiedEmail?.trim().toLowerCase() ?? "";
  if (
    email &&
    ticket.surface === "guest" &&
    ticket.contactEmail?.trim().toLowerCase() === email
  ) {
    return true;
  }
  return false;
}
