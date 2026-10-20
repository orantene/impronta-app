import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  changelogPublicLaunch,
  changelogRobots,
  changelogSitemapPaths,
  visibleChangelogPosts,
} from "./changelog";

// TUL-1400: one switch, CHANGELOG_PUBLIC_LAUNCH. Off (default) = noindex, no sitemap entry, no launch post.
const OFF = [{}, { CHANGELOG_PUBLIC_LAUNCH: "" }, { CHANGELOG_PUBLIC_LAUNCH: "0" }, { CHANGELOG_PUBLIC_LAUNCH: "false" }];

test("flag defaults to off and only '1' turns it on", () => {
  for (const env of OFF) assert.equal(changelogPublicLaunch(env), false);
  assert.equal(changelogPublicLaunch({ CHANGELOG_PUBLIC_LAUNCH: "1" }), true);
});

test("off: noindex, no sitemap entry, no launch post", () => {
  assert.equal(changelogRobots(false).index, false);
  assert.deepEqual(changelogSitemapPaths(false), []);
  assert.equal(visibleChangelogPosts(false).length, 0);
});

test("on: indexable, sitemap entry, launch post renders in EN and ES without em dashes", () => {
  assert.equal(changelogRobots(true).index, true);
  assert.deepEqual(changelogSitemapPaths(true), ["/changelog"]);
  const posts = visibleChangelogPosts(true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].slug, "launch-edition");
  for (const loc of ["en", "es"] as const) {
    const p = posts[0].copy[loc];
    assert.ok(p.title.length > 0 && p.body.length > 0);
    assert.doesNotMatch(JSON.stringify(p), /—/);
  }
  assert.match(posts[0].copy.en.body.join(" "), /ORAN SIGN-OFF/);
});

test("sitemap and page wire the switch", () => {
  const sm = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
  assert.match(sm, /changelogSitemapPaths\(changelogPublicLaunch\(\)\)/);
  const page = readFileSync(join(process.cwd(), "src/app/(marketing)/changelog/page.tsx"), "utf8");
  assert.match(page, /changelogRobots\(/);
  assert.match(page, /visibleChangelogPosts\(/);
  assert.match(page, /if \(!changelogPublicLaunch\(\)\) notFound\(\);/);
});
