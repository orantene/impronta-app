/**
 * rich-text-lists.test.ts — block-list marker parse/serialize + public emit.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/sections/shared/rich-text-lists.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderInlineRich } from "./rich-text";
import {
  serializeListBlock,
  splitRichBlocks,
} from "./rich-text-lists";

test("splitRichBlocks round-trips mixed paragraph + ul + ol", () => {
  const input =
    "Hello {b}there{/b}\n" +
    serializeListBlock("ul", ["one", "two with {b}bold{/b}"]) +
    "\nAfter\n" +
    serializeListBlock("ol", ["first"]);
  const blocks = splitRichBlocks(input);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["text", "ul", "text", "ol"],
  );
  assert.equal(blocks[0] && blocks[0].kind === "text" ? blocks[0].text : "", "Hello {b}there{/b}");
  assert.deepEqual(
    blocks[1] && blocks[1].kind === "ul" ? blocks[1].items : [],
    ["one", "two with {b}bold{/b}"],
  );
});

test("renderInlineRich emits a real ul/ol, not a fake marker span", () => {
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      renderInlineRich(
        "Intro\n" + serializeListBlock("ul", ["Shop {b}this{/b}"]) + "\nOutro",
      ),
    ),
  );
  assert.match(html, /<ul class="site-rich-list">/);
  assert.match(html, /<li>/);
  assert.match(html, /<strong>this<\/strong>/);
  assert.equal(html.includes("{ul}"), false);
  assert.equal(html.includes("{li}"), false);
});
