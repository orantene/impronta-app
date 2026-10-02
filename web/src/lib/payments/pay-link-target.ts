/**
 * Where a visitor's "Pay" goes. `/pay/<code>` only serves on a seller host
 * (agency / talent site); on the platform profile (`tulala.digital/t/<code>`,
 * app host) a relative `/pay/<code>` is a 404 (QA on Jor, 2026-10-01: guest
 * accepted the offer and landed on "Page not found"). The server resolves the
 * link's pay-capable origin; this only picks it, falling back to the relative
 * path when the resolver had nothing (a branded host serves it fine).
 */
export function payLinkTarget(code: string, resolvedUrl: string | null | undefined): string {
  const url = resolvedUrl?.trim();
  if (url && /^https?:\/\//i.test(url)) return url;
  return `/pay/${encodeURIComponent(code)}`;
}
