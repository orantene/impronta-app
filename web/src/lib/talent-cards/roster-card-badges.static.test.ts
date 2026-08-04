import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ROSTER_CARD_BADGES,
  ROSTER_CARD_BADGE_KEYS,
  ROSTER_CARD_BADGE_META,
  normalizeRosterCardBadges,
} from "./roster-card-badges";

/**
 * Roster-card badge SYNC contract — every configurable roster-card overlay
 * must stay wired through the whole loop:
 *
 *   ROSTER_CARD_BADGE_KEYS (this module)
 *     → setRosterCardBadges zod schema (persistence)
 *     → roster card + row gating (TalentPage-2 / TalentPage-3)
 *     → Card Design studio panel (iterates META)
 *     → studio Roster preview card (CardDesignStudio-4)
 *
 * A key added to the roster card WITHOUT its studio toggle / preview /
 * persistence wiring is exactly the drift this file exists to catch. The
 * cross-file checks are source-text invariants (keystone-test pattern) so the
 * suite stays dependency-free in the tsx --test lane.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const actionSrc = read("../server-actions/admin-roster-card-badges.ts");
const cardSrc = read(
  "../../components/admin/shell/internal/page-modules/TalentPage-2.tsx",
);
const rowSrc = read(
  "../../components/admin/shell/internal/page-modules/TalentPage-3.tsx",
);
const studioSrc = read(
  "../../components/admin/shell/internal/page-modules/CardDesignStudio.tsx",
);
const previewSrc = read(
  "../../components/admin/shell/internal/page-modules/CardDesignStudio-4.tsx",
);

test("badge key list includes the category block + quick view", () => {
  for (const key of ["categories", "quickView"]) {
    assert.ok(
      (ROSTER_CARD_BADGE_KEYS as readonly string[]).includes(key),
      `ROSTER_CARD_BADGE_KEYS must include "${key}"`,
    );
  }
});

test("every badge key ships a default (all visible)", () => {
  assert.deepEqual(
    Object.keys(DEFAULT_ROSTER_CARD_BADGES).sort(),
    [...ROSTER_CARD_BADGE_KEYS].sort(),
    "DEFAULT_ROSTER_CARD_BADGES must cover exactly the key list",
  );
  for (const key of ROSTER_CARD_BADGE_KEYS) {
    assert.equal(
      DEFAULT_ROSTER_CARD_BADGES[key],
      true,
      `default for "${key}" must be visible`,
    );
  }
});

test("studio META covers every key exactly once (panel iterates META)", () => {
  assert.deepEqual(
    ROSTER_CARD_BADGE_META.map((m) => m.key).sort(),
    [...ROSTER_CARD_BADGE_KEYS].sort(),
    "ROSTER_CARD_BADGE_META must list every badge key exactly once",
  );
  for (const meta of ROSTER_CARD_BADGE_META) {
    assert.ok(meta.label.trim().length > 0, `META "${meta.key}" needs a label`);
    assert.ok(
      meta.description.trim().length > 0,
      `META "${meta.key}" needs a description`,
    );
  }
});

test("normalize fills defaults, applies booleans, drops junk", () => {
  const normalized = normalizeRosterCardBadges({
    categories: false,
    quickView: false,
    visibility: "nope",
    unknownKey: false,
  });
  assert.equal(normalized.categories, false);
  assert.equal(normalized.quickView, false);
  assert.equal(normalized.visibility, true, "non-boolean input must not hide a badge");
  assert.ok(!("unknownKey" in normalized), "unknown keys are dropped");
  assert.deepEqual(normalizeRosterCardBadges(null), DEFAULT_ROSTER_CARD_BADGES);
});

test("persistence schema accepts every badge key (server action)", () => {
  for (const key of ROSTER_CARD_BADGE_KEYS) {
    assert.match(
      actionSrc,
      new RegExp(`${key}:\\s*z\\.boolean\\(\\)\\.optional\\(\\)`),
      `setRosterCardBadges zod schema must accept "${key}"`,
    );
  }
});

test("roster card + row gate the category block and quick view", () => {
  assert.match(cardSrc, /rosterCardBadges\.categories/);
  assert.match(cardSrc, /rosterCardBadges\.quickView/);
  assert.match(cardSrc, /RosterQuickViewButton/);
  assert.match(rowSrc, /rosterCardBadges\.categories/);
  assert.match(rowSrc, /rosterCardBadges\.quickView/);
});

test("studio panel iterates META; preview reacts to the new toggles", () => {
  assert.match(
    studioSrc,
    /ROSTER_CARD_BADGE_META\.map/,
    "studio panel must iterate META so new keys surface automatically",
  );
  assert.match(previewSrc, /badges\.categories/);
  assert.match(previewSrc, /badges\.quickView/);
});
