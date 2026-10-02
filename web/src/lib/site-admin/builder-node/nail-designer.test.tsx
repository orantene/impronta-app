/**
 * Nail Designer (app_nail_designer): the owner's Nail Studio embedded as-is in
 * an iframe; host message bridge, gallery playground and CSP.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { isNailStudioMessage, nailStudioSrc, nailStudioSummary } from "./nail-designer-model";
import { renderBuilderNodes } from "./render";
import { appNailDesignerPropsSchema, BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNode } from "./types";

function render(locale: string): string {
  return renderToStaticMarkup(
    renderBuilderNodes([createBuilderNode("app_nail_designer") as BuilderNode], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
      visitorLocale: locale,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("kind stays registered with a zero-config schema", () => {
  assert.ok(BUILDER_NODE_REGISTRY.app_nail_designer);
  assert.equal(appNailDesignerPropsSchema.safeParse({}).success, true);
});

test("the block renders an iframe on the owner's app with lang, allow, title and lazy loading", () => {
  const en = render("en");
  assert.match(en, /<iframe[^>]*src="\/apps\/nail-studio\/index\.html\?lang=en"/);
  assert.match(en, /allow="clipboard-write; web-share"/);
  assert.match(en, /loading="lazy"/);
  assert.match(en, /title="Nail Designer"/);
  const es = render("es");
  assert.match(es, /src="\/apps\/nail-studio\/index\.html\?lang=es"/);
  assert.match(es, /title="Diseñador de uñas"/);
  assert.equal(nailStudioSrc("es-MX"), "/apps/nail-studio/index.html?lang=es");
});

test("the message handler ignores foreign sources, origins and types", () => {
  const frame = {};
  const data = { source: "nail-designer", type: "save", design: {} };
  assert.equal(isNailStudioMessage({ source: frame, origin: "https://a.test", data }, frame, "https://a.test"), true);
  assert.equal(isNailStudioMessage({ source: {}, origin: "https://a.test", data }, frame, "https://a.test"), false);
  assert.equal(isNailStudioMessage({ source: frame, origin: "https://evil.test", data }, frame, "https://a.test"), false);
  assert.equal(isNailStudioMessage({ source: frame, origin: "https://a.test", data: { ...data, type: "change" } }, frame, "https://a.test"), false);
  assert.equal(isNailStudioMessage({ source: frame, origin: "https://a.test", data: { ...data, source: "x" } }, frame, "https://a.test"), false);
  assert.equal(isNailStudioMessage({ source: null, origin: "https://a.test", data }, null, "https://a.test"), false);
});

test("the summary names shape, length, colours, pattern, finish and charm count", () => {
  const design = {
    shape: "coffin",
    length: 0.7,
    nails: [
      { c1: "#E8A9A6", pattern: "french", finish: "gloss", charms: [{ id: "gem" }] },
      { c1: "#8E3B46", pattern: "solid", finish: "chrome", charms: [] },
    ],
  };
  const en = nailStudioSummary(design, "en");
  for (const w of ["coffin", "long", "#E8A9A6", "french", "gloss", "1 charms"]) assert.ok(en.includes(w), w);
  assert.match(nailStudioSummary(design, "es"), /forma coffin, largo larga/);
  assert.doesNotMatch(en + nailStudioSummary(design, "es"), /—/);
});

test("the Apps gallery playground uses the same iframe", () => {
  const src = readFileSync(new URL("../../../components/talent/site/maison-setup/GalleryAppsUi.tsx", import.meta.url), "utf8");
  assert.match(src, /NailStudioFrame/);
  assert.doesNotMatch(src, /NailDesignerIsland/);
});

test("CSP allows same-origin frames and the proxy serves the static app host-agnostically", () => {
  const cfg = readFileSync(new URL("../../../../next.config.ts", import.meta.url), "utf8");
  assert.match(cfg, /`frame-src 'self' /);
  const proxy = readFileSync(new URL("../../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /apps\/nail-studio\//);
});

test("the public copy differs from the owner file only by the font link", () => {
  const owner = readFileSync(new URL("../../../../design-references/apps/nail-designer-v2/nail-designer.html", import.meta.url), "utf8");
  const pub = readFileSync(new URL("../../../../public/apps/nail-studio/index.html", import.meta.url), "utf8");
  assert.equal(pub, owner.replace("https://fonts.googleapis.com/css2?", "/api/fonts/css?"));
});
