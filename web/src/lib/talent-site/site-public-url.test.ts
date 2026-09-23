import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_SITE_SUBDOMAIN_ROOTS,
  isTalentSiteLabel,
  splitTalentSiteHost,
  talentSiteHost,
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
