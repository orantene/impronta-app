import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * Ratio and fit are KIND-AGNOSTIC at the base layer.
 *
 * They used not to be: the base layer honored them only inside the
 * image/video/embed cases, while the tablet/mobile lanes applied the same keys
 * to any node with !important. A container could be shaped on a phone and not
 * on a desktop — an inversion no author would guess, and the mechanism behind
 * two live pages whose cards rendered 0px tall (a container whose children are
 * all absolutely positioned has no other height source).
 *
 * These tests pin the whole cascade contract, not just the fix: media defaults
 * still apply, authored values still beat them, and the responsive lanes still
 * win over base.
 */

function nodeStyle(style: unknown, kind = "container"): string {
  const tree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "probe",
          kind,
          props: {
            layout: "stack",
            style,
            ...(kind === "image" ? { src: "/x.jpg", alt: "probe" } : {}),
          },
          children: [],
        },
      ],
    } as unknown as BuilderNode,
  ] as BuilderNodeTree;
  const markup = renderToStaticMarkup(
    <>{renderBuilderNodes(tree, {} as never)}</>,
  );
  return /data-builder-node-id="probe"[^>]*style="([^"]*)"/.exec(markup)?.[1] ?? "";
}

test("a container honors a base custom ratio", () => {
  assert.match(nodeStyle({ aspectRatioFree: "0.78" }), /aspect-ratio:0\.78/);
});

test("a container honors the base ratio preset", () => {
  assert.match(nodeStyle({ aspectRatio: "4:3" }), /aspect-ratio:4 \/ 3/);
});

test('ratio "auto" stays inert — it is the schema default, not an instruction', () => {
  assert.doesNotMatch(nodeStyle({ aspectRatio: "auto" }), /aspect-ratio/);
});

test("the free ratio beats the preset, matching the media renderers", () => {
  const out = nodeStyle({ aspectRatio: "16:9", aspectRatioFree: "0.78" });
  assert.match(out, /aspect-ratio:0\.78/);
  assert.doesNotMatch(out, /16 \/ 9/);
});

test("cards, splits and CTA groups get it too — not a container special case", () => {
  // section_embed is deliberately absent: it delegates wholly to the injected
  // section renderer and emits no style of its own here.
  for (const kind of ["card", "split", "cta_group"]) {
    assert.match(
      nodeStyle({ aspectRatioFree: "1 / 1" }, kind),
      /aspect-ratio:1 \/ 1/,
      `${kind} dropped its ratio`,
    );
  }
});

test("image defaults survive: the base argument still supplies fit and position", () => {
  const out = nodeStyle({}, "image");
  assert.match(out, /object-fit:cover/);
  assert.match(out, /object-position:center/);
});

test("an authored value overrides the media default", () => {
  const out = nodeStyle({ objectFit: "contain", aspectRatioFree: "2 / 3" }, "image");
  assert.match(out, /object-fit:contain/);
  assert.match(out, /aspect-ratio:2 \/ 3/);
});

test("the responsive lane still overrides the base ratio", () => {
  // Base is inline; the mobile rule is `!important` inside @media, which beats
  // an inline declaration. Losing either half would break the override.
  const tree = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "probe",
          kind: "container",
          props: {
            layout: "stack",
            style: {
              aspectRatioFree: "0.78",
              responsive: { mobile: { aspectRatioFree: "1 / 1" } },
            },
          },
          children: [],
        },
      ],
    } as unknown as BuilderNode,
  ] as BuilderNodeTree;
  const markup = renderToStaticMarkup(
    <>{renderBuilderNodes(tree, {} as never)}</>,
  );
  assert.match(markup, /data-builder-style-mobile-aspect-free/);
  assert.match(markup, /--bn-mobile-aspect-free:1 \/ 1/);
  assert.match(
    markup,
    /\.site-builder-node\[data-builder-style-mobile-aspect-free\]\{aspect-ratio:var\(--bn-mobile-aspect-free\)!important\}/,
    "the mobile rule must stay !important or the inline base would win",
  );
});
