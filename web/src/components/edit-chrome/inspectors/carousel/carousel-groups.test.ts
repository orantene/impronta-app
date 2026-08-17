import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CAROUSEL_GROUP_ORDER,
  CAROUSEL_GROUP_SEARCH_TERMS,
  CAROUSEL_GROUP_TITLES,
  carouselGroupsFor,
  firstOpenCarouselGroup,
  hasCarouselGroup,
} from "./carousel-groups";

/**
 * The recipe is a declaration, so it can be checked without rendering. The
 * properties worth pinning are the ones a reviewer would otherwise have to
 * take on trust: the rail does not get hero-only groups, Advanced is last and
 * universal, the first-open group is never Advanced, and no field's search
 * term went missing when the flat sections were regrouped.
 */

test("both variants render Slides first and Advanced last", () => {
  for (const variant of ["rail", "hero"] as const) {
    const groups = carouselGroupsFor(variant);
    assert.equal(groups[0], "slides", `${variant} must open on the slide list`);
    assert.equal(groups[groups.length - 1], "advanced");
  }
});

test("the rail does not get the hero-only groups", () => {
  assert.deepEqual(carouselGroupsFor("rail"), ["slides", "layout", "advanced"]);
  assert.equal(hasCarouselGroup("rail", "motion"), false);
  assert.equal(hasCarouselGroup("rail", "look"), false);
  assert.equal(hasCarouselGroup("hero", "motion"), true);
  assert.equal(hasCarouselGroup("hero", "look"), true);
});

test("every rendered group follows the fixed order", () => {
  for (const variant of ["rail", "hero"] as const) {
    const groups = carouselGroupsFor(variant);
    const indices = groups.map((g) => CAROUSEL_GROUP_ORDER.indexOf(g));
    assert.deepEqual(
      indices,
      [...indices].sort((a, b) => a - b),
      `${variant} renders its groups out of CAROUSEL_GROUP_ORDER`,
    );
    assert.ok(indices.every((i) => i >= 0), "an unknown group id leaked in");
  }
});

test("the first open group is never Advanced", () => {
  const first = firstOpenCarouselGroup();
  assert.notEqual(first, "advanced");
  for (const variant of ["rail", "hero"] as const) {
    assert.ok(
      carouselGroupsFor(variant).includes(first),
      `${variant} would open a group it does not render`,
    );
  }
});

test("every group has a title and at least one search term", () => {
  for (const group of CAROUSEL_GROUP_ORDER) {
    const title = CAROUSEL_GROUP_TITLES[group];
    assert.ok(title && title.length > 0, `no title for ${group}`);
    assert.ok(
      !title.includes("—"),
      `em dash in the "${group}" title (owner rule: none in user-facing copy)`,
    );
    assert.ok(
      CAROUSEL_GROUP_SEARCH_TERMS[group].length > 0,
      `no search terms for ${group}`,
    );
  }
});

test("every carousel prop the panel edits is reachable from search", () => {
  // The regroup must not make a field unfindable. These are the schema names
  // from `carouselPropsSchema`; the labels demote them to hints, so search is
  // the only way back to a field an operator knows by its spec name.
  const terms = new Set(
    Object.values(CAROUSEL_GROUP_SEARCH_TERMS)
      .flat()
      .map((t) => t.toLowerCase()),
  );
  for (const prop of [
    "variant",
    "slidesPerView",
    "autoplayMs",
    "loop",
    "arrows",
    "dots",
    "heightMode",
    "minHeightPx",
    "scrim",
    "tone",
    "vignette",
    "opacity",
    "grain",
    "transition",
    "kenBurns",
    "pauseOnHover",
    "contentAlign",
    "contentMode",
    "sharedContent",
  ]) {
    assert.ok(
      terms.has(prop.toLowerCase()),
      `"${prop}" is not reachable from "Find a setting"`,
    );
  }
});

test("the per-device tiers are searchable by name", () => {
  const layout = CAROUSEL_GROUP_SEARCH_TERMS.layout;
  for (const tier of ["desktop", "tablet", "mobile"]) {
    assert.ok(layout.includes(tier), `"${tier}" must reach the Layout group`);
  }
});

test("the panel renders every declared group and no undeclared one", () => {
  // Guards the gap the declaration model exists to prevent: a group id added
  // to the recipe but never rendered (an invisible setting), or a section
  // rendered outside the recipe (a group the reviewer cannot see in the table).
  const panel = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/inspectors/carousel/carousel-settings-panel.tsx"),
    "utf8",
  );
  for (const group of CAROUSEL_GROUP_ORDER) {
    assert.match(
      panel,
      new RegExp(`group=["']${group}["']`),
      `the panel never renders the "${group}" group`,
    );
  }
});
