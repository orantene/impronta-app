import { PLATFORM_BRAND } from "@/lib/platform/brand";

/** Production origin, used only when the request carries no trusted host. */
export const PRODUCTION_CHANGELOG_ORIGIN = `https://${PLATFORM_BRAND.domain}`;

/**
 * TUL-1794: the origin the changelog advertises (rel=alternate feed, canonical,
 * share URLs, feed self link) is the REQUEST host, so staging never points
 * readers at the production feed. `requestOrigin` comes from `publicOrigin()`
 * (gate-validated host); null falls back to production, so production output
 * is unchanged.
 */
export function changelogOrigin(requestOrigin: string | null | undefined): string {
  const o = (requestOrigin ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/i.test(o) ? o : PRODUCTION_CHANGELOG_ORIGIN;
}
