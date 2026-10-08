import test from "node:test";
import assert from "node:assert/strict";

import type { MaxSitePageRow, MaxSiteRow } from "@/lib/talent-site/resolve-max-site-core";
import { buildMaxSiteSeo } from "./server/max-site-seo.server";
import { isOwnCanonical } from "./canonical-own-host";

const own = { origin: "https://jorg-beauty-qa.tulala.digital", hosts: ["www.jorgelina.com", "Jorgelina.COM:8443"] };

test("isOwnCanonical: own origin host, case-insensitive, port ignored", () => {
  assert.equal(isOwnCanonical("https://jorg-beauty-qa.tulala.digital/", own), true);
  assert.equal(isOwnCanonical("https://JORG-Beauty-QA.tulala.digital/x", own), true);
  assert.equal(isOwnCanonical("http://jorg-beauty-qa.tulala.digital:3001/x", own), true);
});

test("isOwnCanonical: other own hosts; www is not stripped", () => {
  assert.equal(isOwnCanonical("https://www.jorgelina.com/", own), true);
  assert.equal(isOwnCanonical("https://jorgelina.com/", own), true);
  assert.equal(isOwnCanonical("https://www.other.com/", { origin: own.origin, hosts: ["other.com"] }), false);
});

test("isOwnCanonical: foreign, relative, garbage and non-http are not own", () => {
  assert.equal(isOwnCanonical("https://book-jorgelina.tulala.digital/", own), false);
  assert.equal(isOwnCanonical("/services", own), false);
  assert.equal(isOwnCanonical("not a url", own), false);
  assert.equal(isOwnCanonical("", own), false);
  assert.equal(isOwnCanonical("javascript://jorg-beauty-qa.tulala.digital/", own), false);
});

const site = { siteSlug: "jorg-beauty-qa", logoUrl: null } as unknown as MaxSiteRow;
function pageWith(canonicalUrl: string | null): MaxSitePageRow {
  return { id: "p1", title: "Home", metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null, ogImageUrl: null, canonicalUrl, noindex: null, jsonLd: null } as unknown as MaxSitePageRow;
}
const ORIGIN = "https://jorg-beauty-qa.tulala.digital";
const BILINGUAL = { primary: "es", urlDefault: "es", supported: ["es", "en"] };

function seo(canonicalUrl: string | null, extra: { ownHosts?: string[]; locale?: string } = {}) {
  return buildMaxSiteSeo({
    site, page: pageWith(canonicalUrl), identity: null, locale: extra.locale ?? "es", noindex: false,
    canonicalOrigin: ORIGIN, canonicalPath: "/", locales: BILINGUAL, ownHosts: extra.ownHosts,
  });
}

test("buildMaxSiteSeo: another talent's subdomain is ignored (the #201 incident)", () => {
  const out = seo("https://book-jorgelina.tulala.digital/");
  assert.equal(out.canonical, `${ORIGIN}/`);
  assert.equal(out.alternates?.canonical, `${ORIGIN}/`);
  assert.ok(!JSON.stringify(out.jsonLd ?? null).includes("book-jorgelina"));
});

test("buildMaxSiteSeo: own subdomain kept, uppercase host kept", () => {
  assert.equal(seo(`${ORIGIN}/custom`).canonical, `${ORIGIN}/custom`);
  assert.equal(seo("https://JORG-BEAUTY-QA.tulala.digital/Custom").canonical, "https://JORG-BEAUTY-QA.tulala.digital/Custom");
});

test("buildMaxSiteSeo: own custom domain kept only when passed in ownHosts", () => {
  assert.equal(seo("https://jorgelina.com/", { ownHosts: ["jorgelina.com"] }).canonical, "https://jorgelina.com/");
  assert.equal(seo("https://jorgelina.com/").canonical, `${ORIGIN}/`);
});

test("buildMaxSiteSeo: relative and garbage values are ignored", () => {
  assert.equal(seo("/about").canonical, `${ORIGIN}/`);
  assert.equal(seo("garbage").canonical, `${ORIGIN}/`);
});

test("buildMaxSiteSeo: secondary-locale pages stay self-canonical", () => {
  const built = seo(null, { locale: "en" }).canonical;
  assert.ok(built?.startsWith(`${ORIGIN}/en`));
  assert.equal(seo("https://book-jorgelina.tulala.digital/", { locale: "en" }).canonical, built);
  assert.equal(seo(`${ORIGIN}/custom`, { locale: "en" }).canonical, built);
});
