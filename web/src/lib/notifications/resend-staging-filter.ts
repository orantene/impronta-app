/**
 * Staging guard for the Resend webhook (TUL-891).
 *
 * Resend webhooks are per account, so the staging endpoint also receives every
 * PRODUCTION delivery/inbound event. On a non-production deployment we only act
 * on events that involve a staging/QA address; everything else is acked (200)
 * with no side effects, so staging never suppresses or stores real mail.
 * Production (VERCEL_ENV === "production") is never filtered.
 */

export const DEFAULT_STAGING_EMAIL_DOMAINS: readonly string[] = [
  "mail.grokbot.com",
  "impronta.test",
];

type AddressField = string | string[] | null | undefined;

export type ResendEventAddresses = {
  data?: { to?: AddressField; from?: AddressField; cc?: AddressField } | null;
};

/** Parse `RESEND_STAGING_ALLOWED_DOMAINS` (comma list) plus the defaults. */
export function stagingAllowedDomains(envValue: string | null | undefined): string[] {
  const extra = (envValue ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
  return [...new Set([...DEFAULT_STAGING_EMAIL_DOMAINS, ...extra])];
}

function emailDomain(raw: string): string | null {
  const m = /<([^>]+)>/.exec(raw);
  const addr = (m ? m[1] : raw).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 1 || at === addr.length - 1) return null;
  return addr.slice(at + 1);
}

function addresses(field: AddressField): string[] {
  if (!field) return [];
  return Array.isArray(field) ? field.filter((x) => typeof x === "string") : [field];
}

/** True when any to/from/cc address belongs to an allowed staging domain (or a subdomain of one). */
export function eventInvolvesStagingAddress(
  event: ResendEventAddresses,
  allowed: readonly string[],
): boolean {
  const d = event.data ?? {};
  for (const raw of [...addresses(d.to), ...addresses(d.from), ...addresses(d.cc)]) {
    const dom = emailDomain(raw);
    if (!dom) continue;
    if (allowed.some((a) => dom === a || dom.endsWith(`.${a}`))) return true;
  }
  return false;
}

/**
 * Decide whether this deployment should ignore the event.
 * Returns a dev-only reason string when ignored, null when it should be processed.
 */
export function stagingIgnoreReason(
  event: ResendEventAddresses,
  env: { VERCEL_ENV?: string; RESEND_STAGING_ALLOWED_DOMAINS?: string },
): string | null {
  if (env.VERCEL_ENV === "production") return null;
  const allowed = stagingAllowedDomains(env.RESEND_STAGING_ALLOWED_DOMAINS);
  if (eventInvolvesStagingAddress(event, allowed)) return null;
  return "non-production deployment: no staging/QA address on the event";
}
