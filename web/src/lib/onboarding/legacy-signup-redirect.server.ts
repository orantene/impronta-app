import "server-only";

import { cookies, headers } from "next/headers";

import { resolveAuthPageLocale } from "@/i18n/auth-page-locale";
import { LOCALE_AUTO_COOKIE } from "@/i18n/locale-cookies";
import type { FlowLocale } from "@/lib/onboarding/flow";

/**
 * The language to hand `/start`: a deliberate `locale` cookie, else the same
 * accept-language + country signals `/start` itself uses. Reads the request
 * directly (not `getRequestLocale`) so it is right on dashboard paths too.
 */
export async function legacyFlowLang(): Promise<FlowLocale> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const raw = jar.get("locale")?.value ?? null;
  const cookieLocale = raw === "es" || raw === "en" ? raw : null;
  const resolved = resolveAuthPageLocale({
    cookieLocale,
    cookieIsAuto: Boolean(jar.get(LOCALE_AUTO_COOKIE)?.value),
    acceptLanguage: h.get("accept-language"),
    country: h.get("x-vercel-ip-country"),
    fallback: "en",
    enabledLocales: ["en", "es"],
  });
  return resolved === "es" ? "es" : "en";
}
