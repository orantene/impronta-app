import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_DEMO_HOST_SUFFIX,
  TALENT_SITE_SUBDOMAIN_ROOTS,
  isTalentSiteLabel,
  splitTalentSiteHost,
  stripTalentDemoHostSuffix,
  talentDemoBareHostRedirectHost,
  talentSiteHost,
  talentSiteHostLabel,
  talentSitePathRedirectTarget,
  talentSitePathUrl,
  talentSitePublicUrl,
} from "./site-public-url";

test("the roots are the production host and the dev loopback wildcard", () => {
  assert.deepEqual([...TALENT_SITE_SUBDOMAIN_ROOTS], ["tulala.digital", "lvh.me"]);
});

test("isTalentSiteLabel accepts DNS labels and nothing else", () => {
  for (const ok of ["a", "sofia-mendez", "a1", "x".repeat(63)]) {
    assert.equal(isTalentSiteLabel(ok), true, ok);
  }
  for (const bad of [
    "",
    " ",
    "-lead",
    "trail-",
    "UPPER",
    "has.dot",
    "has_underscore",
    "x".repeat(64),
    null,
    undefined,
  ]) {
    assert.equal(isTalentSiteLabel(bad), false, String(bad));
  }
});

test("talentSiteHost builds <label>.<root>", () => {
  assert.equal(talentSiteHost("sofia-mendez"), "sofia-mendez.tulala.digital");
  assert.equal(talentSiteHost("sofia-mendez", "lvh.me"), "sofia-mendez.lvh.me");
  assert.equal(talentSiteHost("not a label"), null);
  assert.equal(talentSiteHost(null), null);
});

test("demo hosts append the -demo suffix without renaming site_slug", () => {
  assert.equal(TALENT_DEMO_HOST_SUFFIX, "-demo");
  assert.equal(talentSiteHostLabel("alba-nail-artist"), "alba-nail-artist");
  assert.equal(
    talentSiteHostLabel("alba-nail-artist", { isDemo: true }),
    "alba-nail-artist-demo",
  );
  assert.equal(
    talentSiteHost("alba-nail-artist", "tulala.digital", { isDemo: true }),
    "alba-nail-artist-demo.tulala.digital",
  );
  assert.equal(
    talentSitePublicUrl("camila-nails", { isDemo: true }),
    "https://camila-nails-demo.tulala.digital",
  );
  assert.equal(stripTalentDemoHostSuffix("alba-nail-artist-demo"), "alba-nail-artist");
  assert.equal(stripTalentDemoHostSuffix("alba-nail-artist"), null);
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "alba-nail-artist.tulala.digital",
      siteSlug: "alba-nail-artist",
      isDemo: true,
    }),
    "alba-nail-artist-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "alba-nail-artist-demo.tulala.digital",
      siteSlug: "alba-nail-artist",
      isDemo: true,
    }),
    null,
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "folio-demo.tulala.digital",
      siteSlug: "mateo-ferrer",
      isDemo: true,
    }),
    "mateo-ferrer-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "gridline-demo.tulala.digital",
      siteSlug: "alex-trevino",
      isDemo: true,
    }),
    "alex-trevino-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "maison-v2-demo.tulala.digital",
      siteSlug: "alba-nail-artist",
      isDemo: true,
    }),
    "alba-nail-artist-demo.tulala.digital",
  );
  // GRK-089 / TUL-537 shorthand hosts resolve in SQL then 308 here.
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "alba-demo.tulala.digital",
      siteSlug: "alba-nail-artist",
      isDemo: true,
    }),
    "alba-nail-artist-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "linh-demo.tulala.digital",
      siteSlug: "linh-tran",
      isDemo: true,
    }),
    "linh-tran-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "sofia-nails-demo.tulala.digital",
      siteSlug: "camila-nails",
      isDemo: true,
    }),
    "camila-nails-demo.tulala.digital",
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "valeria-baila-demo.tulala.digital",
      siteSlug: "valeria-baila",
      isDemo: true,
    }),
    null,
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "sofia.tulala.digital",
      siteSlug: "sofia",
      isDemo: false,
    }),
    null,
  );
  assert.equal(
    talentDemoBareHostRedirectHost({
      hostname: "folio-demo.tulala.digital",
      siteSlug: null,
      isDemo: true,
    }),
    null,
  );
});

