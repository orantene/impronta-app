/**
 * Public payment-link URL shapes (PICK: P / pay-link host rules).
 *
 * - Platform fallback host `pay.tulala.digital` → `/link/{code}`
 * - Branded seller hosts (subdomain / custom / agency) → `/pay/{code}`
 *
 * The code is the credential; the path is presentation only.
 */

export const PAY_PLATFORM_HOST = "pay.tulala.digital" as const;
export const PAY_PLATFORM_ORIGIN = `https://${PAY_PLATFORM_HOST}` as const;

export type PayLinkPathPrefix = "/pay" | "/link";

/** Path prefix for a minted public origin. */
export function paymentLinkPathPrefix(publicOrigin: string): PayLinkPathPrefix {
  try {
    const host = new URL(publicOrigin).hostname.toLowerCase();
    if (host === PAY_PLATFORM_HOST) return "/link";
  } catch {
    /* fall through */
  }
  return "/pay";
}

/** Absolute checkout URL for a minted link. */
export function paymentLinkPublicUrl(publicOrigin: string, code: string): string {
  const origin = publicOrigin.replace(/\/$/, "");
  return `${origin}${paymentLinkPathPrefix(origin)}/${code}`;
}
