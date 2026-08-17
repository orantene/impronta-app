/**
 * Per-TENANT URL grammar.
 *
 * `locale-precedence.test.ts` covers the platform grammar
 * (`FALLBACK_LANGUAGE_SETTINGS`: `en` default, `["en","es"]` public). Every
 * assertion there holds a hidden assumption — that English is the unprefixed
 * language. That assumption is a per-tenant setting
 * (`agency_business_identity.default_locale`), and it INVERTS the moment a
 * tenant flips its default.
 *
 * The forcing case: tenant `impronta` (improntamodels.com) flips
 * `default_locale` from `en` to `es` with `supported_locales = ["es","en"]`.
 * After the flip Spanish is the canonical unprefixed language (`/models`) and
 * English moves under `/en/models`. Anything still building hrefs from the
 * platform fallback emits `/es/models`, which the proxy then 308s to `/models`
 * — an extra hop on every link in the site.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import {
  localeUrlSettings,
  pathnameWithoutAnyLocalePrefix,
  stripDefaultLocalePrefixFromPath,
  stripLocaleFromPathname,
  withLocaleHref,
  withLocalePath,
} from "@/i18n/pathnames";
import {
  isNonDefaultLocalePrefixedPath,
  resolveLocaleForPathname,
  shouldRewriteLocalePublicPath,
  stripNonDefaultLocalePrefix,
} from "@/i18n/locale-middleware";
import { FALLBACK_LANGUAGE_SETTINGS } from "@/lib/language-settings/fetch-language-settings";
import { resolveWorkspacePathTenantPublicPath } from "@/lib/saas/surface-allow-list";

/** Post-flip impronta: Spanish is the default, English is the prefixed one. */
const ES_DEFAULT = localeUrlSettings("es", ["es", "en"]);
/** Today's impronta, and every other bilingual tenant. */
const EN_DEFAULT = localeUrlSettings("en", ["en", "es"]);
/** The MAJORITY of production tenants: one language, no prefixes anywhere. */
const SOLO_EN = localeUrlSettings("en", ["en"]);

