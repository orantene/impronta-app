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

test("an invalid design tree no longer renders NOTHING: the resolver serves it without the invalid node", () => {
  // The end-to-end proof of the mechanism, kept honest through its change.
  //
  // UNTIL 2026-09-05: `resolveSnapshotBuilderTree` validated `snapshot.builderTree`
  // and, on failure, returned `source: "legacy_slots"` built from `slots`. The
  // page-less fallback builds its snapshot with `slots: []`, so ONE invalid
  // node anywhere resolved to ZERO nodes: a header, a footer and nothing
  // between, with no error anywhere. Three live restaurant pages served
  // exactly that in one day (#1752, an invalid token write, #1817).
  //
  // NOW: the resolver drops the nodes the validator named, re-validates, and
  // serves the remainder with `salvaged: true` and the issues attached. The
  // blank outcome is reserved for a tree with nothing valid left. This test
  // pins the new contract with the same structural violation as before
  // (duplicate ids, which no allow-list can bless), so it is the mechanism
  // under test, not the symptom.
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

  assert.equal(resolved.source, "snapshot_builder_tree", "one invalid node must not send the page to the empty slot list");
  assert.equal(resolved.salvaged, true);
  assert.ok(resolved.issues.length > 0, "the failure must still be reported");
  const root = resolved.tree[0] as { children?: Array<{ props: { text: string } }> };
  assert.equal(root.children?.length, 1, "the offending duplicate is dropped, its valid sibling stays");
  assert.equal(root.children?.[0]?.props.text, "one");

  // The fail-safe in resolvePresetDesignTree still refuses a design that does
  // not validate; that guard is upstream of this resolver and unchanged.
});

