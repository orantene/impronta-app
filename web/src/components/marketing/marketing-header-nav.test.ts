/**
 * Active-state matching for the marketing header nav.
 *
 * Two regressions are pinned here:
 *  - `/#stories` used to mark itself active on the homepage, because stripping
 *    the hash left "/" which matched `/`. Visitors reported the homepage
 *    "looking like it landed on Stories".
 *  - hrefs are now locale-prefixed, so matching has to be locale-agnostic or
 *    the underline disappears on every Spanish page.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { isActive } from "@/components/marketing/marketing-header-nav";

test("a hash link never claims the active state", () => {
  assert.equal(isActive("/", "/#stories"), false);
  assert.equal(isActive("/", "/#builder"), false);
  assert.equal(isActive("/es", "/es#stories"), false);
  // even when the page genuinely is the anchor's page
  assert.equal(isActive("/pricing", "/pricing#plans"), false);
});

test("exact page matches", () => {
  assert.equal(isActive("/pricing", "/pricing"), true);
  assert.equal(isActive("/", "/"), true);
  assert.equal(isActive("/pricing", "/"), false);
  assert.equal(isActive("/", "/pricing"), false);
});

test("matching ignores locale prefixes on either side", () => {
  // href localized, pathname reported un-prefixed (rewrite) and vice versa
  assert.equal(isActive("/pricing", "/es/pricing"), true);
  assert.equal(isActive("/es/pricing", "/pricing"), true);
  assert.equal(isActive("/es/pricing", "/es/pricing"), true);
  assert.equal(isActive("/es", "/es"), true);
  assert.equal(isActive("/es", "/"), true);
  assert.equal(isActive("/es/pricing", "/es/network"), false);
});

test("child routes light up their parent, segment-aware", () => {
  assert.equal(isActive("/resources/glossary", "/resources"), true);
  assert.equal(isActive("/es/resources/glossary", "/es/resources"), true);
  // "/for" must not match "/format"
  assert.equal(isActive("/format", "/for"), false);
  assert.equal(isActive("/for", "/for"), true);
});
