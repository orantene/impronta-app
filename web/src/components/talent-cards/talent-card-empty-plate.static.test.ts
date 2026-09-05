import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * J9 guard — "the card with no photo". Rule 04 of the Creative Direction canvas
 * is "no monogram, no initials, no icon, no silhouette", and a rule enforced by
 * ABSENCE is exactly the kind that regresses unwatched.
 *
 * WHY THIS COVERS TWO CARDS AND NOT THE ONE J9 NAMED. Before this change two
 * siblings had two different no-photo states:
 *
 *   TalentCard          a line-art person silhouette
 *   FeaturedTalentCard  the talent's NAME set large, under a comment reading
 *                       "Matches the canonical <TalentCard> fallback"
 *
 * The comment was false and nothing checked it. A fix applied to the card J9
 * named would have left the other one untouched and still wrong. So the
 * assertion is not "TalentCard looks right" — it is that EVERY card that can
 * render without a photo routes through the single shared plate.
 *
 * Source-text invariants, matching the sibling keystone guard: the rule is
 * about what these components may CONTAIN, and a render test would pass just as
 * happily with a silhouette added back beside the plate. Dependency-free so it
 * gates in the existing tsx `--test` lane with no jsdom / next-image runtime.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..");

const CARDS_THAT_CAN_LACK_A_PHOTO = [
  ["TalentCard", join(here, "TalentCard.tsx")],
  [
    "FeaturedTalentCard",
    join(
      SRC,
      "lib",
      "site-admin",
      "sections",
      "featured_talent",
      "FeaturedTalentCard.tsx",
    ),
  ],
] as const;

const PLATE = join(here, "talent-card-empty-plate.tsx");

/** Strip comments so prose ABOUT a silhouette never trips the guard. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const plateSrc = code(PLATE);

test("J9: every photoless card routes through the one plate", () => {
  for (const [name, file] of CARDS_THAT_CAN_LACK_A_PHOTO) {
    assert.match(
      code(file),
      /TalentCardEmptyPlate/,
      `${name} must render the shared empty plate`,
    );
  }
});

test("J9 rule 04: no monogram, initials, icon or silhouette", () => {
  for (const [name, file] of [
    ...CARDS_THAT_CAN_LACK_A_PHOTO,
    ["the plate", PLATE] as const,
  ]) {
    const src = code(file);
    assert.doesNotMatch(
      src,
      /data-card-monogram/,
      `${name} must not tag a monogram`,
    );
    // The old silhouette was an inline <svg> built from a <circle> head plus a
    // body path, in the no-photo branch.
    assert.doesNotMatch(
      src,
      /<svg[\s\S]{0,400}?<circle/,
      `${name} must not draw a figure for a missing photo`,
    );
  }
});

test("J9 rule 01: a gradient off a tenant token, never a flat fill or black", () => {
  assert.match(plateSrc, /linear-gradient/);
  // Mixed off the tenant's own surface token so a published Card Design
  // repaints this state along with everything else.
  assert.match(plateSrc, /TALENT_CARD_VARS\.surface/);
  // A bare black background is the defect itself — indistinguishable from a
  // failed image load. `#000` may appear only inside a color-mix that darkens
  // the tenant's surface, never as a standalone background value.
  assert.doesNotMatch(
    plateSrc,
    /background(?:Color)?:\s*["'`]?\s*(#000|#000000|black)\b/i,
    "the plate must never set a bare black ground",
  );
});

test("J9 rule 02: the discipline is the image, capped at two lines", () => {
  assert.match(plateSrc, /discipline/);
  assert.match(plateSrc, /WebkitLineClamp:\s*2/);
  // The tenant's display face, not a hardcoded family.
  assert.match(plateSrc, /--token-typography-heading-font-family/);
});

test("J9 rule 03: an inset hairline in the tenant accent", () => {
  assert.match(plateSrc, /--token-color-accent/);
  assert.match(plateSrc, /inset-\[/);
});

test("J9 rule 05: the plate fills the photo box, it does not restate its metrics", () => {
  // Identical footprint has to come from occupying the SAME aspect-ratio
  // wrapper a photo fills. A plate declaring its own aspect-ratio could drift
  // from the photo card the moment either value changed.
  assert.match(plateSrc, /absolute inset-0/);
  assert.doesNotMatch(plateSrc, /aspectRatio/);
});

test("J9: the plate does not restate the name; the caption already renders it", () => {
  // The canvas mock drew name + location inside the plate because it drew the
  // whole card as one box. Here the caption sits directly below the media and
  // renders both, so printing the name inside would double it on every empty
  // card — which is exactly what the old featured fallback did.
  assert.doesNotMatch(plateSrc, /card\.displayName|data\.name/);
});
