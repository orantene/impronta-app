/**
 * Guest booker -> client (owner decision 2026-10-09, TUL-465).
 *
 * `ensureGuestClientByEmail` creates a guest booker as app_role=client,
 * account_status='onboarding' on purpose, so the claim flow can tell an
 * unclaimed shadow account from a real one. Once that person proves the email
 * (code, password or Google with a confirmed address) AND has a booking, they
 * ARE a client: mark the account active and skip /onboarding/role. A client is
 * a client, one-way; never send them through the talent/studio role choice.
 * Someone who signs up with no booking keeps 'onboarding'. Pure.
 */
export function shouldActivateGuestBooker(input: {
  /** The email was proven in this sign-in (the same gate the claim uses). */
  emailProven: boolean;
  appRole: string | null | undefined;
  accountStatus: string | null | undefined;
  /** The user owns at least one inquiry/booking (after the claim relink ran). */
  hasBooking: boolean;
}): boolean {
  return input.emailProven && input.appRole === "client" && input.accountStatus === "onboarding" && input.hasBooking;
}
