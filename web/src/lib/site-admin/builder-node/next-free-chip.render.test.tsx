/**
 * next_free_chip — hidden when empty; shows first live slot when present.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NEXT_FREE_CHIP_DEFAULT_PROPS } from "./next-free-chip-defaults";
import { NEXT_FREE_CHIP_CSS, NextFreeChipView } from "./next-free-chip";
import type { BuilderNextFreeChipNode } from "./types";

function chip(overrides: Partial<BuilderNextFreeChipNode["props"]> = {}): BuilderNextFreeChipNode {
  return {
    id: "nfc-1",
    kind: "next_free_chip",
    props: { ...NEXT_FREE_CHIP_DEFAULT_PROPS, ...overrides },
  };
}

test("next_free_chip CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(NEXT_FREE_CHIP_CSS, /#[0-9a-fA-F]{3,8}/);
  assert.match(NEXT_FREE_CHIP_CSS, /--token-typography-heading-font-family/);
  assert.match(NEXT_FREE_CHIP_CSS, /--token-color-accent/);
});

test("SSR render is empty-hidden before client fetch (no invented clock)", () => {
  const html = renderToStaticMarkup(
    <NextFreeChipView
      node={chip()}
      offerings={[]}
      locale="en"
    /> as React.ReactElement,
  );
  assert.match(html, /data-builder-node-kind="next_free_chip"/);
  assert.match(html, /data-empty="1"|hidden/);
  assert.doesNotMatch(html, /data-has-slot="1"/);
  assert.doesNotMatch(html, /\d{1,2}:\d{2}/);
});
