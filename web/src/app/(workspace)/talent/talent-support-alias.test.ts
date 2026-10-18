// TUL-1241: /talent/support and /talent/help must never hit Next's English
// "This page couldn't load" crash for a Spanish talent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isTalentSupportAlias } from "./_talent-support-alias";
import { talentNotFoundCopy } from "./_talent-not-found-copy";

const dir = __dirname;

test("support and help (any case) are support aliases; nothing else is", () => {
  assert.equal(isTalentSupportAlias(["support"]), true);
  assert.equal(isTalentSupportAlias(["help"]), true);
  assert.equal(isTalentSupportAlias(["Help"]), true);
  assert.equal(isTalentSupportAlias(["support", "x"]), false);
  assert.equal(isTalentSupportAlias(["nope"]), false);
  assert.equal(isTalentSupportAlias([]), false);
});

test("the catch-all never throws notFound() inside the shell and renders the localized card", () => {
  const src = readFileSync(join(dir, "[...missing]", "page.tsx"), "utf8");
  assert.doesNotMatch(src, /notFound\(\)/);
  assert.match(src, /TalentNotFound/);
  assert.match(src, /TalentSupportEntry/);
});

test("the entry opens the support panel after going to Today", () => {
  const src = readFileSync(join(dir, "[...missing]", "talent-support-entry.tsx"), "utf8");
  assert.match(src, /router\.replace\("\/talent\/today"\)/);
  assert.match(src, /openSupportPanel\(\)/);
});

test("the card copy is Spanish for an ES talent", () => {
  assert.equal(talentNotFoundCopy("es").title, "Página no encontrada");
});
