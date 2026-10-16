import assert from "node:assert/strict";
import test from "node:test";

import { buildGscGuide, GSC_ADD_PROPERTY_URL } from "./search-console-guide";

test("sitemap url is site + /sitemap.xml with no double slash", () => {
  const g = buildGscGuide({ siteUrl: "https://tulala.digital/t/TAL-1/" }, "en");
  assert.equal(g.siteUrl, "https://tulala.digital/t/TAL-1");
  assert.equal(g.sitemapUrl, "https://tulala.digital/t/TAL-1/sitemap.xml");
});

test("tulala hosts use the HTML tag method and say it is not self-serve yet", () => {
  const g = buildGscGuide({ siteUrl: "https://ana.tulala.digital" }, "en");
  assert.equal(g.mode, "tulala");
  assert.equal(g.tagSupported, false);
  assert.ok(g.steps.some((s) => /HTML tag/i.test(s.title)));
  assert.ok(!g.steps.some((s) => /TXT/.test(s.title)));
});

test("custom domains get DNS TXT steps", () => {
  const g = buildGscGuide({ siteUrl: "https://ana.com" }, "en");
  assert.equal(g.mode, "custom");
  assert.ok(g.steps.some((s) => /TXT/.test(s.title)));
});

test("spanish copy, no em dashes anywhere", () => {
  for (const url of ["https://ana.com", "https://tulala.digital/t/X"]) {
    for (const lang of ["en", "es"] as const) {
      const g = buildGscGuide({ siteUrl: url }, lang);
      const all = JSON.stringify(g);
      assert.ok(!all.includes("—"));
    }
  }
  const es = buildGscGuide({ siteUrl: "https://ana.com" }, "es");
  assert.ok(es.steps.some((s) => /registro TXT/i.test(s.title)));
});

test("missing site url yields null urls and a flag", () => {
  const g = buildGscGuide({ siteUrl: null }, "en");
  assert.equal(g.siteUrl, null);
  assert.equal(g.sitemapUrl, null);
  assert.equal(GSC_ADD_PROPERTY_URL.startsWith("https://search.google.com/search-console"), true);
});
