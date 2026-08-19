import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PAGE_DESIGNS } from "./page-designs";
import { renderBuilderNodes } from "./render";
import { nodePresentationInlineStyle } from "@/lib/site-admin/sections/shared/node-presentation";
import { STYLE_TOKEN_REF_PREFIX } from "./style-token-bindings";
import type { BuilderNode, BuilderNodeTree } from "./types";

/**
 * THE contract: a `token:` sentinel is an AUTHORING value. It must be resolved
 * to `var(--token-…, fallback)` before it reaches CSS, because a raw sentinel
 * is an invalid declaration — the browser discards it and the element renders
 * transparent / unstyled. That is a silent failure: no error, no warning, just
 * an invisible button or a colourless drawer.
 *
 * Two shipped bugs of exactly this shape (the nav accent, and every theme
 * swatch picked in a curated section's colour override) are why this exists.
 */

function html(tree: BuilderNodeTree, options: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <>{renderBuilderNodes(tree, options as never)}</>,
  );
}

/**
 * Sentinels are legitimate inside `data-*` attributes (the editor round-trips
 * the authored value through the canvas) — it is CSS that cannot take them.
 * Strip data attributes, then look for survivors.
 */
function cssFacingText(markup: string): string {
  return markup.replace(/\sdata-[a-z0-9-]+="[^"]*"/g, "");
}

test("no shipped page design leaks a raw token sentinel into CSS", () => {
  for (const design of PAGE_DESIGNS) {
    const markup = cssFacingText(html(design.tree as BuilderNodeTree));
    const hit = markup.indexOf(STYLE_TOKEN_REF_PREFIX);
    assert.equal(
      hit,
      -1,
      `${design.id} emitted a raw sentinel: …${markup.slice(Math.max(0, hit - 90), hit + 60)}…`,
    );
  }
});

test("token-bound colours on a freeform node resolve to CSS vars", () => {
  const tree = [
    {
      id: "wrap",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          backgroundColor: "token:color.primary",
          textColor: "token:color.ink",
          borderColor: "token:color.line",
        },
      },
      children: [],
    } as unknown as BuilderNode,
  ];
  const markup = cssFacingText(html(tree));
  assert.ok(!markup.includes(STYLE_TOKEN_REF_PREFIX), "sentinel survived to CSS");
  assert.match(markup, /background-color:var\(--token-color-primary/);
  assert.match(markup, /color:var\(--token-color-ink/);
});

test("the hero-carousel background lift resolves its sentinel", () => {
  // Regression: the lift read childStyle RAW instead of going through
  // sharedNodeStyle, so this one field skipped the resolver every other path
  // applies. A token-bound slide background painted nothing.
  const tree = [
    {
      id: "hero",
      kind: "carousel",
      props: { variant: "hero", layerLabel: "Hero" },
      children: [
        {
          id: "slide-1",
          kind: "container",
          props: {
            layout: "stack",
            style: { backgroundColor: "token:color.primary" },
          },
          children: [],
        },
      ],
    } as unknown as BuilderNode,
  ];
  const markup = cssFacingText(html(tree));
  assert.ok(
    !markup.includes(STYLE_TOKEN_REF_PREFIX),
    "hero slide background leaked a raw sentinel",
  );
});

test("curated-section presentation colours resolve, not pass through", () => {
  // What the style panel's role-colour picker writes for a theme swatch.
  const style = nodePresentationInlineStyle({
    textColor: "token:color.ink",
    backgroundColor: "token:color.primary",
    borderColor: "token:color.line",
    fontFamily: "token:typography.heading-font-family",
  } as never);
  assert.ok(style, "expected an inline style object");
  for (const [prop, value] of Object.entries(style)) {
    assert.ok(
      typeof value !== "string" || !value.startsWith(STYLE_TOKEN_REF_PREFIX),
      `${prop} kept the raw sentinel (${String(value)}) — invalid CSS, renders as nothing`,
    );
  }
  assert.match(String(style.color), /^var\(--token-color-ink/);
  assert.match(String(style.backgroundColor), /^var\(--token-color-primary/);
  assert.match(String(style.borderColor), /^var\(--token-color-line/);
});
