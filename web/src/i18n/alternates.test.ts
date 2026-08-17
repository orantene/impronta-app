/**
 * hreflang / canonical construction.
 *
 * The headline regression here is the cross-domain canonical: on 2026-08-16
 * every page of the tenant domain improntamodels.com declared its canonical and
 * all of its hreflang alternates against https://tulala.digital — two of which
 * (`/models`, `/p/about`) 404 there. The origin now comes from the caller, and
 * `alternates on the tenant host` below fails on any regression to a fixed
 * platform origin.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildLocaleAlternates } from "@/i18n/alternates";

const TENANT_ORIGIN = "https://improntamodels.com";
const PLATFORM_ORIGIN = "https://tulala.digital";

test("solo-language tenant emits a canonical and NO languages map", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/models`);
  assert.equal(alt.languages, undefined);
  assert.ok(!("languages" in alt));
});

test("EN-default pair: en unprefixed, es at /es, x-default on the en URL", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/models`);
  assert.deepEqual(alt.languages, {
    en: `${TENANT_ORIGIN}/models`,
    es: `${TENANT_ORIGIN}/es/models`,
    "x-default": `${TENANT_ORIGIN}/models`,
  });
});

test("EN-default pair: the /es render canonicalizes to itself", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "es",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/es/models`);
  assert.equal(alt.languages?.["x-default"], `${TENANT_ORIGIN}/models`);
});

test("ES-default pair (Impronta post-flip): es unprefixed, en at /en, x-default on es", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "es",
    defaultLocale: "es",
    supportedLocales: ["es", "en"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/models`);
  assert.deepEqual(alt.languages, {
    es: `${TENANT_ORIGIN}/models`,
    en: `${TENANT_ORIGIN}/en/models`,
    "x-default": `${TENANT_ORIGIN}/models`,
  });
});

test("ES-default: the English render lives at /en and still x-defaults to es", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/",
    currentLocale: "en",
    defaultLocale: "es",
    supportedLocales: ["es", "en"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/en`);
  assert.equal(alt.languages?.es, `${TENANT_ORIGIN}/`);
  assert.equal(alt.languages?.["x-default"], `${TENANT_ORIGIN}/`);
});

test("a tenant that does not support fr never emits an fr alternate", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/directory",
    currentLocale: "en",
    defaultLocale: "en",
    // `fr` is enabled_public in the global registry and has zero content.
    supportedLocales: ["en", "es"],
  });

  assert.deepEqual(Object.keys(alt.languages ?? {}).sort(), [
    "en",
    "es",
    "x-default",
  ]);
  assert.equal(alt.languages?.fr, undefined);
  assert.ok(!JSON.stringify(alt).includes("/fr/"));
});

test("REGRESSION: canonical and every alternate stay on the tenant host", () => {
  for (const path of ["/", "/models", "/p/about", "/directory", "/t/abc123"]) {
    const alt = buildLocaleAlternates({
      origin: TENANT_ORIGIN,
      pathnameWithoutLocale: path,
      currentLocale: "en",
      defaultLocale: "en",
      supportedLocales: ["en", "es"],
    });

    const urls = [alt.canonical, ...Object.values(alt.languages ?? {})];
    for (const url of urls) {
      assert.ok(
        url.startsWith(`${TENANT_ORIGIN}/`),
        `${path}: expected ${url} on the tenant host`,
      );
      assert.ok(
        !url.includes(PLATFORM_ORIGIN),
        `${path}: ${url} leaked the platform host`,
      );
    }
  }
});

test("URLs are absolute, with no double slash and a clean root", () => {
  const root = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
  });

  assert.equal(root.canonical, `${TENANT_ORIGIN}/`);
  assert.equal(root.languages?.es, `${TENANT_ORIGIN}/es`);

  for (const url of [root.canonical, ...Object.values(root.languages ?? {})]) {
    assert.ok(/^https:\/\//.test(url), `${url} must be absolute`);
    assert.ok(
      !url.slice("https://".length).includes("//"),
      `${url} must not contain a double slash`,
    );
  }

  // A trailing origin slash and a missing leading path slash both normalize.
  const messy = buildLocaleAlternates({
    origin: `${TENANT_ORIGIN}/`,
    pathnameWithoutLocale: "models",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en"],
  });
  assert.equal(messy.canonical, `${TENANT_ORIGIN}/models`);
});

test("an already-prefixed path is not double-prefixed", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/es/models",
    currentLocale: "es",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/es/models`);
  assert.equal(alt.languages?.en, `${TENANT_ORIGIN}/models`);
});

test("path-based tenants keep the locale segment ahead of the tenant prefix", () => {
  const alt = buildLocaleAlternates({
    origin: PLATFORM_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
    pathPrefix: "/impronta",
  });

  assert.equal(alt.canonical, `${PLATFORM_ORIGIN}/impronta/models`);
  assert.equal(alt.languages?.es, `${PLATFORM_ORIGIN}/es/impronta/models`);

  const home = buildLocaleAlternates({
    origin: PLATFORM_ORIGIN,
    pathnameWithoutLocale: "/",
    currentLocale: "es",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
    pathPrefix: "/impronta",
  });
  assert.equal(home.canonical, `${PLATFORM_ORIGIN}/es/impronta`);
  assert.equal(home.languages?.en, `${PLATFORM_ORIGIN}/impronta`);
});

test("an unsupported render locale canonicalizes to the default", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "fr",
    defaultLocale: "es",
    supportedLocales: ["es", "en"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/models`);
  assert.equal(alt.languages?.fr, undefined);
});

test("x-default is omitted when the default locale has no version of the page", () => {
  // A CMS page translated into the secondary language only: the tenant default
  // is `es`, but only `en` and `pt` rows exist.
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/p/about",
    currentLocale: "en",
    defaultLocale: "es",
    supportedLocales: ["en", "pt"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/en/p/about`);
  assert.deepEqual(alt.languages, {
    en: `${TENANT_ORIGIN}/en/p/about`,
    pt: `${TENANT_ORIGIN}/pt/p/about`,
  });
});

test("duplicate locales collapse instead of emitting the same link twice", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/models",
    currentLocale: "en",
    defaultLocale: "en",
    supportedLocales: ["en", "en", "es"],
  });

  assert.deepEqual(Object.keys(alt.languages ?? {}), ["en", "es", "x-default"]);
});

test("a single supported locale stays solo even when it is not the default", () => {
  const alt = buildLocaleAlternates({
    origin: TENANT_ORIGIN,
    pathnameWithoutLocale: "/p/solo",
    currentLocale: "en",
    defaultLocale: "es",
    supportedLocales: ["en"],
  });

  assert.equal(alt.canonical, `${TENANT_ORIGIN}/en/p/solo`);
  assert.equal(alt.languages, undefined);
});

/**
 * Source guard: the tenant metadata builder must resolve its origin from the
 * request host. `NEXT_PUBLIC_SITE_URL` reaching a tenant canonical IS the
 * 2026-08-16 bug, so its absence from this module is the invariant worth
 * pinning — a unit test cannot see which origin a server component picked.
 */
test("tenant alternates resolve their origin from the request host", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/seo/locale-alternates.ts"),
    "utf8",
  );

  assert.match(src, /publicAlternatesOrigin/);
  assert.match(src, /getPublicHostContext/);
  assert.match(src, /loadTenantLocaleSettings/);
  // No env read anywhere in the module: a canonical built from a build-time
  // env var cannot be tenant-aware, which is exactly how the bug happened.
  assert.ok(
    !src.includes("process.env"),
    "locale-alternates must not read an origin from the environment",
  );
  // Unresolvable host ⇒ no alternates at all, never a cross-domain canonical.
  assert.match(src, /if \(!origin\) return \{\};/);
});

test("the sitemap annotates alternates from the tenant's own locale settings", () => {
  const src = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

  // Storefront entries come from the tenant row, not a hardcoded EN/ES pair.
  assert.match(src, /loadTenantLocaleSettings\(hostContext\.tenantId\)/);
  assert.match(src, /buildLocaleAlternates\(/);
  // Every emitted entry carries its language map, which is what produces the
  // `<xhtml:link rel="alternate">` annotations the sitemap previously had none of.
  assert.match(src, /alternates: \{ languages/);
});
