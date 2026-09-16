import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveVenueEngineRefusals, venueEngineRefusalSentence, VENUE_ENGINE_REFUSALS } from "./engine-refusals";

/**
 * D-141: `/visit/<token>/menu`, `/visit/<token>/share` and `/ticket/<code>`
 * were a 500 for every guest because the server page handed its client
 * component a FUNCTION (`tRefusal={(key) => tr(key)}`), which React refuses
 * to serialise. The sentences cross the boundary as data now.
 */
const PAGES = [
  "src/app/(public)/visit/[token]/menu/page.tsx",
  "src/app/(public)/visit/[token]/share/page.tsx",
  "src/app/(public)/ticket/[code]/page.tsx",
];

for (const page of PAGES) {
  test(`${page} passes no function prop to its client component`, () => {
    const src = readFileSync(join(process.cwd(), page), "utf8");
    assert.doesNotMatch(src, /tRefusal=/, "the function prop is gone");
    assert.doesNotMatch(src, /=\{\s*\((?:[^)]*)\)\s*=>/, "no inline arrow is passed as a prop");
    assert.match(src, /refusals=\{resolveVenueEngineRefusals\(tr\)\}/);
  });
}

test("resolveVenueEngineRefusals resolves every code and the sentence lookup falls back to unavailable", () => {
  const sentences = resolveVenueEngineRefusals((key) => `T:${key}`);
  for (const [code, key] of Object.entries(VENUE_ENGINE_REFUSALS)) {
    assert.equal(sentences[code as keyof typeof sentences], `T:${key}`);
  }
  assert.equal(venueEngineRefusalSentence(sentences, "visit_closed"), `T:${VENUE_ENGINE_REFUSALS.visit_closed}`);
  assert.equal(venueEngineRefusalSentence(sentences, "no_such_word"), `T:${VENUE_ENGINE_REFUSALS.unavailable}`);
});
