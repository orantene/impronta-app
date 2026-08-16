import assert from "node:assert/strict";
import { test } from "node:test";

import { groupChipsByParent } from "./roster-type-groups";

/**
 * Roster category grouping — the rule this file exists to protect:
 *
 *   A talent's types are grouped under EVERY parent category they span.
 *
 * The first cut of the parent-anchored roster card read the parent off the
 * PRIMARY type only, so a talent who is both a Model and a Performer showed
 * as "Models" and the rest of their work silently vanished from the card. On
 * the live Impronta roster that was 11 of 64 talents. These tests pin the
 * grouping, the primary star, and the tenant-support flag against regression.
 *
 * (Tested here rather than through `resolveRosterCardTaxonomy` because that
 * module imports TAXONOMY from `../state` at runtime, which reaches
 * `server-only` and throws under the tsx --test lanes.)
 */

const chip = (
  slug: string,
  labelEn: string,
  parent?: { slug: string; labelEn: string; labelEs?: string },
  supported?: boolean,
) => ({
  slug,
  labelEn,
  ...(parent ? { parent } : {}),
  ...(supported === undefined ? {} : { supported }),
});

const MODELS = { slug: "models", labelEn: "Models" };
const PERFORMERS = { slug: "performers", labelEn: "Performers" };
const CREATORS = { slug: "influencers-creators", labelEn: "Influencers & Creators" };

test("groups types under every parent the talent spans", () => {
  const groups = groupChipsByParent(
    [
      chip("fashion-model", "Fashion Model", MODELS),
      chip("latin-dancer", "Latin Dancer", PERFORMERS),
      chip("beauty-model", "Beauty Model", MODELS),
      chip("ugc-creator", "UGC Creator", CREATORS),
    ],
    "en",
    "fashion-model",
  );

  assert.deepEqual(
    groups.map((g) => g.parentLabel),
    ["Models", "Performers", "Influencers & Creators"],
    "primary's parent leads; the rest keep first-seen order",
  );
  assert.deepEqual(
    groups.map((g) => g.types.map((t) => t.label)),
    [["Fashion Model", "Beauty Model"], ["Latin Dancer"], ["UGC Creator"]],
  );
  assert.equal(
    groups.flatMap((g) => g.types).length,
    4,
    "every type the talent holds must survive the grouping",
  );
});

test("each parent carries its emoji anchor", () => {
  const groups = groupChipsByParent(
    [chip("fashion-model", "Fashion Model", MODELS), chip("latin-dancer", "Latin Dancer", PERFORMERS)],
    "en",
    "fashion-model",
  );
  assert.equal(groups[0]?.parentEmoji, "\u{1F464}");
  assert.equal(groups[1]?.parentEmoji, "\u2728");
});

test("exactly one type carries the primary star", () => {
  const groups = groupChipsByParent(
    [
      chip("fashion-model", "Fashion Model", MODELS),
      chip("latin-dancer", "Latin Dancer", PERFORMERS),
    ],
    "en",
    "fashion-model",
  );
  const primaries = groups.flatMap((g) => g.types).filter((t) => t.isPrimary);
  assert.equal(primaries.length, 1);
  assert.equal(primaries[0]?.label, "Fashion Model");
  assert.deepEqual(
    groups.map((g) => g.hasPrimary),
    [true, false],
  );
});

test("no primary slug → no star anywhere (never guess one)", () => {
  const groups = groupChipsByParent([chip("latin-dancer", "Latin Dancer", PERFORMERS)], "en", undefined);
  assert.equal(groups.flatMap((g) => g.types).filter((t) => t.isPrimary).length, 0);
});

test("a type the workspace disabled is kept, flagged unsupported", () => {
  const groups = groupChipsByParent(
    [
      chip("fashion-model", "Fashion Model", MODELS, true),
      chip("fire-performer", "Fire Performer", PERFORMERS, false),
    ],
    "en",
    "fashion-model",
  );
  const all = groups.flatMap((g) => g.types);
  assert.equal(all.length, 2, "an unsupported type is dimmed, never dropped");
  assert.equal(all.find((t) => t.label === "Fire Performer")?.supported, false);
  assert.equal(all.find((t) => t.label === "Fashion Model")?.supported, true);
});

test("a chip with no support flag is treated as supported", () => {
  const groups = groupChipsByParent([chip("fashion-model", "Fashion Model", MODELS)], "en", "fashion-model");
  assert.equal(groups[0]?.types[0]?.supported, true);
});

test("a type whose parent can't be resolved lands in a trailing group", () => {
  const groups = groupChipsByParent(
    [chip("fashion-model", "Fashion Model", MODELS), chip("mystery-type", "Mystery Type")],
    "en",
    "fashion-model",
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[1]?.parentId, null, "ungrouped bucket sorts last");
  assert.equal(groups[1]?.types[0]?.label, "Mystery Type");
});

test("Spanish labels win when the locale is es", () => {
  const groups = groupChipsByParent(
    [
      {
        slug: "fashion-model",
        labelEn: "Fashion Model",
        labelEs: "Modelo de moda",
        parent: { slug: "models", labelEn: "Models", labelEs: "Modelos" },
      },
    ],
    "es",
    "fashion-model",
  );
  assert.equal(groups[0]?.parentLabel, "Modelos");
  assert.equal(groups[0]?.types[0]?.label, "Modelo de moda");
});

test("no chips at all yields no groups (card renders its empty state)", () => {
  assert.deepEqual(groupChipsByParent([], "en", undefined), []);
});
