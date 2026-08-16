import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_ROSTER_CARD_BADGES,
  DEFAULT_ROSTER_CARD_TYPE_DISPLAY,
  ROSTER_CARD_BADGE_KEYS,
  ROSTER_CARD_BADGE_META,
  ROSTER_CARD_TYPE_DISPLAYS,
  ROSTER_CARD_TYPE_DISPLAY_META,
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
  "../../components/admin/shell/internal/page-modules/CardDesignStudio-roster.tsx",
);
const categoryBlockSrc = read(
  "../../components/admin/shell/internal/page-modules/roster-card-category-block.tsx",
);
const bridgeSrc = read(
  "../../components/admin/shell/internal/data-bridge.ts",
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
    Object.keys(DEFAULT_ROSTER_CARD_BADGES)
      .filter((key) => key !== "typeDisplay")
      .sort(),
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

test("category-block mode: default is the historical layout", () => {
  assert.equal(
    DEFAULT_ROSTER_CARD_TYPE_DISPLAY,
    "expanded",
    "an existing workspace must see no layout drift on upgrade",
  );
  assert.equal(
    DEFAULT_ROSTER_CARD_BADGES.typeDisplay,
    DEFAULT_ROSTER_CARD_TYPE_DISPLAY,
  );
});

test("category-block mode: normalize accepts known modes, rejects junk", () => {
  for (const mode of ROSTER_CARD_TYPE_DISPLAYS) {
    assert.equal(normalizeRosterCardBadges({ typeDisplay: mode }).typeDisplay, mode);
  }
  assert.equal(
    normalizeRosterCardBadges({ typeDisplay: "sideways" }).typeDisplay,
    DEFAULT_ROSTER_CARD_TYPE_DISPLAY,
    "an unknown mode must fall back to the default, never hide the types",
  );
  assert.equal(
    normalizeRosterCardBadges({ typeDisplay: 3 }).typeDisplay,
    DEFAULT_ROSTER_CARD_TYPE_DISPLAY,
  );
});

test("category-block mode: studio META covers every mode exactly once", () => {
  assert.deepEqual(
    ROSTER_CARD_TYPE_DISPLAY_META.map((m) => m.value).sort(),
    [...ROSTER_CARD_TYPE_DISPLAYS].sort(),
  );
  for (const meta of ROSTER_CARD_TYPE_DISPLAY_META) {
    assert.ok(meta.label.trim().length > 0, `mode "${meta.value}" needs a label`);
    assert.ok(
      meta.description.trim().length > 0,
      `mode "${meta.value}" needs a description`,
    );
  }
});

test("category-block mode is wired end to end (action → card → row → studio)", () => {
  assert.match(
    actionSrc,
    /typeDisplay:\s*z\.enum\(ROSTER_CARD_TYPE_DISPLAYS\)\.optional\(\)/,
    "setRosterCardBadges must persist the layout mode",
  );
  assert.match(
    categoryBlockSrc,
    /typeDisplay !== "expanded"/,
    "the card's category block must branch on the mode",
  );
  assert.match(
    categoryBlockSrc,
    /typeDisplay === "parent_first"/,
    "`parent_first` must be what turns the expander on",
  );
  assert.match(cardSrc, /rosterCardBadges\.typeDisplay/);
  assert.match(rowSrc, /rosterCardBadges\.typeDisplay/);
  assert.match(studioSrc, /ROSTER_CARD_TYPE_DISPLAY_META\.map/);
  assert.match(previewSrc, /badges\.typeDisplay/);
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

test("the card shows EVERY parent, not just the primary type's", () => {
  // The regression this pins: reading `taxonomyView.parentLabel` (the primary
  // type's bucket) as the ONLY anchor hid every other parent a talent spans.
  assert.match(
    categoryBlockSrc,
    /parentLabels/,
    "the strip must render the full parent list, not a single parentLabel",
  );
  assert.match(
    categoryBlockSrc,
    /groups\.map/,
    "the expansion must iterate the parent groups",
  );
  assert.match(
    bridgeSrc,
    /parentCategoryOf\(term\.parent_id, categoryById\)/,
    "the bridge must resolve a parent for EVERY role term, not just the primary",
  );
});

test("the primary type is starred and unsupported types are flagged", () => {
  assert.match(categoryBlockSrc, /type\.isPrimary/, "primary must be marked");
  assert.match(categoryBlockSrc, /★/, "the primary mark is a star");
  assert.match(
    categoryBlockSrc,
    /UNSUPPORTED_CHIP_CLASS/,
    "a type the workspace disabled needs its own dimmed treatment",
  );
  assert.match(
    categoryBlockSrc,
    /unsupportedTooltip/,
    "the dimmed chip must explain itself on hover",
  );
  assert.match(
    bridgeSrc,
    /agency_taxonomy_settings/,
    "support comes from the tenant's taxonomy enablement overlay",
  );
  assert.match(
    bridgeSrc,
    /supported: term\.id \? !disabledTermIds\.has\(term\.id\) : true/,
    "missing overlay row (or a term with no id) = enabled; never dim on missing data",
  );
});
