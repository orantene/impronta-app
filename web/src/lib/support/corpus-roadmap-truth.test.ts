import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { ROADMAP_PREFIX, buildGuestCorpus } from "./guest-corpus";

// What the assistant tells a stranger is shipped.
//
// The first AI-authored reply this product ever produced told a restaurant
// owner that table reservations were "on our roadmap, but not live yet" and
// offered him a waitlist. Reservations had shipped the day before. He could
// have booked a table that minute.
//
// The cause was one stale flag: the guest corpus derives "not yet available"
// from a feature's `status`, so a feature that ships without its flag being
// flipped is actively denied to the people asking for it. That is worse than
// silence — it is our own assistant talking a customer out of the product.
//
// This checks the claim against the code that would implement it. A feature the
// corpus calls unavailable must not have a working guest-facing path.

/** Guest-facing implementation paths, per feature key we can check cheaply. */
const SHIPPED_EVIDENCE: Record<string, string[]> = {
  "tables-and-seating": [
    join("src", "app", "(public)", "_reserve", "reserve-actions.ts"),
    join("src", "lib", "reservations", "forfeiture.ts"),
  ],
};

test("nothing the corpus calls unavailable has a live guest path", () => {
  const roadmap = buildGuestCorpus("en")
    .filter((e) => e.purpose.startsWith(ROADMAP_PREFIX))
    .map((e) => e.slug.replace(/^feature:/, ""));

  for (const [key, paths] of Object.entries(SHIPPED_EVIDENCE)) {
    const shipped = paths.every((p) => existsSync(join(process.cwd(), p)));
    if (!shipped) continue;
    assert.ok(
      !roadmap.includes(key),
      `${key} has a working guest path (${paths.join(", ")}) but the assistant tells visitors it is not available yet`,
    );
  }
});

test("the roadmap prefix still applies to something, so this is not vacuously green", () => {
  // If every feature were marked live, the test above would pass while the
  // assistant oversold everything. Ticketing is genuinely unshipped — it waits
  // on an `admissions` table that does not exist in production.
  const roadmap = buildGuestCorpus("en").filter((e) => e.purpose.startsWith(ROADMAP_PREFIX));
  assert.ok(roadmap.length > 0, "no feature is marked unavailable; the roadmap guard is inert");
});

test("reservations reach a guest asking about them", () => {
  const entry = buildGuestCorpus("en").find((e) => e.slug === "feature:tables-and-seating");
  assert.ok(entry, "reservations are not in the guest corpus at all");
  assert.doesNotMatch(entry.purpose, /not yet available/i);
});

// THE ROADMAP PREFIX IS NOT THE ONLY PLACE A FEATURE CAN BE DENIED.
//
// Flipping the status flag removed the prefix and the assistant went on telling
// restaurant owners that reservations were "on the roadmap, not live yet, join
// the waitlist" — because the feature's own FAQ still said so in prose, and the
// corpus feeds FAQ bodies into grounding whatever the flag says. The first
// version of this test read only `purpose`, so it passed while the answer a real
// guest received was still wrong.
//
// A model quotes the sentence, not the flag. So check the sentences.
const DENIALS_EN = /not (yet )?(shipped|live|available)|on (our|the) roadmap|join the waitlist|coming soon/i;
const DENIALS_ES = /todav[ií]a no|a[úu]n no|en la hoja de ruta|lista de espera|pr[óo]ximamente/i;

for (const [locale, pattern] of [["en", DENIALS_EN], ["es", DENIALS_ES]] as const) {
  test(`no ${locale} grounding text denies a shipped feature`, () => {
    for (const entry of buildGuestCorpus(locale)) {
      const key = entry.slug.replace(/^feature:/, "");
      if (!SHIPPED_EVIDENCE[key]) continue;
      const shipped = SHIPPED_EVIDENCE[key].every((rel) => existsSync(join(process.cwd(), rel)));
      if (!shipped) continue;
      const prose = [entry.purpose, ...entry.youCanHere, ...entry.faqs.flatMap((f) => [f.q, f.a])];
      const offender = prose.find((line) => pattern.test(line));
      assert.equal(
        offender,
        undefined,
        `${key} is shipped, but its ${locale} grounding still tells a guest: "${offender}"`,
      );
    }
  });
}
