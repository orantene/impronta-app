import "server-only";

import { cookies, headers } from "next/headers";

import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import { ORIGINAL_PATHNAME_HEADER, ORIGINAL_SEARCH_HEADER } from "@/i18n/request-locale";
import type { FlowLocale } from "@/lib/onboarding/flow";
import { langFromLocalePrefixedPath, resolveLegacyFlowLang } from "@/lib/onboarding/legacy-signup-redirect";

/**
 * The language to hand `/start`: the URL's own language, a deliberate `locale`
 * cookie, the browser's language, then the country (see `resolveLegacyFlowLang`).
 * Reads the request directly (not `getRequestLocale`) so it is right on dashboard
 * paths too.
 */
export async function legacyFlowLang(): Promise<FlowLocale> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const search = h.get(ORIGINAL_SEARCH_HEADER) ?? "";
  return resolveLegacyFlowLang({
    urlLang: langFromLocalePrefixedPath(h.get(ORIGINAL_PATHNAME_HEADER)) ?? new URLSearchParams(search.replace(/^\?/, "")).get("lang"),
    cookieLocale: jar.get("locale")?.value ?? null,
    cookieIsAuto: Boolean(jar.get(LOCALE_AUTO_COOKIE)?.value),
    acceptLanguage: h.get("accept-language"),
    country: h.get("x-vercel-ip-country"),
  });
}
