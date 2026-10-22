import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { HostContext } from "./host-context";
import { hubSearchCarriedLocale, hubSearchRedirect } from "./hub-search-redirect";
import { hubPlatformLocaleSettings } from "./proxy-locale-context";
import { buildTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { unsupportedLocaleRedirectTarget } from "./unsupported-locale-redirect";
import type { LanguageSettings } from "@/lib/language-settings/types";

const lang = { defaultLocale: "en", publicLocales: ["en", "es"] } as unknown as LanguageSettings;
const hubOnlyEn = buildTenantLocaleSettings("en", ["en"], false); // the seeded hub row
const hub = { kind: "hub" } as HostContext;
const agency = { kind: "agency" } as HostContext;

test("TUL-1883: on the hub host /es is a SUPPORTED locale (no redirect to the English home)", () => {
  const eff = hubPlatformLocaleSettings(hub, hubOnlyEn, lang)!;
  assert.ok(eff.supportedLocales.includes("es"));
  assert.equal(eff.defaultLocale, "en");
  // The proxy only redirects when the prefix is NOT in supportedLocales.
  assert.equal(eff.supportedLocales.some((l) => l.toLowerCase() === "es"), true);
});

test("TUL-1883: a hub row with no settings still speaks the platform locales; agencies keep their own list", () => {
  assert.ok(hubPlatformLocaleSettings(hub, null, lang)!.supportedLocales.includes("es"));
  assert.equal(hubPlatformLocaleSettings(agency, hubOnlyEn, lang), hubOnlyEn, "an agency tenant is untouched");
  assert.equal(hubPlatformLocaleSettings(agency, null, lang), null);
});

test("TUL-1883: the old redirect target (what QA saw) was the English home", () => {
  const t = unsupportedLocaleRedirectTarget({ requestedLocale: "es", remainderSegments: [], tenantDefaultLocale: "en", platformDefaultLocale: "en", search: new URLSearchParams() });
  assert.equal(t.pathname, "/");
});

const base = { hostKind: "hub", method: "GET", marketingOrigin: "https://tulala.digital", pathname: "/search", search: "?q=x" };

test("TUL-1883: search keeps Spanish from the cookie OR the referring /es page, and never invents es or en", () => {
  assert.equal(hubSearchCarriedLocale({ cookieLocale: "es" }), "es");
  assert.equal(hubSearchCarriedLocale({ cookieLocale: null, referer: "https://hub.example.com/es" }), "es");
  assert.equal(hubSearchCarriedLocale({ cookieLocale: null, referer: "https://hub.example.com/es/agencias?x=1" }), "es");
  assert.equal(hubSearchCarriedLocale({ cookieLocale: null, referer: "https://hub.example.com/espresso" }), null);
  assert.equal(hubSearchCarriedLocale({ cookieLocale: "en", referer: "https://hub.example.com/" }), null);
  assert.equal(hubSearchCarriedLocale({ referer: "not a url" }), null);
  assert.equal(hubSearchRedirect({ ...base, referer: "https://hub.example.com/es" }), "https://tulala.digital/es/directory?q=x");
  assert.equal(hubSearchRedirect({ ...base }), "https://tulala.digital/directory?q=x");
  assert.equal(hubSearchRedirect({ ...base, pathname: "/en/search", cookieLocale: "es", referer: "https://h.x/es" }), "https://tulala.digital/en/directory?q=x", "an explicit prefix wins");
});

test("TUL-1883: the redirect itself never writes a locale cookie (the hop is a bare 308)", () => {
  const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
  const line = proxy.split("\n").find((l) => l.includes("const demoSlugHop"))!;
  assert.match(line, /referer: request\.headers\.get\("referer"\)/);
  const next = proxy.split("\n")[proxy.split("\n").indexOf(line) + 1];
  assert.match(next, /NextResponse\.redirect\(new URL\(demoSlugHop, request\.url\), 308\)/);
  assert.doesNotMatch(next, /cookies\.set|syncLocaleCookie/);
});

test("TUL-1883: the proxy resolves the hub grammar through hubPlatformLocaleSettings", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/saas/proxy-locale-context.ts"), "utf8");
  assert.match(src, /hubPlatformLocaleSettings\(hostContext, hostTenantLocaleSettings, langSettings\)/);
});
