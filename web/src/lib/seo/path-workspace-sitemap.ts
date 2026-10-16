import type { MetadataRoute } from "next";

/**
 * A `/w/<slug>` workspace has no host of its own: its sitemap is served at
 * `tulala.digital/w/<slug>/sitemap.xml`, but the shared sitemap builder emits
 * tenant-relative paths. Left alone, every entry would point at the hub's own
 * page of the same name, so each URL is moved under the workspace prefix.
 *
 * Grammar matches the proxy: the default locale is unprefixed
 * (`/w/<slug>/about`), a non-default locale leads (`/es/w/<slug>/about`).
 */
const LEADING_LOCALE = /^\/([a-z]{2})(?=\/|$)/;

export function prefixPathWorkspaceUrl(url: string, prefix: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const locale = LEADING_LOCALE.exec(parsed.pathname);
  const rest = locale ? parsed.pathname.slice(locale[0].length) : parsed.pathname;
  const tail = rest === "/" ? "" : rest;
  parsed.pathname = `${locale ? locale[0] : ""}${prefix}${tail}` || "/";
  return parsed.toString();
}

export function prefixPathWorkspaceSitemap(
  entries: MetadataRoute.Sitemap,
  prefix: string,
): MetadataRoute.Sitemap {
  return entries.map((entry) => {
    const languages = entry.alternates?.languages;
    return {
      ...entry,
      url: prefixPathWorkspaceUrl(entry.url, prefix),
      ...(languages
        ? {
            alternates: {
              ...entry.alternates,
              languages: Object.fromEntries(
                Object.entries(languages).map(([lang, href]) => [
                  lang,
                  prefixPathWorkspaceUrl(href as string, prefix),
                ]),
              ),
            },
          }
        : {}),
    };
  });
}
