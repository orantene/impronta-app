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

/** Tenant captcha shape threaded into builder render options. */
export type GuestCaptchaRenderConfig = {
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
};

/**
 * Explicit booking-off sentinel. Must be a non-null object so
 * `bookingCaptcha ?? formCaptcha` does not fall through to CMS form captcha
 * when HQ guest booking enforcement is off.
 */
export const GUEST_CAPTCHA_BOOKING_OFF: GuestCaptchaRenderConfig = {
  provider: "none",
  siteKey: null,
};

/**
 * Split tenant captcha into CMS-form vs guest-booking configs.
 * HQ `guest_captcha_enforced` gates booking chrome only — forms stay on.
 */
export function splitGuestCaptchaConfigs(
  pageCaptcha: GuestCaptchaRenderConfig | null | undefined,
  captchaEnforced: boolean,
): {
  formCaptchaConfig: GuestCaptchaRenderConfig | null;
  bookingCaptchaConfig: GuestCaptchaRenderConfig;
} {
  const formCaptchaConfig = pageCaptcha
    ? { provider: pageCaptcha.provider, siteKey: pageCaptcha.siteKey }
    : null;
  const bookingCaptchaConfig =
    pageCaptcha && captchaEnforced
      ? { provider: pageCaptcha.provider, siteKey: pageCaptcha.siteKey }
      : GUEST_CAPTCHA_BOOKING_OFF;
  return { formCaptchaConfig, bookingCaptchaConfig };
}
