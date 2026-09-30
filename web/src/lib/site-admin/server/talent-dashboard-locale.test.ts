/**
 * 2026-09-29 leader QA (Alba, primary 'es'): the talent dashboard must render
 * in the talent's primary whenever there is no DELIBERATE choice, and a
 * deliberate cookie must win. End to end over the three pieces that decide it:
 *   1. the layout/seed decision (`talentLocaleSeedTarget`),
 *   2. the proxy's dashboard resolution (`resolveLocaleForPathname`),
 *   3. the client copy hook's first render (`initialDashboardLocale`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { resolveLocaleForPathname } from "@/i18n/locale-middleware";
import { initialDashboardLocale } from "@/i18n/use-dashboard-locale";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import type { LanguageSettings } from "@/lib/language-settings/types";

import { talentLocaleSeedTarget } from "./talent-locale-seed";

const SETTINGS: LanguageSettings = {
  ...FALLBACK_LANGUAGE_SETTINGS,
  defaultLocale: "en",
  publicLocales: ["en", "es"],
};

function req(cookies: Record<string, string>): NextRequest {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  return new NextRequest("http://localhost:3001/talent/site", {
    headers: cookie ? { cookie } : {},
  });
}

/**
 * What the dashboard renders in: apply the seed (a one-hop cookie write) when
 * the layout would, then resolve as the proxy does, then as the client hook
 * starts from that server locale.
 */
function rendered(cookies: Record<string, string>, primary: string): string {
  const seed = talentLocaleSeedTarget({
    cookieLocale: cookies.locale ?? null,
    cookieIsAuto: Boolean(cookies.locale_auto),
    primary,
  });
  const after = seed ? { ...cookies, locale: seed, locale_auto: "1" } : cookies;
  const serverLocale = resolveLocaleForPathname("/talent/site", req(after), SETTINGS);
  return initialDashboardLocale(serverLocale);
}

test("auto cookie equal to the primary renders the primary", () => {
  assert.equal(rendered({ locale: "es", locale_auto: "1" }, "es"), "es");
});

test("auto cookie different from the primary renders the primary", () => {
  assert.equal(rendered({ locale: "en", locale_auto: "1" }, "es"), "es");
});

test("no cookie renders the primary", () => {
  assert.equal(rendered({}, "es"), "es");
});

test("a deliberate cookie wins over the primary", () => {
  assert.equal(rendered({ locale: "en" }, "es"), "en");
});

test("client copy hook starts from the server locale, not 'en'", () => {
  assert.equal(initialDashboardLocale("es"), "es");
  assert.equal(initialDashboardLocale(null), "en");
});
