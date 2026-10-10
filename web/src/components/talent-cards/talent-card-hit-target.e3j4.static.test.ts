/**
 * E3-J4 — Directory card: tapping the name only highlights it; only the photo
 * opens the profile. Fix: `select-none` on every TalentCard root so the
 * navigating <Link> keeps the whole tile (including large caption type) as
 * the hit-target.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cardSrc = readFileSync(join(here, "TalentCard.tsx"), "utf8");

test("E3-J4: TalentCard declares CARD_HIT_TARGET as select-none", () => {
  assert.match(
    cardSrc,
    /CARD_HIT_TARGET\s*=\s*"select-none"/,
    "CARD_HIT_TARGET must be Tailwind select-none so name clicks navigate",
  );
});

test("E3-J4: every style root applies CARD_HIT_TARGET", () => {
  const roots = cardSrc.match(
    /\$\{TALENT_CARD_CLASS\} \$\{CARD_HIT_TARGET\}/g,
  ) ?? [];
  assert.ok(
    roots.length >= 4,
    `expected select-none on showcase/editorial/profile/portrait roots; found ${roots.length}`,
  );
});