/** `LanguageSettings`-shaped view for the locale-middleware helpers. */
function asLanguageSettings(s: { defaultLocale: string; publicLocales: readonly string[] }) {
  return {
    ...FALLBACK_LANGUAGE_SETTINGS,
    defaultLocale: s.defaultLocale,
    publicLocales: [...s.publicLocales],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ES-default tenant — THE case this whole lane exists for.
// ─────────────────────────────────────────────────────────────────────────────

test("es-default: /models is the ES canonical, NOT /es/models", () => {
  // The single most important assertion in this file. With the platform
  // fallback this returns "/es/models" and every nav link 308s.
  assert.equal(withLocalePath("/models", "es", ES_DEFAULT), "/models");
  assert.equal(withLocalePath("/", "es", ES_DEFAULT), "/");
  assert.equal(withLocalePath("/directory", "es", ES_DEFAULT), "/directory");

  // Proof the fallback really does get it wrong — this is the bug, pinned.
  assert.equal(withLocalePath("/models", "es"), "/es/models");
});

test("es-default: English moves under /en", () => {
  assert.equal(withLocalePath("/models", "en", ES_DEFAULT), "/en/models");
  assert.equal(withLocalePath("/", "en", ES_DEFAULT), "/en");
  assert.equal(withLocalePath("/t/abc123", "en", ES_DEFAULT), "/en/t/abc123");
});

test("es-default: stripping recognises /en as the prefix and /models as bare", () => {
  const en = stripLocaleFromPathname("/en/models", ES_DEFAULT);
  assert.equal(en.locale, "en");
  assert.equal(en.hasLocalePrefix, true);
  assert.equal(en.pathnameWithoutLocale, "/models");

  const es = stripLocaleFromPathname("/models", ES_DEFAULT);
  assert.equal(es.locale, "es");
  assert.equal(es.hasLocalePrefix, false);
  assert.equal(es.pathnameWithoutLocale, "/models");

  // `/es/models` is NOT canonical post-flip; the default-prefix strip is what
  // 308s it back to `/models`.
  assert.equal(stripDefaultLocalePrefixFromPath("/es/models", ES_DEFAULT), "/models");
  // ...and `/en/models` must survive that same strip untouched.
  assert.equal(stripDefaultLocalePrefixFromPath("/en/models", ES_DEFAULT), "/en/models");
});

test("es-default: withLocaleHref keeps query and hash, and round-trips", () => {
  assert.equal(withLocaleHref("/models?sort=new", "es", ES_DEFAULT), "/models?sort=new");
  assert.equal(withLocaleHref("/models?sort=new", "en", ES_DEFAULT), "/en/models?sort=new");
  assert.equal(withLocaleHref("/#stories", "en", ES_DEFAULT), "/en#stories");
  assert.equal(withLocaleHref("/#stories", "es", ES_DEFAULT), "/#stories");
  // Non-paths are never touched, whatever the grammar.
  assert.equal(withLocaleHref("mailto:a@b.c", "en", ES_DEFAULT), "mailto:a@b.c");
  assert.equal(withLocaleHref("https://x.test/p", "en", ES_DEFAULT), "https://x.test/p");
});

test("es-default: the ONLY prefixed locale is en, per the middleware helpers", () => {
  const S = asLanguageSettings(ES_DEFAULT);
  assert.equal(isNonDefaultLocalePrefixedPath("/en/models", S), true);
  assert.equal(isNonDefaultLocalePrefixedPath("/es/models", S), false);
  assert.equal(stripNonDefaultLocalePrefix("/en/models", S), "/models");
  assert.equal(shouldRewriteLocalePublicPath("/en/models", S), true);
  assert.equal(shouldRewriteLocalePublicPath("/es/models", S), false);
});

test("es-default: an unprefixed public URL renders ES even with an en cookie", () => {
  const S = asLanguageSettings(ES_DEFAULT);
  const url = new URL("https://improntamodels.test/models");
  const req = new NextRequest(url, {
    headers: new Headers({ cookie: "locale=en" }),
  });
  assert.equal(resolveLocaleForPathname("/models", req, S), "es");
  assert.equal(resolveLocaleForPathname("/en/models", req, S), "en");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EN-default tenant — today's behaviour, must not drift.
// ─────────────────────────────────────────────────────────────────────────────

test("en-default: unchanged from the platform fallback", () => {
  assert.equal(withLocalePath("/models", "en", EN_DEFAULT), "/models");
  assert.equal(withLocalePath("/models", "es", EN_DEFAULT), "/es/models");
  assert.equal(withLocalePath("/", "es", EN_DEFAULT), "/es");

  const s = stripLocaleFromPathname("/es/models", EN_DEFAULT);
  assert.equal(s.locale, "es");
  assert.equal(s.hasLocalePrefix, true);
  assert.equal(s.pathnameWithoutLocale, "/models");

  assert.equal(stripDefaultLocalePrefixFromPath("/en/models", EN_DEFAULT), "/models");
  assert.equal(stripDefaultLocalePrefixFromPath("/es/models", EN_DEFAULT), "/es/models");

  // Byte-identical to calling with no settings at all.
  for (const p of ["/", "/models", "/t/abc", "/directory?x=1"]) {
    assert.equal(withLocaleHref(p, "es", EN_DEFAULT), withLocaleHref(p, "es"));
    assert.equal(withLocaleHref(p, "en", EN_DEFAULT), withLocaleHref(p, "en"));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Solo-language tenants — the production MAJORITY. No prefixes, ever.
// ─────────────────────────────────────────────────────────────────────────────

test("solo [en]: no locale prefix is ever produced", () => {
  assert.equal(withLocalePath("/models", "en", SOLO_EN), "/models");
  assert.equal(withLocalePath("/", "en", SOLO_EN), "/");
  assert.equal(withLocaleHref("/directory?q=1#x", "en", SOLO_EN), "/directory?q=1#x");

  // `/es/...` is not a locale prefix for this tenant — it is a normal path
  // segment, and must NOT be eaten by the strippers.
  assert.equal(stripLocaleFromPathname("/es/models", SOLO_EN).hasLocalePrefix, false);
  assert.equal(
    stripLocaleFromPathname("/es/models", SOLO_EN).pathnameWithoutLocale,
    "/es/models",
  );
  assert.equal(stripDefaultLocalePrefixFromPath("/es/models", SOLO_EN), "/es/models");

  const S = asLanguageSettings(SOLO_EN);
  assert.equal(isNonDefaultLocalePrefixedPath("/es/models", S), false);
  assert.equal(shouldRewriteLocalePublicPath("/es/models", S), false);
});

test("solo [es]: Spanish is unprefixed and nothing else is offered", () => {
  const soloEs = localeUrlSettings("es", ["es"]);
  assert.equal(withLocalePath("/models", "es", soloEs), "/models");
  assert.equal(stripDefaultLocalePrefixFromPath("/es/models", soloEs), "/models");
  assert.equal(stripLocaleFromPathname("/models", soloEs).locale, "es");
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Path-based tenant on a hub host resolves the PATH tenant's grammar.
//
// Mirrors the ordering proxy.ts now uses: discover the path tenant from a
// LOCALE-AGNOSTIC path first, then apply THAT tenant's grammar. The old order
// applied the HOST tenant's grammar before the path tenant was even known.
// ─────────────────────────────────────────────────────────────────────────────

/** The platform locale superset the proxy strips with during discovery. */
const PLATFORM = localeUrlSettings("en", ["en", "es"]);

function proxyGrammarDecision(
  pathname: string,
  hostTenant: ReturnType<typeof localeUrlSettings>,
  pathTenants: Record<string, ReturnType<typeof localeUrlSettings>>,
) {
  // Step 1 — locale-agnostic discovery (proxy.ts: `localeAgnosticPath`).
  const agnostic = pathnameWithoutAnyLocalePrefix(pathname, PLATFORM);
  const probe = resolveWorkspacePathTenantPublicPath(agnostic);
  // Step 2 — the SERVED tenant's grammar wins.
  const effective = probe ? (pathTenants[probe.tenantSlug] ?? hostTenant) : hostTenant;
  // Step 3 — canonicalization, exactly as proxy.ts sequences it.
  const afterDefaultStrip = stripDefaultLocalePrefixFromPath(pathname, effective);
  const canonical = isNonDefaultLocalePrefixedPath(
    afterDefaultStrip,
    asLanguageSettings(effective),
  )
    ? stripNonDefaultLocalePrefix(afterDefaultStrip, asLanguageSettings(effective))
    : afterDefaultStrip;
  return { effective, afterDefaultStrip, canonical, tenantSlug: probe?.tenantSlug ?? null };
}

test("hub host + /w/<slug>: the PATH tenant's grammar decides, not the host's", () => {
  const hub = SOLO_EN; // hub tenant: en only
  const tenants = { impronta: ES_DEFAULT }; // path tenant: es default

  // `/en/w/impronta/models` is impronta's canonical ENGLISH url post-flip.
  // The host (en-default) grammar would strip `/en` as a default prefix and
  // 308 the visitor off the English page. The path tenant's grammar keeps it.
  const en = proxyGrammarDecision("/en/w/impronta/models", hub, tenants);
  assert.equal(en.tenantSlug, "impronta");
  assert.equal(en.effective.defaultLocale, "es");
  assert.equal(en.afterDefaultStrip, "/en/w/impronta/models", "must NOT strip /en");
  assert.equal(en.canonical, "/w/impronta/models");

  // ...and the host grammar demonstrably gets it wrong.
  assert.equal(stripDefaultLocalePrefixFromPath("/en/w/impronta/models", hub), "/w/impronta/models");

  // `/es/w/impronta/models` IS the default-prefixed form for this tenant, so it
  // canonicalizes down to the unprefixed URL.
  const es = proxyGrammarDecision("/es/w/impronta/models", hub, tenants);
  assert.equal(es.afterDefaultStrip, "/w/impronta/models");
  assert.equal(es.canonical, "/w/impronta/models");
});

test("hub host + /w/<slug>: an en-default path tenant behaves as it does today", () => {
  const hub = SOLO_EN;
  const tenants = { luma: EN_DEFAULT };

  const en = proxyGrammarDecision("/en/w/luma/models", hub, tenants);
  assert.equal(en.afterDefaultStrip, "/w/luma/models");
  assert.equal(en.canonical, "/w/luma/models");

  const es = proxyGrammarDecision("/es/w/luma/models", hub, tenants);
  assert.equal(es.afterDefaultStrip, "/es/w/luma/models");
  assert.equal(es.canonical, "/w/luma/models");
});

test("no path tenant: the host tenant's grammar still governs (agency hosts unchanged)", () => {
  const agency = ES_DEFAULT;
  const d = proxyGrammarDecision("/es/models", agency, {});
  assert.equal(d.tenantSlug, null);
  assert.equal(d.effective.defaultLocale, "es");
  assert.equal(d.afterDefaultStrip, "/models");
  assert.equal(d.canonical, "/models");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. localeUrlSettings — the adapter every caller goes through.
// ─────────────────────────────────────────────────────────────────────────────

test("localeUrlSettings: degenerate inputs never produce an empty locale set", () => {
  assert.deepEqual(localeUrlSettings("es", []), {
    defaultLocale: "es",
    publicLocales: ["es"],
  });
  assert.deepEqual(localeUrlSettings(null, null), {
    defaultLocale: "en",
    publicLocales: ["en"],
  });
  assert.deepEqual(localeUrlSettings("  ", ["es"]), {
    defaultLocale: "en",
    publicLocales: ["es"],
  });
  // Blank entries are dropped rather than becoming a `//` prefix.
  assert.deepEqual(localeUrlSettings("es", ["es", "", "en"]), {
    defaultLocale: "es",
    publicLocales: ["es", "en"],
  });
});
