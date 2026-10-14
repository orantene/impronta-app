/**
 * Where a request goes when its URL locale prefix is not one the serving
 * tenant supports. Hub talent profiles (`/t/<code>`) follow the TALENT's own
 * languages, not the hub tenant's, so the prefix's language travels as
 * `?lang=` (read by the profile page) instead of being dropped.
 */

export function unsupportedLocaleRedirectTarget(input: {
  /** The unsupported platform locale from the first path segment. */
  requestedLocale: string;
  /** Path segments after the locale prefix. */
  remainderSegments: readonly string[];
  tenantDefaultLocale: string;
  platformDefaultLocale: string;
  search: URLSearchParams;
}): { pathname: string; search: string } {
  const remainder = input.remainderSegments.join("/");
  const pathname =
    input.tenantDefaultLocale === input.platformDefaultLocale
      ? `/${remainder}`
      : `/${input.tenantDefaultLocale}/${remainder}`;
  const params = new URLSearchParams(input.search);
  const isHubProfile = input.remainderSegments[0] === "t" && Boolean(input.remainderSegments[1]);
  if (isHubProfile && !params.has("lang")) params.set("lang", input.requestedLocale.toLowerCase());
  const qs = params.toString();
  return { pathname, search: qs ? `?${qs}` : "" };
}
