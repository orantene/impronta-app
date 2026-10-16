/**
 * A post card's href in the rendering site's URL grammar: path prefix
 * (`/w/<slug>` on path-based workspace hosts) plus the locale segment when the
 * page is not in the site's default language. Same builder as the `blog_index`
 * section (`localeAlternateUrl`), origin-relative. Pure.
 */
import { localeAlternateUrl } from "@/i18n/alternates";

export function postsFeedHref(
  path: string,
  ctx: { locale: string; defaultLocale: string; pathPrefix: string },
): string {
  if (!path || path === "#") return "#";
  try {
    const abs = new URL(
      localeAlternateUrl(
        {
          origin: "https://site.invalid",
          pathnameWithoutLocale: path,
          defaultLocale: ctx.defaultLocale,
          supportedLocales: [...new Set([ctx.defaultLocale, ctx.locale])],
          pathPrefix: ctx.pathPrefix,
        },
        ctx.locale,
      ),
    );
    return `${abs.pathname}${abs.search}`;
  } catch {
    return path;
  }
}
