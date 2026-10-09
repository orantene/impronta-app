import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeUrl, normalizeWorkspaceSlugCandidate, stripUrlForSlug } from "./workspace-signup";

// Production onboarding produced "https-www-airstriplasvegas-com" and
// "https-www-instagram-com-thebarbe" from pasted links in the name field.
test("a pasted website becomes its brand, never the scheme/www/TLD soup", () => {
  assert.equal(normalizeWorkspaceSlugCandidate("https://www.airstriplasvegas.com"), "airstriplasvegas");
  assert.equal(normalizeWorkspaceSlugCandidate("http://shop.example.co.uk/menu?x=1"), "example");
  assert.equal(normalizeWorkspaceSlugCandidate("www.pixifly.com"), "pixifly");
  assert.equal(normalizeWorkspaceSlugCandidate("pixifly.mx"), "pixifly");
});

test("a social link keeps the handle", () => {
  assert.equal(normalizeWorkspaceSlugCandidate("https://www.instagram.com/thebarberstudio"), "thebarberstudio");
  assert.equal(normalizeWorkspaceSlugCandidate("https://instagram.com/@thebarberstudio/"), "thebarberstudio");
  assert.equal(normalizeWorkspaceSlugCandidate("facebook.com/ana.nails"), "ana-nails");
  assert.equal(normalizeWorkspaceSlugCandidate("https://www.tiktok.com/@ana_nails"), "ana-nails");
});

test("real names are untouched, including ones that contain a dot", () => {
  assert.equal(normalizeWorkspaceSlugCandidate("Café del Mar / Tulum"), "cafe-del-mar-tulum");
  assert.equal(normalizeWorkspaceSlugCandidate("Joe.com Cleaning"), "joe-com-cleaning");
  assert.equal(normalizeWorkspaceSlugCandidate("Estudio Ana"), "estudio-ana");
  assert.equal(looksLikeUrl("Estudio Ana"), false);
  assert.equal(stripUrlForSlug("Estudio Ana"), "Estudio Ana");
});

test("looksLikeUrl needs the whole string to be a link", () => {
  assert.equal(looksLikeUrl("https://www.shop.com/a"), true);
  assert.equal(looksLikeUrl("shop.com"), true);
  assert.equal(looksLikeUrl("see shop.com now"), false);
  assert.equal(looksLikeUrl(""), false);
});
