/**
 * fonts-registry.test.ts — the font USAGE collector: which families a tree
 * uses, at which weights, with which styles. This is what keeps the published
 * page's font payload proportional to what the page renders.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/fonts-registry.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectBuilderNodeFontFamilies,
  collectBuilderNodeFontUsage,
} from "./fonts-registry";
import type { BuilderNode } from "./types";

const LORA = '"Lora", Georgia, serif';

function box(style: Record<string, unknown>, children: BuilderNode[] = []): BuilderNode {
  return { kind: "box", props: { style }, children } as unknown as BuilderNode;
}
function heading(style: Record<string, unknown>, text = "Hi"): BuilderNode {
  return { kind: "heading", props: { text, level: 2, style } } as unknown as BuilderNode;
}

test("a child's explicit weight lands on the INHERITED family", () => {
  const tree = [
    box({ fontFamily: LORA }, [heading({ fontWeight: 900 }), heading({ fontWeight: 200 })]),
  ];
  const usage = collectBuilderNodeFontUsage(tree);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].value, LORA);
  assert.ok(usage[0].weights.includes(900), "explicit 900 collected");
  assert.ok(usage[0].weights.includes(200), "explicit 200 collected");
});

test("the renderer baseline (400/500/600/700) always loads for a used family", () => {
  const usage = collectBuilderNodeFontUsage([box({ fontFamily: LORA })]);
  assert.deepEqual(usage[0].weights, [400, 500, 600, 700]);
});

test("a base-lane family override CUTS the inherited family for the subtree", () => {
  const outfit = '"Outfit", system-ui, sans-serif';
  const tree = [box({ fontFamily: LORA }, [heading({ fontFamily: outfit, fontWeight: 800 })])];
  const usage = collectBuilderNodeFontUsage(tree);
  const lora = usage.find((u) => u.value === LORA);
  const child = usage.find((u) => u.value === outfit);
  assert.ok(lora && child);
  assert.ok(!lora.weights.includes(800), "the 800 belongs to the override family only");
  assert.ok(child.weights.includes(800));
});

test("breakpoint lanes contribute families AND weights", () => {
  const tablet = '"Italiana", Georgia, serif';
  const tree = [
    box({
      fontFamily: LORA,
      responsive: { tablet: { fontFamily: tablet, fontWeight: 300 } },
    }),
  ];
  const usage = collectBuilderNodeFontUsage(tree);
  assert.deepEqual(
    usage.map((u) => u.value).sort(),
    [tablet, LORA].sort(),
    "a tablet-only family still loads; the base family is kept for other breakpoints",
  );
  for (const u of usage) assert.ok(u.weights.includes(300));
});

test("italics: fontStyle and <em> markup both mark the family", () => {
  const byStyle = collectBuilderNodeFontUsage([box({ fontFamily: LORA, fontStyle: "italic" })]);
  assert.equal(byStyle[0].italic, true);
  const byMarkup = collectBuilderNodeFontUsage([
    box({ fontFamily: LORA }, [heading({}, "an <em>emphatic</em> word")]),
  ]);
  assert.equal(byMarkup[0].italic, true);
  const plain = collectBuilderNodeFontUsage([box({ fontFamily: LORA })]);
  assert.equal(plain[0].italic, false);
});

test("components are walked too, and the legacy families API still works", () => {
  const components = { promo: box({ fontFamily: LORA }) } as unknown as Record<string, BuilderNode>;
  assert.deepEqual(collectBuilderNodeFontFamilies([], components), [LORA]);
});
