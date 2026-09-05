import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getPageDesign } from "@/lib/site-admin/builder-node/page-designs";
import { bakePageDesignTree } from "@/lib/site-admin/builder-node/page-designs/expand-repeaters";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import { INDUSTRY_PRESETS } from "@/lib/words/presets";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

/**
 * A RESOLVER TEST IS NOT A RENDER TEST.
 *
 * The page-less fallback shipped with tests proving the resolver returned a
 * tree. A live restaurant then served a header, a footer and a 427-character
 * `<main>` containing nothing — because "returned a tree" and "that tree
 * renders" are different claims, and only the first was ever asserted.
 *
 * This file asserts the second, through the SAME pipeline the fallback uses:
 *
 *   preset.designId → getPageDesign → bakePageDesignTree
 *     → snapshot { builderTree, slots: [] } → resolveSnapshotBuilderTree
 *     → renderBuilderNodes → markup
 *
 * The step that was missing is the bake. `page-design-bake-action.ts` routes
 * every design through it before a tree reaches a snapshot; the fallback handed
 * `design.tree` over raw and dropped `design.dataSources`. An unexpanded
 * repeater is not the content it stands for, and un-reminted ids collide.
 *
 * The `slots: []` detail is what turns any of that into a BLANK page rather
 * than a loud failure: when validation fails, `resolveSnapshotBuilderTree`
 * falls back to a tree built from `slots`, and the fallback's snapshot has
 * none. So the failure mode of every mistake in this path is silence.
 */

/** The fallback's pipeline, end to end, minus the database read. */
function renderPresetHomepage(designId: string): string {
  const design = getPageDesign(designId);
  assert.ok(design, `no design registered for "${designId}"`);

  const baked = bakePageDesignTree(design.tree, design.dataSources);
  const resolved = resolveSnapshotBuilderTree({
    builderTree: baked as BuilderNodeTree,
    slots: [],
  } as never);

  return renderToStaticMarkup(
    createElement(
      "main",
      null,
      renderBuilderNodes(resolved.tree, { mode: "freeform" }),
    ),
  );
}

test("a restaurant preset's homepage renders a real body, not an empty main", () => {
  const restaurant = INDUSTRY_PRESETS.find(
    (preset) => preset.designId === "restaurant-orderable",
  );
  assert.ok(restaurant, "no preset resolves to restaurant-orderable");

  const html = renderPresetHomepage(restaurant.designId!);

  // The observable symptom was a `<main>` of 427 characters with no builder
  // nodes in it. Assert the positive: nodes exist, and the one that makes this
  // design a RESTAURANT is among them.
  assert.ok(
    html.length > 2000,
    `main rendered only ${html.length} characters — this is the blank-page shape`,
  );
  assert.match(
    html,
    /data-builder-node-kind="menu_board"/,
    "the restaurant design rendered without its menu board",
  );
});

test("every preset-owned design renders SOMETHING through the fallback pipeline", () => {
  // Driven off the presets rather than a list, so a new preset is covered the
  // moment it names a design — the same reason the registration guards derive
  // from the gallery instead of hardcoding kinds.
  const blank: string[] = [];

  for (const preset of INDUSTRY_PRESETS) {
    const designId = preset.designId;
    if (!designId) continue; // `custom` carries none, by ruling.
    if (!getPageDesign(designId)) continue; // covered by the dangling-id guard.

    const html = renderPresetHomepage(designId);
    if (!/data-builder-node-kind=/.test(html)) {
      blank.push(`${preset.id ?? designId} → ${designId}`);
    }
  }

  assert.deepEqual(
    blank,
    [],
    "These presets resolve to a design that renders NO builder nodes. A tenant " +
      "with no pages of their own would get a header, a footer and nothing " +
      "between, with no console error to explain it.\n  " +
      blank.join("\n  "),
  );
});

test("the BOOKING DOOR is pinned, so it cannot drop the way the menu did", () => {
  // The menu board was in the design, resolved happily, and rendered NOTHING
  // because the validator dropped it on a child rule. The booking block is the
  // thing a guest actually completes a reservation through, so it gets the same
  // instrument — and this test is written to be honest about today rather than
  // green about nothing.
  //
  // TODAY: `restaurant-orderable` does NOT carry `reserve_table`. The block is
  // registered (all twelve points) and the design has no instance of it. So the
  // assertion below pins ABSENCE, which fails the moment someone adds it —
  // deliberately. Whoever places the block flips this to the presence assertion
  // beneath it in the same commit, and the door is covered from its first day
  // instead of inheriting the menu's failure mode.
  const html = renderPresetHomepage("restaurant-orderable");
  const hasReserve = /data-builder-node-kind="reserve_table"/.test(html);

  assert.equal(
    hasReserve,
    false,
    "`reserve_table` now renders in restaurant-orderable. That is the intended " +
      "end state — so REPLACE this assertion with its opposite:\n" +
      '  assert.match(html, /data-builder-node-kind="reserve_table"/)\n' +
      "which is what stops the booking door silently vanishing the way the " +
      "menu board did.",
  );

  // Whichever way the block goes, the page must not be empty around it.
  assert.match(
    html,
    /data-builder-node-kind="menu_board"/,
    "the restaurant design lost its menu board",
  );
});
