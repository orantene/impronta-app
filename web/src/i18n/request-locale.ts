import { defaultFlowLocale } from "@/lib/onboarding/flow";
import { cookies, headers } from "next/headers";
import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import { LOCALE_COOKIE } from "@/i18n/locale-middleware";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { resolveRequestLocale } from "@/i18n/resolve-request-locale";
import {
  WORKSPACE_HOST_KIND_HEADER,
  explicitUrlLocale,
  resolveWorkspacePageLocale,
} from "@/i18n/workspace-page-locale";

const LOCALE_HEADER = "x-impronta-locale";

/** Browser pathname (e.g. `/es/directory`) — set in middleware before rewrite so locale does not depend on stale cookies in the same request. */
export const ORIGINAL_PATHNAME_HEADER = "x-impronta-original-pathname";

/**
 * Browser query string INCLUDING the leading `?` (e.g. `?tax=…&q=…`), set in
 * middleware alongside the pathname.
 *
 * Next only hands `searchParams` to page components. Sections rendered deep
 * inside the CMS renderer (page → HomepageCmsSections → registry → Component)
 * have no other way to see the live filters, so a server-rendered listing
 * could not match the URL it was requested with. Read it with
 * `getRequestSearchParams()`.
 */
export const ORIGINAL_SEARCH_HEADER = "x-impronta-original-search";

/**
 * URLSearchParams for the CURRENT request, usable from any server component.
 * Empty when the header is absent (e.g. a route that bypasses middleware) —
 * callers must treat that as "no filters", never as an error.
 */
export async function getRequestSearchParams(): Promise<URLSearchParams> {
  const h = await headers();
  const raw = h.get(ORIGINAL_SEARCH_HEADER) ?? "";
  return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
}

/**
 * Resolved locale for server rendering: path prefix, then `?lang=` / `?locale=`,
 * then middleware header, then cookie, then default from language settings.
 *
 * Hub QA uses `/t/<code>?lang=es` without an `/es` prefix; that query must win
 * over the unprefixed default so chat chrome (Inquire / Talk / Write a reply)
 * follows Spanish.
 */
export async function getRequestLocale(): Promise<Locale> {
  const settings = await getLanguageSettingsPublicCached();
  const h = await headers();
  // TUL-699: workspace public pages speak the workspace's language unless the
  // URL asks for one explicitly. Never touches talent sites or marketing.
  const tenantId = h.get("x-impronta-tenant-id");
  if (tenantId && h.get(WORKSPACE_HOST_KIND_HEADER) === "agency") {
    const forWorkspace = resolveWorkspacePageLocale({
      hostKind: "agency",
      explicit: explicitUrlLocale(
        h.get(ORIGINAL_PATHNAME_HEADER),
        h.get(ORIGINAL_SEARCH_HEADER),
        settings.publicLocales,
      ),
      // Lazy: the loader imports "server-only", which the node test runner for this module cannot resolve.
      facts: await (await import("@/lib/site-admin/server/workspace-page-locale")).loadWorkspaceLocaleFacts(tenantId),
      platformDefault: settings.defaultLocale ?? defaultLocale,
    });
    if (
      forWorkspace &&
      (settings.publicLocales.includes(forWorkspace) || forWorkspace === settings.defaultLocale)
    ) {
      return forWorkspace as Locale;
    }
  }
  const jar = await cookies();
  return resolveRequestLocale({
    headerLocale: h.get(LOCALE_HEADER),
    pathname: h.get(ORIGINAL_PATHNAME_HEADER),
    search: h.get(ORIGINAL_SEARCH_HEADER),
    cookieLocale: jar.get(LOCALE_COOKIE)?.value,
    publicLocales: settings.publicLocales,
    defaultLocale: settings.defaultLocale ?? defaultLocale,
  }) as Locale;
}

/**
 * Locale the <html lang> attribute should carry. Same as the request locale
 * except on the template-preview routes, which render a site in an explicit
 * `?locale=es|en` that the middleware locale header never sees (the route
 * renders the site in that locale, so the document must say so too).
 */
export function resolveDocumentLocale(
  requestLocale: string,
  pathname: string | null | undefined,
  search: string | null | undefined,
  /** Request hints, used only for `/start` (see below). */
  hints?: { acceptLanguage?: string | null; country?: string | null },
): string {
  // `/start` picks its flow language from `?lang`, then the visitor's country
  // and browser, the same way `app/start/page.tsx` does. The server HTML must
  // say so too, or a Spanish flow ships `<html lang="en">` until the client runs.
  if (pathname && /^\/start\/?$/.test(pathname)) {
    const raw = (search ?? "").replace(/^\?/, "");
    return defaultFlowLocale({
      saved: new URLSearchParams(raw).get("lang"),
      acceptLanguage: hints?.acceptLanguage ?? null,
      country: hints?.country ?? null,
    });
  }
  // TUL-855: a hub profile honours `?lang=`; <html lang> must agree with the
  // body and <head>, which resolve the same query.
  if (pathname && /^\/(?:[a-z]{2}\/)?t\/[^/]+\/?$/.test(pathname)) {
    const lang = new URLSearchParams((search ?? "").replace(/^\?/, "")).get("lang")?.trim().toLowerCase();
    return lang === "es" || lang === "en" ? lang : requestLocale;
  }
  if (!pathname || !/^\/(?:dev\/)?template-preview(?:\/|$)/.test(pathname)) return requestLocale;
  const raw = (search ?? "").replace(/^\?/, "");
  const explicit = new URLSearchParams(raw).get("locale");
  return explicit === "es" || explicit === "en" ? explicit : requestLocale;
}

export { LOCALE_HEADER };
