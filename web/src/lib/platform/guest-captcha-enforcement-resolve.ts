/**
 * Pure resolve for `platform_settings.guest_captcha_enforced`.
 * Kept free of `server-only` so unit tests can import it.
 */

/** Safe default: captcha stays enforced if the row is missing or unreadable. */
export const GUEST_CAPTCHA_ENFORCED_DEFAULT = true;

/** Nullish → enforced (fail closed / safe). */
export function resolveGuestCaptchaEnforced(
  rowValue: boolean | null | undefined,
): boolean {
  return rowValue ?? GUEST_CAPTCHA_ENFORCED_DEFAULT;
}