test("talentSitePublicUrl is absolute, https by default, and carries inner pages", () => {
  assert.equal(talentSitePublicUrl("sofia"), "https://sofia.tulala.digital");
  assert.equal(
    talentSitePublicUrl("sofia", { pageSlug: "about" }),
    "https://sofia.tulala.digital/about",
  );
  assert.equal(
    talentSitePublicUrl("sofia", { root: "lvh.me", protocol: "http", port: 3000 }),
    "http://sofia.lvh.me:3000",
  );
  assert.equal(talentSitePublicUrl(""), null);
});

test("talentSitePathUrl is today's path address", () => {
  assert.equal(talentSitePathUrl("sofia"), "/t/site/sofia");
  assert.equal(talentSitePathUrl("sofia", "about"), "/t/site/sofia/about");
  assert.equal(talentSitePathUrl(null), null);
});

test("splitTalentSiteHost accepts exactly one label under a known root", () => {
  assert.deepEqual(splitTalentSiteHost("sofia.tulala.digital"), {
    label: "sofia",
    root: "tulala.digital",
  });
  assert.deepEqual(splitTalentSiteHost("sofia.lvh.me:3000"), {
    label: "sofia",
    root: "lvh.me",
  });
  // Trailing dot (absolute FQDN) is stripped.
  assert.deepEqual(splitTalentSiteHost("sofia.tulala.digital."), {
    label: "sofia",
    root: "tulala.digital",
  });
});

test("splitTalentSiteHost rejects everything that is not exactly one label", () => {
  for (const bad of [
    // the root itself, and www — no label to resolve
    "tulala.digital",
    "lvh.me",
    // multi-label: must NEVER be reduced to its first label
    "admin.acme.tulala.digital",
    "a.b.lvh.me",
    // other roots entirely
    "sofia.tulala.digital.evil.com",
    "sofia.example.com",
    "sofia.tulala.digitalx",
    // shape
    "-sofia.tulala.digital",
    "sofia-.tulala.digital",
    "SOFIA.tulala.digital",
    "sofia.TULALA.digital",
    "[::1]:3000",
    "",
    null,
    undefined,
  ]) {
    assert.equal(splitTalentSiteHost(bad), null, String(bad));
  }
});

test("talentSitePathRedirectTarget only fires when the switch is on in production", () => {
  const base = { slug: "sofia", enabled: true, isProduction: true } as const;
  assert.equal(talentSitePathRedirectTarget(base), "https://sofia.tulala.digital");
  assert.equal(
    talentSitePathRedirectTarget({ ...base, pageSlug: "about" }),
    "https://sofia.tulala.digital/about",
  );
  assert.equal(
    talentSitePathRedirectTarget({ ...base, slug: "camila-nails", isDemo: true }),
    "https://camila-nails-demo.tulala.digital",
  );
  assert.equal(talentSitePathRedirectTarget({ ...base, enabled: false }), null);
  assert.equal(talentSitePathRedirectTarget({ ...base, isProduction: false }), null);
  assert.equal(talentSitePathRedirectTarget({ ...base, slug: null }), null);
});

test("talentSitePathRedirectTarget never redirects a preview request", () => {
  // The subdomain resolves only for a PUBLISHED site, so an owner previewing a
  // site that has never been published must keep the path address. Redirecting
  // would send them to a host that does not resolve.
  for (const preview of ["draft", "1", "anything"]) {
    assert.equal(
      talentSitePathRedirectTarget({
        slug: "sofia",
        pageSlug: "about",
        preview,
        enabled: true,
        isProduction: true,
      }),
      null,
      preview,
    );
  }
  // A blank / absent param is not a preview and still moves.
  assert.equal(
    talentSitePathRedirectTarget({
      slug: "sofia",
      preview: "",
      enabled: true,
      isProduction: true,
    }),
    "https://sofia.tulala.digital",
  );
  assert.equal(
    talentSitePathRedirectTarget({
      slug: "sofia",
      preview: null,
      enabled: true,
      isProduction: true,
    }),
    "https://sofia.tulala.digital",
  );
});
