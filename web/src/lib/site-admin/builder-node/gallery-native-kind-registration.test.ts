import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ADD_GALLERY_AVAILABLE_ITEMS } from "@/lib/site-admin/add-gallery/registry-catalog";

import { BUILDER_NODE_REGISTRY } from "./registry";
import { createBuilderNode } from "./create";
import { builderNodeKindAllowedAtRoot } from "./drop-policy";
import {
  elementLibraryCategoryForKind,
  elementLibrarySearchExtraTerms,
  SHIPPED_ELEMENT_INSERT_KINDS,
} from "./mvp-allow-list";
import { renderBuilderNodes } from "./render";
import type { BuilderNodeKind } from "./types";

/**
 * EVERY native kind the Add gallery offers must be registered EVERYWHERE.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `reserve_table` was written, complete and callable — island, server action,
 * row-locked booking — and registered NOWHERE. It could not be inserted,
 * dropped, created, rendered or edited. The registration set for a native block
 * spans ten touch points across seven files, and the existing wiring guard
 * covers only the twelve BUILDER 2027 P2A kinds by name, so a NEW block gets no
 * coverage at all.
 *
 * That is the repo's most-repeated defect in its purest form: a capability
 * wired at some layers and not others, where every individual test is green and
 * the feature simply does not exist. `menu_board` was registered at all ten;
 * `reserve_table` was at zero; and three successive scopes of the work each
 * missed a different subset.
 *
 * WHY IT IS DRIVEN BY THE GALLERY
 * ───────────────────────────────
 * The gallery entry is the operator's actual door in — if a block is offered
 * there, every downstream layer must be able to honour the insert. Driving from
 * the gallery means a NEW block is covered the moment someone makes it
 * reachable, with nobody having to remember to add it to a list in this file.
 * A block deliberately not offered in the gallery is simply not asserted here.
 */

/**
 * The CONNECTED native blocks — gallery entries that insert a native node AND
 * declare `sourceType: "native-freeform"`, i.e. whole page bands backed by
 * workspace data (`menu_board`, `reserve_table`, the roster bands).
 *
 * Deliberately NOT every gallery `nativeKind`. Layout primitives reach the
 * gallery too, and they legitimately break two of the assertions below —
 * `button` is not droppable at the page root by design, and `section` renders
 * its own wrapper rather than a kind-stamped div. Asserting over them would
 * make this guard fire on correct code, which is how a guard gets weakened or
 * deleted rather than fixed.
 */
const GALLERY_NATIVE_KINDS: BuilderNodeKind[] = [
  ...new Set(
    ADD_GALLERY_AVAILABLE_ITEMS.flatMap((item) => {
      // `connectedSource` is the discriminator, NOT `sourceType`: the latter is
      // "native-freeform" on every item including `paragraph`, so filtering on
      // it selects the whole gallery. Only a CONNECTED block names the
      // workspace surface it reads from.
      const it = item as { nativeKind?: unknown; connectedSource?: unknown };
      return typeof it.nativeKind === "string" && it.connectedSource
        ? [it.nativeKind as BuilderNodeKind]
        : [];
    }),
  ),
].sort();

test("the gallery offers at least one native kind (the guard is not vacuous)", () => {
  // Without this, a refactor renaming `nativeKind` would empty the list and
  // every assertion below would pass by iterating nothing — the exact shape of
  // a guard that is green because it measures nothing.
  assert.ok(
    GALLERY_NATIVE_KINDS.length >= 3,
    `expected several native gallery kinds, found ${GALLERY_NATIVE_KINDS.length}`,
  );
  assert.ok(
    GALLERY_NATIVE_KINDS.includes("reserve_table" as BuilderNodeKind),
    "reserve_table must be reachable from the Add gallery — that is how an operator adds it",
  );
});

test("every native gallery kind has a registry descriptor", () => {
  for (const kind of GALLERY_NATIVE_KINDS) {
    assert.ok(
      BUILDER_NODE_REGISTRY[kind],
      `${kind} is offered in the gallery but has no registry descriptor — insert produces an invalid node`,
    );
    assert.ok(
      BUILDER_NODE_REGISTRY[kind]?.propsSchema,
      `${kind} has no propsSchema — publish would strip every authored prop`,
    );
  }
});

test("every native gallery kind can actually be created", () => {
  for (const kind of GALLERY_NATIVE_KINDS) {
    const node = createBuilderNode(kind);
    assert.ok(node, `createBuilderNode("${kind}") returned nothing — Insert cannot make a valid node`);
    assert.equal(node.kind, kind);
    // The factory's defaults must satisfy the block's own publish schema, or
    // the very first save strips them and the block reverts to bare.
    const parsed = BUILDER_NODE_REGISTRY[kind]?.propsSchema?.safeParse(node.props);
    assert.ok(
      parsed?.success,
      `${kind}'s default props do not satisfy its own propsSchema: ${parsed?.success === false ? JSON.stringify(parsed.error.issues) : "(no schema)"}`,
    );
  }
});

test("every native gallery kind is droppable at the page root", () => {
  for (const kind of GALLERY_NATIVE_KINDS) {
    assert.ok(
      builderNodeKindAllowedAtRoot(kind),
      `${kind} cannot be dropped at the page root — it is offered but undroppable`,
    );
  }
});

test("every native gallery kind survives the MVP insertable filter", () => {
  // THREE separate entries, and missing any one filters the block out of the
  // picker while leaving every other test green.
  for (const kind of GALLERY_NATIVE_KINDS) {
    assert.ok(
      elementLibraryCategoryForKind(kind),
      `${kind} has no element-library category — filtered out of the insertable set`,
    );
    assert.ok(
      elementLibrarySearchExtraTerms(kind),
      `${kind} has no search terms — unfindable in the picker`,
    );
    assert.ok(
      SHIPPED_ELEMENT_INSERT_KINDS.includes(kind),
      `${kind} is not in the shipped insert list — hidden from the picker`,
    );
  }
});

test("every native gallery kind RENDERS something on a published page", () => {
  // The dangerous one. A kind registered everywhere EXCEPT render.tsx places in
  // the builder and publishes an empty page — which reads as "the feature was
  // never built" rather than "it was mis-registered".
  for (const kind of GALLERY_NATIVE_KINDS) {
    const node = createBuilderNode(kind);
    const html = renderToStaticMarkup(
      createElement("div", null, renderBuilderNodes([node], { mode: "freeform" })),
    );
    assert.match(
      html,
      new RegExp(`data-builder-node-kind="${kind}"`),
      `${kind} produced no markup carrying its own kind — it would publish as nothing`,
    );
  }
});
