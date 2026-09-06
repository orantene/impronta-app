import test from "node:test";
import assert from "node:assert/strict";

import { checkDestination } from "./destination-check";

const slugs = ["about", "our-story", "wine-list"];

test("a known public route is verified", () => {
  for (const to of ["/", "/contact", "/menu", "/directory", "/book"]) {
    assert.equal(checkDestination(to, slugs).verified, true, to);
  }
});

test("a known prefix with a segment after it is verified", () => {
  for (const to of ["/t/jane-doe", "/p/about", "/posts/spring-2026", "/r/abc123"]) {
    assert.equal(checkDestination(to, slugs).verified, true, to);
  }
});

test("one of the tenant's own published pages is verified", () => {
  assert.equal(checkDestination("/about", slugs).verified, true);
  assert.equal(checkDestination("/wine-list", slugs).verified, true);
});

test("the production QA failure is now caught", () => {
  // A code pointed at /menu on a site with no menu page. /menu IS a known
  // route platform-wide, so the honest catch is a slug that matches nothing.
  const v = checkDestination("/nonexistent-page", slugs);
  assert.equal(v.verified, false);
  if (!v.verified) assert.match(v.reason, /Nothing on this site matches/);
});

test("an absolute URL is the operator's business and is not second-guessed", () => {
  // Their booking provider, their Instagram, a partner site. We cannot know it.
  assert.equal(checkDestination("https://instagram.com/casarizo", slugs).verified, true);
  assert.equal(checkDestination("http://example.com/x", slugs).verified, true);
});

test("a query or hash does not make a good path look unknown", () => {
  // A table code legitimately carries ?table=7. Comparing the whole string
  // instead of the path would flag every one of them.
  assert.equal(checkDestination("/menu?table=7", slugs).verified, true);
  assert.equal(checkDestination("/about#hours", slugs).verified, true);
  assert.equal(checkDestination("/t/jane?ref=qr", slugs).verified, true);
});

test("a trailing slash does not change the verdict", () => {
  assert.equal(checkDestination("/about/", slugs).verified, true);
  assert.equal(checkDestination("/", slugs).verified, true);
});

test("an empty or malformed destination is flagged with something actionable", () => {
  const empty = checkDestination("   ", slugs);
  assert.equal(empty.verified, false);
  const bare = checkDestination("menu", slugs);
  assert.equal(bare.verified, false);
  if (!bare.verified) assert.match(bare.reason, /start with \/|https:\/\//);
});

test("the verdict is ADVISORY — an unverified destination still describes a working link", () => {
  const v = checkDestination("/whatever", slugs);
  assert.equal(v.verified, false);
  // The wording must not imply the save was refused; it was not.
  if (!v.verified) assert.match(v.reason, /will still work/);
});

test("a tenant with no published pages still verifies platform routes", () => {
  assert.equal(checkDestination("/contact", []).verified, true);
  assert.equal(checkDestination("/about", []).verified, false);
});
