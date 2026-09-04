import { test } from "node:test";
import assert from "node:assert/strict";

import { PAGE_DESIGNS } from "./index";
import { normalizeAnchorId } from "../anchor-id";
import type { BuilderNode } from "../types";

/**
 * C11 — every in-page anchor a page design ships must actually resolve.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * ──────────────────────────────
 * `restaurant-orderable`'s primary button said "Browse the menu" and pointed at
 * `#menu`. The renderer emitted `data-builder-node-id` on every node and never a
 * DOM `id`, so nothing in the tree resolved a hash href and that button did
 * nothing — on the design the signup picker hands every restaurant-shaped
 * tenant. It shipped that way and was found by a human clicking it, because no
 * test asserted that a design's own links go anywhere.
 *
 * A dead primary button on a new tenant's homepage is close to the worst
 * possible first impression, and it is invisible to every check that only looks
 * at whether the page renders. This test closes that.
 *
 * WHY THIS SHAPE
 * ──────────────
 * It walks the REAL exported designs rather than a fixture, so a new design
 * with an inert anchor fails the moment it is added. It asserts the pairing
 * (href → a node carrying that anchorId) rather than pinning specific strings,
 * so renaming a section is free and only BREAKING the link is a failure.
 */

function walk(nodes: readonly BuilderNode[], visit: (n: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    const kids = (node as { children?: readonly BuilderNode[] }).children;
    if (Array.isArray(kids)) walk(kids, visit);
  }
}

/** Every `#fragment` referenced by any href-bearing prop in a design. */
function hashHrefsIn(nodes: readonly BuilderNode[]): string[] {
  const found: string[] = [];
  const scan = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("#") && value.length > 1) found.push(value.slice(1));
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) scan(v);
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        // Only href-ish keys. A style value like "#1a0f09" is a COLOUR, and
        // treating it as a broken anchor would make this test fire on every
        // design that has a hex colour in it — which is all of them.
        if (/href|link|url|to$/i.test(k)) scan(v);
        else if (v && typeof v === "object") scan(v);
      }
    }
  };
  walk(nodes, (n) => scan(n.props));
  return [...new Set(found)];
}

/** Every anchor id a design's nodes actually expose to the DOM. */
function anchorsIn(nodes: readonly BuilderNode[]): Set<string> {
  const ids = new Set<string>();
  walk(nodes, (n) => {
    const fromBase = normalizeAnchorId((n as { anchorId?: unknown }).anchorId);
    if (fromBase) ids.add(fromBase);
    const props = n.props as Record<string, unknown> | undefined;
    const fromProps = normalizeAnchorId(props?.anchorId);
    if (fromProps) ids.add(fromProps);
  });
  return ids;
}

test("every hash href in every page design resolves to a real anchor", () => {
  const broken: string[] = [];

  for (const design of PAGE_DESIGNS) {
    const nodes = design.tree as readonly BuilderNode[];
    if (!Array.isArray(nodes)) continue;

    const anchors = anchorsIn(nodes);
    for (const href of hashHrefsIn(nodes)) {
      const target = normalizeAnchorId(href);
      if (!target || !anchors.has(target)) {
        broken.push(
          `${design.id}: href="#${href}" has no node carrying anchorId "${target ?? href}"`,
        );
      }
    }
  }

  assert.deepEqual(
    broken,
    [],
    "A design links to an in-page anchor that does not exist. That renders as a " +
      "button which does NOTHING when clicked — the exact defect C11 fixed on " +
      "restaurant-orderable. Either give the target node an `anchorId`, or point " +
      "the link at a real route.\n  " +
      broken.join("\n  "),
  );
});

test("the two orderable designs specifically resolve their #menu button", () => {
  // Named explicitly because these are the regression cases: restaurant-orderable
  // is what the signup picker hands every restaurant-shaped tenant, and
  // store-orderable carries the same inert "Shop" link. A generic sweep would
  // still pass if someone deleted both designs; this will not.
  for (const key of ["restaurant-orderable", "store-orderable"]) {
    const design = PAGE_DESIGNS.find((d) => d.id === key);
    assert.ok(design, `${key} should exist`);
    const anchors = anchorsIn(design.tree as readonly BuilderNode[]);
    assert.ok(
      anchors.has("menu"),
      `${key} must expose an anchor "menu" — its primary button points at #menu`,
    );
  }
});
