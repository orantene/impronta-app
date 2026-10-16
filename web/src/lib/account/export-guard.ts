/**
 * TUL-725. The account export is the most sensitive response the app produces,
 * so a session that merely exists is not enough: the person must have signed in
 * recently. `last_sign_in_at` moves on every real sign-in (password, OTP,
 * OAuth) and not on a token refresh, so it is the step-up signal that needs no
 * new table. Anything missing, unparseable or in the future is NOT fresh.
 */

export const EXPORT_FRESH_MINUTES = 10;

export function isSessionFreshForExport(
  lastSignInAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSignInAt) return false;
  const at = Date.parse(lastSignInAt);
  if (!Number.isFinite(at)) return false;
  const age = now - at;
  return age >= -60_000 && age <= EXPORT_FRESH_MINUTES * 60_000;
}
