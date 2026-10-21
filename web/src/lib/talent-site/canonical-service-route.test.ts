/**
 * TUL-1324 / TUL-1594 (failed staging QA on 546ea48): on a talent site the canonical service page is
 * `/<word>/<slug>`, e.g. `/servicios/sesion-de-fotos` and `/en/services/photo-session`. The id8 form
 * `servicio-<title>-<id8>` and old `offering_slugs` history redirect TO it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildOfferingIndex, type OfferingSlugDbRow } from "@/lib/offerings/offering-index";
import { isCatalogWordSegment, resolveOfferingPath } from "@/lib/offerings/offering-paths";
import { isTalentSiteHostPathAllowed } from "@/lib/saas/talent-site-host-routing";
import { stripLocalePrefix } from "./strip-locale-prefix";

const A = "e823e3b0-1111-4222-8333-444455556666";
const rows: OfferingSlugDbRow[] = [
  { offering_id: A, locale: "es", slug: "sesion-de-fotos", is_current: true },
  { offering_id: A, locale: "es", slug: "sesion-de-fotos-clasica", is_current: false },
  { offering_id: A, locale: "en", slug: "photo-session", is_current: true },
];
const settings = { defaultLocale: "es", publicLocales: ["es", "en"] };
const index = buildOfferingIndex({ rows, offeringIds: [A], primaryLocale: "es" });
const resolve = (pathname: string) => resolveOfferingPath({ pathname, host: { hostKind: "talent", settings }, index });

test("the readable canonical paths are the 200 pages (Spanish primary, English secondary)", () => {
  // The Spanish word is served by the route on disk under the English word: a rewrite, i.e. a 200 at the Spanish URL.
  assert.deepEqual(resolve("/servicios/sesion-de-fotos"), { kind: "rewrite", offeringId: A, locale: "es", to: "/services/sesion-de-fotos" });
  assert.deepEqual(resolve("/en/services/photo-session"), { kind: "current", offeringId: A, locale: "en" });
});

test("the legacy servicio-<title>-<id8> form and an old history slug redirect TO the canonical (301)", () => {
  assert.deepEqual(resolve("/servicio-sesion-de-fotos-e823e3b0"), { kind: "redirect", status: 301, to: "/servicios/sesion-de-fotos" });
  assert.deepEqual(resolve("/en/servicio-sesion-de-fotos-e823e3b0"), { kind: "redirect", status: 301, to: "/en/services/photo-session" });
  assert.deepEqual(resolve("/servicios/sesion-de-fotos-clasica"), { kind: "redirect", status: 301, to: "/servicios/sesion-de-fotos" });
});

test("a readable path that names nothing is missing (a real 404), and a bare non-service segment is none", () => {
  assert.equal(resolve("/servicios/no-existe").kind, "missing");
  assert.equal(resolve("/about").kind, "none");
});

test("the talent host routing lets <word>/<slug> through only when the resolver is on; flag off is unchanged", () => {
  assert.deepEqual(isTalentSiteHostPathAllowed("/servicios/sesion-de-fotos", { serviceCanonical: true }), { kind: "render", pageSlug: "servicios/sesion-de-fotos" });
  assert.deepEqual(isTalentSiteHostPathAllowed("/services/photo-session", { serviceCanonical: true }), { kind: "render", pageSlug: "services/photo-session" });
  assert.equal(isTalentSiteHostPathAllowed("/servicios/sesion-de-fotos"), null);
  assert.equal(isTalentSiteHostPathAllowed("/servicios/sesion-de-fotos", { serviceCanonical: false }), null);
  // not a catalog word, or three segments: still not a talent page
  assert.equal(isTalentSiteHostPathAllowed("/galeria/foto-1", { serviceCanonical: true }), null);
  assert.equal(isTalentSiteHostPathAllowed("/servicios/a/b", { serviceCanonical: true }), null);
  // single-segment pages are untouched
  assert.deepEqual(isTalentSiteHostPathAllowed("/galeria", { serviceCanonical: true }), { kind: "render", pageSlug: "galeria" });
});

test("isCatalogWordSegment: both languages, any case; not slugs", () => {
  for (const w of ["servicios", "services", "Servicios", "tours", "menu", "clases", "classes", "espacios", "spaces"]) assert.equal(isCatalogWordSegment(w), true, w);
  for (const w of ["galeria", "servicio-x-e823e3b0", "", null, undefined]) assert.equal(isCatalogWordSegment(w as string), false, String(w));
});

test("stripLocalePrefix drops only a real site language", () => {
  assert.equal(stripLocalePrefix("/en/services/photo-session", ["es", "en"]), "/services/photo-session");
  assert.equal(stripLocalePrefix("/servicios/sesion-de-fotos", ["es", "en"]), "/servicios/sesion-de-fotos");
  assert.equal(stripLocalePrefix("/services/photo-session", ["es", "en"]), "/services/photo-session");
});

test("wiring: the proxy leaves <word>/<slug> to the page when the flag is on; the page redirects, 404s or serves", () => {
  const host = readFileSync(join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"), "utf8");
  assert.match(host, /canonicalServicePath = servicePresentationResolverEnabled\(\) && innerSegs\.length === 2 && isCatalogWordSegment\(innerSegs\[0\]\)/);
  assert.match(host, /canonicalServicePath \? null : talentGuestServiceAlias\(localeStripped, \{ localePrefix \}\)/);
  assert.match(host, /isTalentSiteHostPathAllowed\(localeStripped, \{ serviceCanonical: servicePresentationResolverEnabled\(\) \}\)/);
  const page = readFileSync(join(process.cwd(), "src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx"), "utf8");
  assert.match(page, /resolveTalentServiceRoute\(talentProfileId, \(pageSlug \?\? \[\]\)\.join\("\/"\), locale\)/);
  assert.match(page, /serviceRoute\.kind === "redirect"\) permanentRedirect\(serviceRoute\.to\)/);
  assert.match(page, /serviceRoute\.kind === "missing"\) notFound\(\)/);
  assert.match(page, /serviceRoute\.kind === "none" && pageSlug && pageSlug\.length > 1\) notFound\(\)/);
  assert.match(page, /canonicalPath: canonicalPathOverride \?\? apexPath\(seg\)/);
  assert.match(page, /canonicalPath: true/);
});
