/**
 * Terms / Privacy hrefs for the auth shell footer (TUL-758).
 *
 * B7 ruling stays: the links always point at the platform marketing site (resolveMarketingOrigin),
 * never a tenant host. Only the locale follows the page: the platform's default
 * locale (en) is unprefixed, every other locale is served under `/<locale>`.
 */
export function authLegalHref(
  siteUrl: string,
  doc: "terms" | "privacy",
  locale: string | null | undefined,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const loc = (locale ?? "").trim().toLowerCase();
  const prefix = loc && loc !== "en" && /^[a-z]{2}(-[a-z]{2})?$/.test(loc) ? `/${loc}` : "";
  return `${base}${prefix}/legal/${doc}`;
}

/**
 * TUL-816: locale-prefixed marketing path on the environment's marketing
 * origin (`/about` -> `https://staging.tulala.digital/es/about`; `""` -> the
 * marketing home). The default locale (en) stays unprefixed.
 */
export function authMarketingHref(
  marketingOrigin: string,
  path: string,
  locale: string | null | undefined,
): string {
  const base = marketingOrigin.replace(/\/+$/, "");
  const loc = (locale ?? "").trim().toLowerCase();
  const prefix = loc && loc !== "en" && /^[a-z]{2}(-[a-z]{2})?$/.test(loc) ? `/${loc}` : "";
  const tail = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `${base}${prefix}${tail}` || base;
}
