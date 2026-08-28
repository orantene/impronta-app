/**
 * position-fixed.test.ts — `position: fixed`, end to end.
 *
 * Fixed is the position value a modern mockup cannot do without (a floating
 * CTA, a side rail, a chat button, a full-viewport overlay) and it was the one
 * the builder did not have. This file pins the whole chain for it:
 *
 *   • the SCHEMA accepts it (strict `validateBuilderNodeTree`),
 *   • the DRAFT GATE preserves it on the base layer AND inside a responsive
 *     bucket (it is settable per breakpoint like every other position value),
 *   • the RENDERER emits it on the base layer and routes a per-breakpoint
 *     override through the same CSS-var/data-attr path as the other positions,
 *   • the positioning INSETS are clamped in magnitude (sign preserved), which
 *     matters far more for fixed than for the others: a fixed node offset by a
 *     mistyped "-99999px" is pinned off the viewport, with no scroll that brings
 *     it back and no in-flow box to grab.
 *
 * The two OPERATOR-FACING caveats fixed carries — an ancestor transform/filter
 * re-anchoring it on the live page, and the canvas being honest only at 100%
 * zoom — are covered by `mobile-health.test.ts` ("trapped_fixed") and the note
 * the Position inspector prints, respectively.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/position-fixed.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  INSET_MAX_PX,
  normalizeUnknownBuilderTreeLayout,
} from "./normalize-tree-layout";
import { renderBuilderNodes } from "./render";
import type { BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";

test("position:fixed survives the gate on every layer, and insets are clamped", () => {
  const tree = [
    {
      id: "section-1",
      kind: "section",
      props: { sectionTypeKey: "custom" },
      children: [
        {
          id: "cta-rail",
          kind: "container",
          props: {
            layout: "stack",
            style: {
              position: "fixed",
              bottom: "24px",
              right: "-99999px",
              zIndex: 40,
              responsive: {
                mobile: { position: "fixed", top: `${INSET_MAX_PX * 3}px` },
              },
            },
          },
          children: [
            { id: "cta-1", kind: "paragraph", props: { text: "Book a call" } },
          ],
        },
      ],
    },
  ];
  const output = normalizeUnknownBuilderTreeLayout(tree) as unknown[];
  const section = output[0] as { children: unknown[] };
  const node = section.children[0] as { props: { style: Record<string, unknown> } };
  const style = node.props.style;
  assert.equal(style.position, "fixed", "fixed must survive the draft gate");
  assert.equal(style.bottom, "24px", "a sane inset is untouched");
  assert.equal(
    style.right,
    `${-INSET_MAX_PX}px`,
    "an absurd negative inset is clamped in magnitude, sign preserved",
  );
  const mobile = (style.responsive as { mobile: Record<string, unknown> }).mobile;
  assert.equal(mobile.position, "fixed", "fixed is settable per breakpoint");
  assert.equal(mobile.top, `${INSET_MAX_PX}px`);
  assert.ok(validateBuilderNodeTree(output).ok, "and the strict validator accepts fixed");
});

test("position:fixed renders on the base layer and per breakpoint", () => {
  const tree = [
    {
      id: "fixed-cta",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          position: "fixed",
          bottom: "24px",
          responsive: { mobile: { position: "relative" } },
        },
      },
      children: [{ id: "t-1", kind: "paragraph", props: { text: "Chat" } }],
    },
  ] as unknown as BuilderNodeTree;
  const markup = renderToStaticMarkup(
    createElement("div", null, renderBuilderNodes(tree, {}) as ReactNode),
  );
  assert.ok(markup.includes("position:fixed"), "base layer emits position:fixed");
  assert.ok(
    markup.includes("data-builder-style-mobile-position"),
    "the mobile override rides the same responsive CSS-var path as the other positions",
  );
});
