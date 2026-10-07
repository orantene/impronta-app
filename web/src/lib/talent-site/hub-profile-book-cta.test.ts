import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveHubProfileCta, talentSiteBookHref } from "./hub-profile-book-cta";

test("platform host + site: primary Book deep-links to the site booking anchor", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, maxSiteUrl: "https://jorgelina.example.com" }),
    { kind: "book", href: "https://jorgelina.example.com#talent-ask", external: true },
  );
});

test("platform host + path-address site: relative href, not external", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: true, maxSiteUrl: "/t/site/jorgelina" }),
    { kind: "book", href: "/t/site/jorgelina#talent-ask", external: false },
  );
});

test("no site keeps Inquire", () => {
  for (const maxSiteUrl of [null, undefined, "", "   "]) {
    assert.deepEqual(resolveHubProfileCta({ platformHost: true, maxSiteUrl }), { kind: "inquire" });
  }
});

test("agency host keeps Inquire even with a site", () => {
  assert.deepEqual(
    resolveHubProfileCta({ platformHost: false, maxSiteUrl: "https://x.example.com" }),
    { kind: "inquire" },
  );
});

test("an existing hash is replaced, never stacked", () => {
  assert.equal(talentSiteBookHref("https://x.example.com/#about"), "https://x.example.com/#talent-ask");
});
