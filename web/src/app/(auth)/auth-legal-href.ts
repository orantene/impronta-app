/**
 * Terms / Privacy hrefs for the auth shell footer (TUL-758).
 *
 * B7 ruling stays: the links always point at the platform site (getSiteUrl),
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
