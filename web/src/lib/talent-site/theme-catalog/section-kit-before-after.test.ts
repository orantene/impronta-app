/**
 * F77: the Before / After block is seeded with EMPTY photo slots, never random
 * gallery images. Builder shows a prompt; the public site hides the block until
 * both photos are set.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { isIncompleteBeforeAfter } from "@/lib/site-admin/builder-node/render-prune";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { beforeAfterBlock } from "./section-kit-before-after";

function ids(): () => string {
  let n = 0;
  return () => `n${++n}`;
}

function images(node: BuilderNode): BuilderNode[] {
  const out: BuilderNode[] = [];
  const walk = (n: BuilderNode) => {
    if (n.kind === "image") out.push(n);
    for (const c of (n as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  walk(node);
  return out;
}

function html(nodes: BuilderNode[], editor: boolean, locale = "en"): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(nodes, {
        includeRendererStyles: false,
        contentLocale: { locale, defaultLocale: "en", chain: [locale, "en"], ...(editor ? { editorPreview: true } : {}) },
      }),
    ),
  );
}

function withPictures(node: BuilderNode, srcs: string[]): BuilderNode {
  const copy = JSON.parse(JSON.stringify(node)) as BuilderNode;
  images(copy).forEach((img, i) => {
    (img.props as { src: string }).src = srcs[i] ?? "";
  });
  return copy;
}

test("F77: the seeded block has two EMPTY image slots and no gallery tokens", () => {
  const block = beforeAfterBlock(ids());
  const imgs = images(block);
  assert.equal(imgs.length, 2);
  for (const img of imgs) assert.equal((img.props as { src: string }).src, "");
  assert.ok(!JSON.stringify(block).includes("{{gallery"), "never auto-filled from the gallery");
  assert.equal(isIncompleteBeforeAfter(block), true);
});

test("F77: public site hides the block until both photos are set", () => {
  const block = beforeAfterBlock(ids());
  assert.equal(html([block], false), "");
  const one = withPictures(block, ["https://cdn.example.com/a.jpg"]);
  assert.equal(isIncompleteBeforeAfter(one), true);
  assert.equal(html([one], false), "");
  const both = withPictures(block, ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"]);
  assert.equal(isIncompleteBeforeAfter(both), false);
  assert.match(html([both], false), /data-builder-node-id/);
  assert.doesNotMatch(html([both], true), /data-before-after-prompt/);
});

test("F77: the builder shows the prompt (EN + ES, no em dash)", () => {
  const block = beforeAfterBlock(ids());
  const en = html([block], true);
  assert.match(en, /Choose your before and after photos/);
  // TUL-124 — live drops incomplete before/after; canvas badges that clearly.
  assert.match(en, /Not shown on your site/);
  assert.match(en, /data-not-shown-on-site=/);
  const es = html([block], true, "es");
  assert.match(es, /Elige tus fotos de antes y después/);
  assert.match(es, /No se muestra en tu sitio/);
  assert.ok(!en.includes("—") && !es.includes("—"));
});

test("TUL-207: beforeAfterBlock heading and captions ship es + en overlays", () => {
  const block = beforeAfterBlock(ids());
  const texts: Array<{ text: string; es?: string; en?: string }> = [];
  const walk = (n: BuilderNode) => {
    const p = n.props as { text?: string; i18n?: { es?: { text?: string }; en?: { text?: string } } };
    if (typeof p.text === "string") texts.push({ text: p.text, es: p.i18n?.es?.text, en: p.i18n?.en?.text });
    for (const c of (n as { children?: BuilderNode[] }).children ?? []) walk(c);
  };
  walk(block);
  assert.ok(texts.some((t) => t.text === "Before and after"));
  for (const t of texts) {
    assert.ok(t.es && t.es.length > 0, `"${t.text}" needs es`);
    assert.ok(t.en && t.en.length > 0, `"${t.text}" needs en`);
    assert.ok(!`${t.text}${t.es}${t.en}`.includes("—"));
  }
});
