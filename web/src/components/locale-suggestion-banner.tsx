import "server-only";

import { cookies, headers } from "next/headers";

import { createTranslator } from "@/i18n/messages";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import {
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
  shouldSuggestLocale,
} from "@/i18n/locale-suggestion";
import { stripLocaleFromPathname } from "@/i18n/pathnames";
import { ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import { getRequestLocaleUrlSettings } from "@/i18n/tenant-url-locale";

import { LocaleSuggestionBannerClient } from "./locale-suggestion-banner-client";

/**
 * Reads the request, asks `shouldSuggestLocale`, renders nothing or the banner.
 *
 * WHY IT MOUNTS IN THE ROOT LAYOUT
 * ────────────────────────────────
 * There is no single "public page" component to hang this off. Public HTML is
 * produced by at least four independent shells — `PublicHeader` pages, the
 * builder's `PublishedShell`, `/t/[profileCode]` talent profiles, and the
 * freeform `/p/[[...slug]]` CMS route, which renders directly without either
 * header. Mounting per shell means four call sites and a fifth one missed the
 * next time a surface is added. `app/layout.tsx` is the one node all of them
 * pass through, it is already `force-dynamic` (so headers are legal), and it
 * already resolves the tenant scope. The dashboard/auth exclusion is handled
 * where it belongs: inside the predicate, which is unit-tested.
 *
 * WHY THE COPY IS RESOLVED HERE
 * ─────────────────────────────
 * `useT()` translates into the CURRENT locale, and the banner must speak the
 * SUGGESTED one. `createTranslator(target)` is synchronous and locale-explicit,
 * so the server resolves all four strings against the suggested locale and
 * hands the client component finished text.
 *
 * This component is failure-inert on purpose: any throw while reading request
 * state renders nothing rather than 500-ing the page it floats over. A missing
 * suggestion is invisible; a broken layout is not. The try/catch wraps only the
 * request-reading resolver below and never the JSX — constructing JSX inside a
 * try/catch is a lie (React renders it later, outside the handler), which is
 * exactly what `react-hooks/error-boundaries` flags.
 */
type BannerProps = React.ComponentProps<typeof LocaleSuggestionBannerClient>;

async function resolveBannerProps(): Promise<BannerProps | null> {
  try {
    const [h, jar, settings] = await Promise.all([
      headers(),
      cookies(),
      getRequestLocaleUrlSettings(),
    ]);

    // The BROWSER pathname, set by proxy.ts before any rewrite. Without it we
    // cannot build a correct "same page, other language" href, and a banner
    // pointing at the wrong URL is worse than no banner.
    const pathname = h.get(ORIGINAL_PATHNAME_HEADER);
    if (!pathname) return null;

    // Derive the rendered locale from the URL under THIS tenant's grammar
    // rather than from `getRequestLocale()` (which resolves against the global
    // language settings). Same source as the href, so the two cannot disagree
    // about which language the visitor is currently looking at.
    const { locale: currentLocale } = stripLocaleFromPathname(pathname, settings);

    const decision = shouldSuggestLocale({
      cookieLocale: jar.get(LOCALE_COOKIE)?.value ?? null,
      acceptLanguage: h.get("accept-language"),
      country: h.get("x-vercel-ip-country"),
      currentLocale,
      tenantSettings: settings,
      pathname,
      search: h.get(ORIGINAL_SEARCH_HEADER),
      userAgent: h.get("user-agent"),
      dismissed: Boolean(jar.get(LOCALE_SUGGESTION_DISMISSED_COOKIE)?.value),
    });

    if (!decision.suggest) return null;

    const t = createTranslator(decision.locale);
    return {
      href: decision.href,
      locale: decision.locale,
      localeCookieName: LOCALE_COOKIE,
      secureCookies: process.env.NODE_ENV === "production",
      prompt: t("public.localeSuggest.prompt"),
      acceptLabel: t("public.localeSuggest.accept"),
      dismissLabel: t("public.localeSuggest.dismiss"),
      regionLabel: t("public.localeSuggest.regionLabel"),
    };
  } catch {
    return null;
  }
}

export async function LocaleSuggestionBanner() {
  const props = await resolveBannerProps();
  if (!props) return null;
  return <LocaleSuggestionBannerClient {...props} />;
}
