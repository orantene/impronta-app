/**
 * TUL-516 S2 — talent host soft 404 + /agendar booking alias.
 *
 * Pins the proxy + route wiring so Spanish vanity hosts never fall back to the
 * English Tulala `/_page-not-found` card, and `/agendar` / `/en/book` open `#book`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const HOST_RESPONSE = read("src/lib/saas/talent-site-host-response.ts");
const HOST_ROUTE = read("src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx");
const NOT_FOUND = read("src/app/not-found.tsx");
const SOFT_404 = read("src/lib/talent-site/server/soft-404-main.tsx");
const RENDER = read("src/lib/talent-site/server/render-max-site.tsx");

test("talent host allow-list reject rewrites to soft-404 Max route, not /_page-not-found", () => {
  assert.match(HOST_RESPONSE, /HOST_TALENT_SOFT_404_HEADER/);
  assert.match(HOST_RESPONSE, /status:\s*404/);
  assert.match(HOST_RESPONSE, /talentSiteHostRewritePath\(null\)/);
  assert.doesNotMatch(HOST_RESPONSE, /\/_page-not-found/);
});

test("talent host /agendar and /book redirect to locale home + #book", () => {
  assert.match(HOST_RESPONSE, /isTalentBookingAliasPath/);
  assert.match(HOST_RESPONSE, /talentBookingSheetRedirectPath/);
  assert.match(HOST_RESPONSE, /NextResponse\.redirect\(new URL\(dest, request\.url\), 302\)/);
});

test("soft-404 copy is es+en with Volver al inicio / Back to home", () => {
  assert.match(SOFT_404, /Volver al inicio/);
  assert.match(SOFT_404, /Back to home/);
  assert.match(SOFT_404, /Página no encontrada/);
  assert.match(SOFT_404, /Page not found/);
  assert.doesNotMatch(SOFT_404, /—/);
});

test("renderTalentMaxSite accepts soft404 mainOverride", () => {
  assert.match(RENDER, /soft404\?: boolean/);
  assert.match(RENDER, /soft404MainNode/);
  assert.match(RENDER, /soft404Seo/);
});

test("talent host route reads soft-404 header and unknown slug calls notFound()", () => {
  assert.match(HOST_ROUTE, /HOST_TALENT_SOFT_404_HEADER/);
  assert.match(HOST_ROUTE, /soft404/);
  assert.match(HOST_ROUTE, /notFound\(\)/);
});

test("root not-found paints talent_site soft 404 (es+en shell)", () => {
  assert.match(NOT_FOUND, /kind === "talent_site"/);
  assert.match(NOT_FOUND, /soft404:\s*true/);
  assert.match(NOT_FOUND, /renderTalentMaxSite/);
});
