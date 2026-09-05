import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ADD_GALLERY_AVAILABLE_ITEMS } from "@/lib/site-admin/add-gallery/registry-catalog";
import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import { isBuilder2027InspectorKind } from "@/lib/site-admin/builder-node/builder-2027-fields";
import type { BuilderNodeKind } from "@/lib/site-admin/builder-node/types";

import { canvasChildSecondaryLabel } from "./canvas-node-child-secondary-label";

/**
 * EDITOR-SIDE half of the connected-native-kind registration guard.
 *
 * The registry / render / drop / insert axes are asserted in
 * `lib/site-admin/builder-node/gallery-native-kind-registration.test.ts`. These
 * two live here because they reach into `components/edit-chrome`, and
 * `lib/site-admin` is not allowed to import it. Splitting was the right answer
 * rather than adding this file to the layering allow-list: the boundary is
 * load-bearing, and a guard is not a good reason to be its exception.
 *
 * Both axes were called out as "silent no matter what — no test will fail on
 * them". Both are pure functions of a node, so both can be asserted.
 */

/** Connected native blocks — the gallery entries that name a workspace source. */
const GALLERY_NATIVE_KINDS: BuilderNodeKind[] = [
  ...new Set(
    ADD_GALLERY_AVAILABLE_ITEMS.flatMap((item) => {
      const it = item as { nativeKind?: unknown; connectedSource?: unknown };
      return typeof it.nativeKind === "string" && it.connectedSource
        ? [it.nativeKind as BuilderNodeKind]
        : [];
    }),
  ),
].sort();

test("the connected-kind list is not empty (the guard is not vacuous)", () => {
  assert.ok(
    GALLERY_NATIVE_KINDS.includes("reserve_table" as BuilderNodeKind),
    "reserve_table must be reachable from the Add gallery",
  );
});

/**
 * The two axes below were called out as UNCATCHABLE — "silent no matter what,
 * needs a manual check because no test will fail on them". They do not have to
 * be. Both are pure functions of a node, so both can be asserted here, which
 * turns two recurring manual checklist items into CI.
 *
 * The layer-tree label is the cheaper one and the more misleading when missing:
 * a block with no case falls through to a generic label, so the layers rail
 * shows a correctly-registered block under a name that tells the operator
 * nothing — it reads as an unfinished feature rather than a missing case.
 */
test("every connected native kind has its own layer-tree label", () => {
  const generic = new Set<string>();
  // Establish what "fell through to the default" looks like by asking for a
  // label for a kind that deliberately has no case of its own.
  generic.add(canvasChildSecondaryLabel(createBuilderNode("container")));

  for (const kind of GALLERY_NATIVE_KINDS) {
    const label = canvasChildSecondaryLabel(createBuilderNode(kind));
    assert.ok(
      label && label.trim().length > 0,
      `${kind} has no layer-tree label`,
    );
    assert.ok(
      !generic.has(label),
      `${kind} falls through to the generic label "${label}" — the layers rail would not name it`,
    );
  }
});

test("every connected native kind has a props panel of its own", () => {
  // A block that places but cannot be configured is half-registered in a way
  // that looks like a broken feature. The inspector is a React component, so
  // rather than rendering the whole editor we assert the file carries an
  // explicit branch for the kind — the same shape the panel dispatch uses.
  const panelSource = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/inspectors/builder-node-content.tsx"),
    "utf8",
  );
  for (const kind of GALLERY_NATIVE_KINDS) {
    // `node.kind === "<kind>"` ONLY. Accepting `case "<kind>"` as an
    // alternative made this assertion pass while the panel branch was
    // disabled, because the SAME FILE carries a label switch with a case per
    // kind — the guard was matching the neighbour, not the subject. Verified
    // by mutation: with the alternative in place, disabling the panel branch
    // did not turn this red.
    // There are TWO real dispatch paths and the guard must model both, or it
    // fires on correct code: a bespoke `node.kind === "<kind>"` branch, OR
    // membership in the shared BUILDER 2027 inspector, which is how the P2A
    // bands (`directory`, `featured_talent`, …) are configured. Asserting only
    // the bespoke shape reported `directory` as unconfigurable when it is not.
    assert.ok(
      panelSource.includes(`node.kind === "${kind}"`) ||
        isBuilder2027InspectorKind(kind),
      `${kind} has neither a props-panel branch nor a BUILDER 2027 inspector entry — it would place but not be configurable`,
    );
  }
});
