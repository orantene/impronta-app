import assert from "node:assert/strict";
import { test } from "node:test";

import { INDUSTRY_PRESETS } from "@/lib/words/presets";

import { PAGE_DESIGNS } from "./index";
import { validateBuilderNodeTree } from "../validate";
import { resolveSnapshotBuilderTree } from "../snapshot-tree";
import type { BuilderNodeTree } from "../types";

/**
 * Every page design must survive `validateBuilderNodeTree`.
 *
 * THE REGRESSION THIS EXISTS TO CATCH, WHICH ALREADY HAPPENED
 * ───────────────────────────────────────────────────────────
 * When the page-less fallback started resolving a tenant's own design, a
 * restaurant's live homepage rendered a header, a footer, and NOTHING in
 * between. Zero console errors. The preset resolved correctly and the tree was
 * returned happily — the RENDERER dropped it, because `restaurant-orderable`
 * nests `menu_board` inside a container and `menu_board` was missing from the
 * container's child allow-list.
 *
 * Three of fourteen designs were invalid and nobody knew, because nothing had
 * ever validated them: the designs are authored by hand, and the paths that
 * consumed them did not run the validator.
 *
 * A blank page is worse than the wrong template. The wrong template at least
 * looks like a website; a blank one looks like an outage.
 *
 * WHY PRESET-OWNED IS THE HARD LINE
 * ─────────────────────────────────
 * A preset-owned design is one the fallback can actually serve to a live
 * tenant, so an invalid one is a live blank page. Designs no preset names are
 * still asserted, but through a known-failing list that must only ever shrink —
 * that keeps `impronta`'s pre-existing duplicate-id visible without blocking a
 * fix for a defect it has nothing to do with.
 */

/** Designs known to be invalid TODAY. This list may shrink, never grow. */
const KNOWN_INVALID: ReadonlyArray<string> = [
  // Duplicate node id "impronta-proc-title". Pre-existing, and NOT preset-owned
  // — so the page-less fallback cannot serve it and no live tenant can reach
  // it this way. Left failing rather than silently patched: it is a real defect
  // in a real design, and whoever fixes it should delete this entry.
  "impronta",
];

const presetOwnedDesignIds = new Set(
  INDUSTRY_PRESETS.map((preset) => preset.designId).filter(
    (id): id is string => Boolean(id),
  ),
);

test("every PRESET-OWNED design validates — an invalid one is a live blank page", () => {
  const broken: string[] = [];

  for (const design of PAGE_DESIGNS) {
    if (!presetOwnedDesignIds.has(design.id)) continue;
    const result = validateBuilderNodeTree(design.tree as BuilderNodeTree);
    if (!result.ok) {
      broken.push(`${design.id}: ${result.issues[0]?.message ?? "unknown"}`);
    }
  }

  assert.deepEqual(
    broken,
    [],
    "A design a preset resolves to does not validate. The renderer will DROP it " +
      "and a tenant with no pages of their own gets a header, a footer and " +
      "nothing in between — with no console error to explain it.\n  " +
      broken.join("\n  "),
  );
});

test("the known-invalid list only shrinks", () => {
  // Guards the exemption itself. Without this, adding an id here would be an
  // ordinary-looking way to silence the test above — which is exactly how a
  // blank-page defect would get shipped a second time.
  const stillBroken = PAGE_DESIGNS.filter(
    (design) => !validateBuilderNodeTree(design.tree as BuilderNodeTree).ok,
  ).map((design) => design.id);

  assert.deepEqual(
    stillBroken.sort(),
    [...KNOWN_INVALID].sort(),
    "The set of invalid designs changed. If you FIXED one, delete it from " +
      "KNOWN_INVALID. If you added a new invalid design, fix the design — do " +
      "not extend the list.",
  );
});

test("no preset points at a design that does not exist", () => {
  // The neighbouring failure mode: a preset naming a designId with no design
  // resolves to nothing, and the fallback silently serves the platform default
  // forever while looking correctly configured.
  const designIds = new Set(PAGE_DESIGNS.map((d) => d.id));
  const dangling = [...presetOwnedDesignIds].filter((id) => !designIds.has(id));
  assert.deepEqual(
    dangling,
    [],
    `preset.designId names a design that does not exist: ${dangling.join(", ")}`,
  );
});

test("an invalid design tree renders NOTHING — why the fail-safe exists", () => {
  // The end-to-end proof of the regression, not just of the guard.
  //
  // `resolveSnapshotBuilderTree` validates `snapshot.builderTree`; when it
  // fails it returns `source: "legacy_slots"` with a tree built from `slots`.
  // The page-less fallback builds its snapshot with `slots: []`, so an invalid
  // tree resolves to ZERO nodes — a header, a footer and nothing between, with
  // no error anywhere. That is precisely what a live restaurant served.
  //
  // Pinned because the earlier guard proves only that we can DETECT an invalid
  // design. This proves what happens if one ever reaches the renderer, which is
  // the reason resolvePresetDesignTree refuses to return one.
  // Duplicate ids, NOT a disallowed child kind. The original defect was
  // `menu_board` under `container` — which this PR makes legal, so using it
  // here would have made this test pass for the wrong reason the moment the fix
  // landed. A structural violation no allow-list can bless keeps the mechanism
  // under test rather than the symptom.
  const invalidTree = [
    {
      id: "root",
      kind: "container" as const,
      props: { layout: "stack" as const },
      children: [
        { id: "dupe", kind: "paragraph" as const, props: { text: "one" } },
        { id: "dupe", kind: "paragraph" as const, props: { text: "two" } },
      ],
    },
  ];

  const resolved = resolveSnapshotBuilderTree({
    builderTree: invalidTree as unknown as BuilderNodeTree,
    slots: [],
  } as never);

  assert.equal(
    resolved.tree.length,
    0,
    "an invalid tree should resolve to nothing — if this is non-zero the blank-page mechanism has changed and the fail-safe needs revisiting",
  );
  assert.ok(
    resolved.issues.length > 0,
    "the resolver should report why it dropped the tree",
  );
});
