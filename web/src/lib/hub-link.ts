/**
 * TUL-1811: ONE helper for every link from the app host to the hub.
 *
 * The locale cookie does not cross hosts, so a signed-in Spanish visitor who
 * follows a plain hub URL lands on the platform default (English). Carry the
 * visitor's locale in the URL instead (`?lang=`; the hub proxy honours it).
 * English is the hub default and stays unmarked, so existing links and
 * canonical forms do not change.
 */

const HUB_LOCALES = new Set(["es", "fr"]);

/** Append `?lang=<locale>` to a hub URL for a non-default locale; idempotent. */
export function withHubLocale(href: string, locale: string | null | undefined): string {
  const loc = (locale ?? "").trim().toLowerCase().split("-")[0] ?? "";
  if (!HUB_LOCALES.has(loc)) return href;
  const hash = href.indexOf("#");
  const beforeHash = hash === -1 ? href : href.slice(0, hash);
  const tail = hash === -1 ? "" : href.slice(hash);
  const q = beforeHash.indexOf("?");
  const path = q === -1 ? beforeHash : beforeHash.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : beforeHash.slice(q + 1));
  if (params.has("lang")) return href;
  params.set("lang", loc);
  return `${path}?${params.toString()}${tail}`;
}
