/**
 * TUL-1794: the changelog advertises the REQUEST host, not a hard-coded
 * production origin. Staging must never point readers at the production feed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChangelogFeed } from "./feed";
import { changelogOrigin, PRODUCTION_CHANGELOG_ORIGIN } from "./request-origin";
import { resolveTrustedPublicOrigin } from "../storefront/trusted-public-origin";

const entry = { id: "abc", title: "T", summary: "S", date: "2026-10-20" } as unknown as Parameters<typeof buildChangelogFeed>[0][number];

test("production origin is unchanged", () => {
  assert.equal(PRODUCTION_CHANGELOG_ORIGIN, "https://tulala.digital");
  assert.equal(changelogOrigin("https://tulala.digital"), "https://tulala.digital");
  assert.equal(changelogOrigin(null), "https://tulala.digital");
  assert.equal(changelogOrigin(undefined), "https://tulala.digital");
  assert.equal(changelogOrigin("not an origin"), "https://tulala.digital");
});

test("a staging request host is advertised, resolved through the trusted-host helper", () => {
  const staging = resolveTrustedPublicOrigin({
    stampedHostname: "staging.tulala.digital",
    hostHeader: "staging.tulala.digital",
    forwardedHost: null,
    proto: "https",
  });
  assert.equal(changelogOrigin(staging), "https://staging.tulala.digital");
  const prod = resolveTrustedPublicOrigin({ stampedHostname: "tulala.digital", hostHeader: "tulala.digital", forwardedHost: null, proto: "https" });
  assert.equal(changelogOrigin(prod), "https://tulala.digital");
});

test("a forged forwarded host never reaches the advertised origin", () => {
  const o = resolveTrustedPublicOrigin({
    stampedHostname: "staging.tulala.digital",
    hostHeader: "staging.tulala.digital",
    forwardedHost: "evil.example",
    proto: "https",
  });
  assert.equal(changelogOrigin(o), "https://staging.tulala.digital");
});

test("the feed self link and item links use the given base (EN and ES)", () => {
  const en = buildChangelogFeed([entry], "en", "https://staging.tulala.digital");
  assert.match(en, /<atom:link href="https:\/\/staging\.tulala\.digital\/changelog\/feed\.xml"/);
  assert.match(en, /<link>https:\/\/staging\.tulala\.digital\/changelog\/abc<\/link>/);
  assert.ok(!en.includes("https://tulala.digital"));
  const es = buildChangelogFeed([entry], "es", "https://staging.tulala.digital");
  assert.match(es, /href="https:\/\/staging\.tulala\.digital\/es\/novedades\/feed\.xml"/);
  const prod = buildChangelogFeed([entry], "en", "https://tulala.digital");
  assert.match(prod, /href="https:\/\/tulala\.digital\/changelog\/feed\.xml"/);
});
