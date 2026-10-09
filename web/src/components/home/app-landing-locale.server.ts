import "server-only";

import { cookies, headers } from "next/headers";

import { resolveAuthPageLocale } from "@/i18n/auth-page-locale";
import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";

/**
 * Language of the signed-out app-host landing: a deliberate `locale` cookie
 * (the visitor's own toggle), else their browser / country (same rule as the
 * login and register cards), else English.
 */
export async function appLandingLocale(): Promise<"en" | "es"> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const raw = jar.get("locale")?.value ?? null;
  const resolved = resolveAuthPageLocale({
    cookieLocale: raw === "es" || raw === "en" ? raw : null,
    cookieIsAuto: Boolean(jar.get(LOCALE_AUTO_COOKIE)?.value),
    acceptLanguage: h.get("accept-language"),
    country: h.get("x-vercel-ip-country"),
    fallback: "en",
    enabledLocales: ["en", "es"],
  });
  return resolved === "es" ? "es" : "en";
}
