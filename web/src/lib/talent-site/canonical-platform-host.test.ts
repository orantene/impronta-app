/**
 * #201 follow-up: the page-route canonical and the platform subdomain follow
 * the own-host rule.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { MaxSitePageRow, MaxSiteRow } from "@/lib/talent-site/resolve-max-site-core";
import { buildMaxSiteSeo } from "./server/max-site-seo.server";
import { platformSiteHosts } from "./canonical-own-host";
import { resolvePublishedTalentPage, type PublishedTalentPageRow } from "./published-talent-page-core";
import { buildTalentPageSeo, type TalentPageSeoColumns } from "./talent-page-seo";

const ORIGIN = "https://app.tulala.digital";
const PATH = "/t/ANA123/about";
const BUILT = `${ORIGIN}${PATH}`;

function page(canonicalUrl: string | null): TalentPageSeoColumns {
  return {
    title: "About", metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null,
    ogImageUrl: null, canonicalUrl, noindex: null, jsonLd: null,
  };
}
function canonical(canonicalUrl: string | null, ownHosts?: string[]): string | undefined {
  return buildTalentPageSeo({
    page: page(canonicalUrl), planKey: "talent_portfolio", canonicalOrigin: ORIGIN, canonicalPath: PATH, ownHosts,
  }).canonical;
}

test("platformSiteHosts: slug host, demo host, unusable slug", () => {
  assert.deepEqual(platformSiteHosts("jorg-beauty-qa"), ["jorg-beauty-qa.tulala.digital"]);
  assert.deepEqual(platformSiteHosts("jorg-beauty-qa", { isDemo: true }), ["jorg-beauty-qa-demo.tulala.digital"]);
  assert.deepEqual(platformSiteHosts(null), []);
  assert.deepEqual(platformSiteHosts("Bad Slug!"), []);
});

test("buildTalentPageSeo: foreign host explicit canonical is ignored", () => {
  assert.equal(canonical("https://book-jorgelina.tulala.digital/about", ["jorgelina.com"]), BUILT);
  assert.equal(canonical("https://book-jorgelina.tulala.digital/about"), BUILT);
});

test("buildTalentPageSeo: own custom domain kept only when in ownHosts", () => {
  assert.equal(canonical("https://jorgelina.com/about", ["jorgelina.com"]), "https://jorgelina.com/about");
  assert.equal(canonical("https://jorgelina.com/about"), BUILT);
});

test("buildTalentPageSeo: platform subdomain kept, uppercase host kept", () => {
  const hosts = platformSiteHosts("jorg-beauty-qa");
  assert.equal(canonical("https://jorg-beauty-qa.tulala.digital/about", hosts), "https://jorg-beauty-qa.tulala.digital/about");
  assert.equal(canonical("https://JORG-Beauty-QA.tulala.digital/About", hosts), "https://JORG-Beauty-QA.tulala.digital/About");
});

test("buildTalentPageSeo: origin host itself, relative and garbage values", () => {
  assert.equal(canonical(`${ORIGIN}/custom`), `${ORIGIN}/custom`);
  assert.equal(canonical("/about"), BUILT);
  assert.equal(canonical("garbage"), BUILT);
});

test("buildTalentPageSeo: non-Portfolio still emits no canonical", () => {
  const seo = buildTalentPageSeo({
    page: page("https://jorgelina.com/"), planKey: "talent_free", canonicalOrigin: ORIGIN, canonicalPath: PATH,
    ownHosts: ["jorgelina.com"],
  });
  assert.equal(seo.canonical, undefined);
});

test("resolvePublishedTalentPage: loadOwnHosts feeds the guard; a throw degrades to origin-only", async () => {
  const row: PublishedTalentPageRow = {
    id: "p1", talent_profile_id: "t1", slug: "about", title: "About", status: "published", blocks: [], theme: {},
    published_at: null, canonical_url: "https://jorgelina.com/about",
  };
  const run = (loadOwnHosts: (id: string) => Promise<string[]>) =>
    resolvePublishedTalentPage(
      {
        loadTalentByProfileCode: async () => ({ id: "t1", managingTenantId: null, displayName: "Ana", talentPlanKey: "talent_portfolio" }),
        loadTalentPage: async () => row,
        loadOwnHosts,
      },
      { profileCode: "ANA123", slug: "about", canonicalOrigin: ORIGIN, canonicalPath: PATH },
    );
  assert.equal((await run(async () => ["jorgelina.com"]))?.seo.canonical, "https://jorgelina.com/about");
  assert.equal((await run(async () => []))?.seo.canonical, BUILT);
  assert.equal(
    (await run(async () => {
      throw new Error("db");
    }))?.seo.canonical,
    BUILT,
  );
});

test("buildMaxSiteSeo: platform subdomain kept on an app-origin route, foreign still ignored", () => {
  const site = { siteSlug: "jorg-beauty-qa", logoUrl: null } as unknown as MaxSiteRow;
  const mk = (canonicalUrl: string) =>
    ({
      id: "p1", title: "Home", metaTitle: null, metaDescription: null, ogTitle: null, ogDescription: null,
      ogImageUrl: null, canonicalUrl, noindex: null, jsonLd: null,
    }) as unknown as MaxSitePageRow;
  const run = (canonicalUrl: string) =>
    buildMaxSiteSeo({
      site, page: mk(canonicalUrl), identity: null, locale: "en", noindex: false,
      canonicalOrigin: ORIGIN, canonicalPath: "/t/site/jorg-beauty-qa", ownHosts: platformSiteHosts("jorg-beauty-qa"),
    }).canonical;
  assert.equal(run("https://jorg-beauty-qa.tulala.digital/"), "https://jorg-beauty-qa.tulala.digital/");
  assert.equal(run("https://book-jorgelina.tulala.digital/"), `${ORIGIN}/t/site/jorg-beauty-qa`);
});
