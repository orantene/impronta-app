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
  /** G2: the user owns an inquiry, booking, payment or order (after claimEverythingForVerifiedEmail). */
  hasBooking: boolean;
}): boolean {
  return input.emailProven && input.appRole === "client" && input.accountStatus === "onboarding" && input.hasBooking;
}

/**
 * TUL-771: someone who explicitly signed up AS a client (`/register?as=client`) has already said
 * what they are, so they skip /onboarding/role. This is different from a guest booker with no
 * booking, who keeps 'onboarding' (above). Only a fresh client row is touched; a talent, staff or
 * already-active account is left alone. Pure.
 */
export function shouldActivateSelfSignedClient(input: {
  signupIntent: string | null | undefined;
  appRole: string | null | undefined;
  accountStatus: string | null | undefined;
}): boolean {
  return input.signupIntent === "client" && input.appRole === "client" && input.accountStatus === "onboarding";
}
