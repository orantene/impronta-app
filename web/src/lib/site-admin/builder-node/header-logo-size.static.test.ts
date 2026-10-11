/**
 * TUL-532 — header logo size lock, for every header template. The image logo
 * used to sit in a fixed 20-28px square with object-fit:contain, so a wide
 * wordmark (Jorg Beauty, 533x174) drew at about 26x8px; the kit-shell header
 * drew it as a full-width cover image and the utility bar cropped it to a
 * 36px square. All three now follow `HEADER_LOGO_LIMITS`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { HEADER_LOGO_LIMITS } from "../header-logo-limits";
import { BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";
import { UTILITY_BAR_CSS } from "./utility-bar-block";

const CSS = readFileSync(resolve(process.cwd(), "src/app/token-presets.css"), "utf8");

function baseRule(): string {
  const m = /(?:^|\n)\.site-header__brand-mark\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(m, "expected the base .site-header__brand-mark rule");
  return m![1]!;
}

const px = (v: string) => Number(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? NaN);
const decl = (body: string, prop: string) =>
  new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+?)\\s*(?:;|$)`).exec(body)?.[1];

test("TUL-532: site_header base logo rule is the platform limits (proportional, floor, caps)", () => {
  const rule = baseRule();
  assert.equal(decl(rule, "width"), "auto");
  assert.equal(decl(rule, "object-fit"), "contain");
  assert.equal(decl(rule, "height"), HEADER_LOGO_LIMITS.height);
  assert.equal(decl(rule, "min-height"), `${HEADER_LOGO_LIMITS.minHeightPx}px`);
  assert.equal(decl(rule, "max-height"), `${HEADER_LOGO_LIMITS.maxHeightPx}px`);
  assert.equal(decl(rule, "max-width"), HEADER_LOGO_LIMITS.maxWidth);
  assert.ok(px(HEADER_LOGO_LIMITS.height) >= 36, "default minimum height is readable");
});

test("TUL-532: no site_header variant pins the logo width or drops below the floor", () => {
  const variants = [...CSS.matchAll(/\.site-header[^{}]*\.site-header__brand-mark\s*\{([^}]*)\}/g)].map(
    (m) => m[1]!,
  );
  assert.ok(variants.length >= 4, "expected the logo-scale + editorial variant rules");
  for (const body of variants) {
    const width = decl(body, "width");
    assert.ok(width === undefined || width === "auto", `variant pins width: ${width}`);
    const height = decl(body, "height");
    if (height?.startsWith("clamp(")) {
      assert.ok(px(height) >= HEADER_LOGO_LIMITS.minHeightPx, `variant height below the floor: ${height}`);
      const max = px(height.split(",").at(-1)!);
      assert.ok(max <= HEADER_LOGO_LIMITS.maxHeightPx, `variant height above the cap: ${height}`);
    }
  }
});

test("TUL-532: kit-shell header logo (builder image node) gets the same limits over its inline style", () => {
  const rule = BUILDER_NODE_RENDERER_CSS.split("\n").find(
    (l) => l.startsWith("[data-talent-max-site-header]") && l.includes(".site-builder-node--image"),
  );
  assert.ok(rule, "expected a header-logo rule in the renderer sheet");
  for (const want of [
    "width:fit-content!important",
    "object-fit:contain!important",
    `min-height:${HEADER_LOGO_LIMITS.minHeightPx}px!important`,
    `max-height:${HEADER_LOGO_LIMITS.maxHeightPx}px!important`,
    `max-width:${HEADER_LOGO_LIMITS.maxWidth}!important`,
    `height:${HEADER_LOGO_LIMITS.height}`,
  ]) {
    assert.ok(rule!.includes(want), `missing ${want}`);
  }
  assert.ok(rule!.includes(".site-builder-node--image-link>.site-builder-node--image"), "linked logo too");

  const header: BuilderNode = {
    id: "h",
    kind: "container",
    props: { layout: "row", align: "center", gap: "m", layerLabel: "Header" },
    children: [
      { id: "logo", kind: "image", props: { src: "https://example.com/logo.png", alt: "Jorg", href: "/", layerLabel: "Logo" } },
    ],
  } as BuilderNode;
  const html = renderToStaticMarkup(
    createElement(
      "header",
      { "data-talent-max-site-header": "" },
      renderBuilderNodes([header], { mode: "freeform", includeRendererStyles: false, includeFontLinks: false }),
    ),
  );
  assert.match(html, /data-builder-layout="row"[^>]*>(?:<a[^>]*site-builder-node--image-link[^>]*>)?<img[^>]*site-builder-node--image/);
});

test("TUL-532: utility-bar logo keeps its proportions instead of a cropped square", () => {
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-logo\[data-logo-img\]\{width:auto;max-width:[^}]*background:var\(--token-color-background\)\}/);
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-logo\[data-logo-img\] img\{width:auto;[^}]*object-fit:contain/);
  assert.ok(UTILITY_BAR_CSS.includes(`min-height:${HEADER_LOGO_LIMITS.minHeightPx}px`));
  const phone = /@container sbub \(max-width:480px\)\{(.*)\}\s*$/m.exec(UTILITY_BAR_CSS)?.[1] ?? "";
  assert.match(phone, /\.sb-ub:has\(\.sb-ub-logo\[data-logo-img\]\) \.sb-ub-pill\{display:none\}/, "phone frees room for the logo");
  const name = /\.sb-ub-logo\[data-logo-img\]\+\.sb-ub-nm\{([^}]*)\}/.exec(phone)?.[1] ?? "";
  assert.match(name, /clip-path:inset\(50%\)/, "name is visually hidden on phone");
  assert.doesNotMatch(name, /display:none/, "name still labels the home link for screen readers");
});
