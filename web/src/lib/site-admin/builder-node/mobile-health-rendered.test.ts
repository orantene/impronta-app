import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyAncestorClip, findRenderedOverflow, type RenderedBox } from "./mobile-health-rendered";

const box = (over: Partial<RenderedBox>): RenderedBox => ({
  id: "n1", kind: "button", label: '"Get in touch"', left: 0, right: 100,
  clipped: false, fixed: false, ...over,
});

test("header CTA past the 390px edge is flagged", () => {
  const out = findRenderedOverflow([box({ left: 300, right: 470 })], 390);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, "overflow");
  assert.match(out[0]!.message, /80px past the edge of the 390px screen/);
});

test("fitting, clipped, fixed and child-of-overflow boxes are ignored", () => {
  const out = findRenderedOverflow(
    [
      box({ left: 10, right: 390 }),
      box({ left: 300, right: 470, clipped: true }),
      box({ left: 300, right: 470, fixed: true }),
      box({ left: 300, right: 470, parentOverflows: true }),
    ],
    390,
  );
  assert.equal(out.length, 0);
});

test("left spill is flagged and zero viewport yields nothing", () => {
  assert.equal(findRenderedOverflow([box({ left: -40, right: 200 })], 390).length, 1);
  assert.equal(findRenderedOverflow([box({ left: 300, right: 470 })], 0).length, 0);
});

import { readFileSync } from "node:fs";

test("header CTA is capped under 400px, canvas roots clip, no polling", () => {
  const rd = (r: string) => readFileSync(new URL(r, import.meta.url), "utf8");
  const hdr = rd("../../../components/public-header.tsx");
  assert.match(hdr, /max-w-\[8\.5rem\][^"`]*min-\[400px\]:max-w-none/);
  assert.match(hdr, /<span className="min-w-0 truncate">\{ctaLabel!\}/);
  assert.match(rd("../../../components/edit-chrome/edit-chrome.tsx"), /overflow-x: clip !important/);
  const panel = rd("../../../components/edit-chrome/MobileHealthPanel.tsx");
  assert.doesNotMatch(panel, /setInterval/);
  assert.match(panel, /MutationObserver/);
});

test("header CTA cut off by an overflow:hidden bar is still flagged (not All clear)", () => {
  const out = findRenderedOverflow(
    [box({ left: 300, right: 470, clipped: true, hardClipped: true })],
    390,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.kind, "overflow");
});

test("a scroller or a decorative box trimmed by its section is not flagged", () => {
  const out = findRenderedOverflow(
    [
      box({ left: 300, right: 470, clipped: true, hardClipped: false }),
      box({ kind: "container", left: 0, right: 410, clipped: true, hardClipped: true }),
    ],
    390,
  );
  assert.equal(out.length, 0);
});

test("classifyAncestorClip: scroller wins over hidden, hidden/clip are hard", () => {
  assert.equal(classifyAncestorClip(["visible", "visible"]), "none");
  assert.equal(classifyAncestorClip(["visible", "hidden"]), "hard");
  assert.equal(classifyAncestorClip(["clip"]), "hard");
  assert.equal(classifyAncestorClip(["hidden", "auto"]), "scroll");
  assert.equal(classifyAncestorClip([]), "none");
});

test("hero cannot be scrolled sideways; panel re-resolves the device frame per measure", () => {
  const rd = (r: string) => readFileSync(new URL(r, import.meta.url), "utf8");
  const css = rd("../../../app/globals.css");
  const hero = css.slice(css.indexOf(".site-hero {"), css.indexOf("}", css.indexOf(".site-hero {")));
  assert.match(hero, /overflow:\s*clip/);
  const panel = rd("../../../components/edit-chrome/MobileHealthPanel.tsx");
  const measureAt = panel.indexOf("const measure = () =>");
  assert.ok(measureAt > 0);
  assert.match(panel.slice(measureAt), /const frame = activeFrame\(\)/);
  assert.match(panel, /retries\+\+ < 20/);
});
