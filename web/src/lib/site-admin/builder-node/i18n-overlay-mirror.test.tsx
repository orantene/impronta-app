/**
 * P0 (book-jorgelina /en showed the Spanish hero): a page tree written straight to the
 * database carries its translations only on `props.i18n`; the renderer reads `node.i18n`.
 * `coerceTree` (every talent-site tree goes through it) now mirrors the overlay.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { coerceTree } from "@/lib/talent-site/resolve-max-site-core";
import { mirrorPropsI18nOntoNodes } from "./i18n-overlay";
import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

const OVERLAY = { es: { text: "Pestañas que enmarcan tu mirada." }, en: { text: "Lashes that frame your look." } };

function heroTree(): BuilderNode[] {
  return [
    {
      id: "hero",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "h1", kind: "heading", props: { level: 1, text: "Pestañas que enmarcan tu mirada.", i18n: OVERLAY } },
        { id: "other", kind: "paragraph", props: { text: "Sin traducción" } },
      ],
    },
  ] as unknown as BuilderNode[];
}

function html(nodes: BuilderNode[], locale: string) {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
      contentLocale: { locale, defaultLocale: "es", chain: [locale, "es"] },
    }),
  );
}

test("without the mirror the English hero is NOT shown (the bug)", () => {
  assert.match(html(heroTree(), "en"), /Pestañas que enmarcan tu mirada\./);
});

test("coerceTree mirrors props.i18n so /en renders the English hero and /es stays Spanish", () => {
  const tree = coerceTree(heroTree());
  assert.match(html(tree, "en"), /Lashes that frame your look\./);
  assert.doesNotMatch(html(tree, "en"), /Pestañas que enmarcan/);
  assert.match(html(tree, "es"), /Pestañas que enmarcan tu mirada\./);
});

test("the mirror is pure: same array when nothing to mirror, untouched subtrees keep identity", () => {
  const plain = [{ id: "a", kind: "paragraph", props: { text: "x" } }] as unknown as BuilderNode[];
  assert.equal(mirrorPropsI18nOntoNodes(plain), plain);
  const tree = heroTree();
  const other = (tree[0] as any).children[1];
  const out = mirrorPropsI18nOntoNodes(tree);
  assert.notEqual(out, tree);
  assert.equal((out[0] as any).children[1], other);
  assert.deepEqual((out[0] as any).children[0].i18n, OVERLAY);
  assert.equal((tree[0] as any).children[0].i18n, undefined, "input is not mutated");
});

test("an overlay already on the node is never overwritten; junk overlays are ignored", () => {
  const node = { id: "n", kind: "heading", i18n: { en: { text: "Keep me" } }, props: { text: "base", i18n: OVERLAY } };
  const out = mirrorPropsI18nOntoNodes([node] as unknown[]);
  assert.deepEqual((out[0] as any).i18n, { en: { text: "Keep me" } });
  const junk = [{ id: "j", kind: "heading", props: { text: "b", i18n: { en: { text: "   " }, es: "no" } } }] as unknown[];
  assert.equal(mirrorPropsI18nOntoNodes(junk), junk);
  assert.deepEqual(coerceTree("nope"), []);
});
