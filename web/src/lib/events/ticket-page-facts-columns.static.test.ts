import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * 2026-09-17: the guest ticket page selected `agencies.default_locale`, a
 * column that does not exist, and since every facts read refuses the page,
 * every /ticket/<code> answered 404 on production. The public site's locale
 * lives on `agency_business_identity`.
 */
const src = readFileSync(new URL("./ticket-page-facts.ts", import.meta.url), "utf8");

test("the ticket page never selects default_locale from agencies", () => {
  const agenciesSelects = [...src.matchAll(/from\("agencies"\)\s*\.select\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(agenciesSelects.length > 0, "the workspace read is still on agencies");
  for (const cols of agenciesSelects) assert.ok(!/default_locale/.test(cols), `agencies select must not name default_locale: ${cols}`);
  assert.match(src, /from\("agency_business_identity"\)\s*\.select\("default_locale"\)/);
});
