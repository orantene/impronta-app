/**
 * Copy of the client-guest-merge email_confirmed_at gate.
 * Sweep B must never see an unconfirmed account email.
 */
export function verifiedEmailForGuestClaim(input: {
  email: string | null | undefined;
  emailConfirmedAt: string | null | undefined;
}): string | null {
  if (!input.email || !input.emailConfirmedAt) return null;
  return input.email;
}
