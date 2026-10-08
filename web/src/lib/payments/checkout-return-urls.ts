/**
 * TUL-350 slice 1 — Stripe success/cancel URLs for booking checkouts.
 *
 * Always the request host the payer was on (talent subdomain, custom domain,
 * agency, or hub) plus their browsing locale. Never `NEXT_PUBLIC_BASE_URL`:
 * that sent a talent-host payer back to the app host, dropped branding, and
 * made "Back to home" land on the platform root.
 *
 * Pure: callers resolve origin (via `publicOrigin` / headers) and locale.
 */

import { withLocaleHref, type LocaleUrlSettings } from "@/i18n/pathnames";

const SESSION_ID_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

export type CheckoutReturnUrls = {
  successUrl: string;
  cancelUrl: string;
};

/**
 * Absolute success + cancel URLs for `createCheckoutSessionForTransaction`.
 * Stripe substitutes `{CHECKOUT_SESSION_ID}` on the success URL.
 */
export function buildCheckoutReturnUrls(input: {
  /** Absolute origin, e.g. `https://jor.tulala.digital` (no trailing slash). */
  origin: string;
  /** Browsing locale the payer was using (en/es). */
  locale: string;
  /** Tenant URL grammar when known; platform fallback otherwise. */
  localeSettings?: LocaleUrlSettings;
}): CheckoutReturnUrls {
  const origin = input.origin.replace(/\/$/, "");
  const successPath = withLocaleHref(
    `/checkout/success?session_id=${SESSION_ID_PLACEHOLDER}`,
    input.locale,
    input.localeSettings,
  );
  const cancelPath = withLocaleHref("/checkout/cancel", input.locale, input.localeSettings);
  return {
    successUrl: `${origin}${successPath}`,
    cancelUrl: `${origin}${cancelPath}`,
  };
}
