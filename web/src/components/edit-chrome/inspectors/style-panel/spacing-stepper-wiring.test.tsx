/**
 * spacing-stepper-wiring.test.tsx — the per-side padding/margin steppers,
 * WIRED, on a real React commit cycle.
 *
 * WHY THIS FILE EXISTS. The token-scale steppers shipped with every pure-model
 * test green while the control in the browser did nothing: the first press
 * wrote the "none" step's CSS — the bare string "0" — and `parseCssLength`
 * refused unitless zero, so the read-back reported UNSET and every following
 * press recomputed the same first step forever. The label sat on "Auto", the
 * stored value sat on "0", seven clicks changed nothing. A test that only
 * drives `stepScale` can never see that loop, because the loop lives in the
 * read-write seam between the component, the value bridge, and the viewport
 * router. So this file drives the seam:
 *
 *   1. Mount the REAL `PaddingSidesGroup` / `MarginSidesGroup` in jsdom,
 *      click the REAL plus/minus buttons, and route every patch through the
 *      REAL `styleWithViewportPatch` — asserting the stored style walks the
 *      renderer's whole scale (0 / 0.75rem / 1.5rem / 3rem / 6rem) and the
 *      readout advances with it, for the desktop/base tier AND the mobile
 *      tier (where the write must land in `responsive.mobile.*` and leave the
 *      base value alone).
 *   2. Feed the values those clicks store to the REAL renderer
 *      (`renderBuilderNodes` → renderToStaticMarkup) and assert the emitted
 *      markup actually carries the padding/margin — base inline CSS on
 *      desktop, the `--bn-mobile-*` var + attribute + consuming sheet rule on
 *      mobile.
 *
 * WHAT THIS DOES NOT GUARANTEE, stated plainly: the style-panel's two ~340
 * line allow-list cleaners (`cleanBuilderNodeStyle` / `cleanBuilderNodeStyleValue`)
 * are not exported, so the router runs here with pass-through cleaners; a
 * cleaner that silently strips a per-side key would not fail this file. And no
 * jsdom test can see a live browser's computed styles — the renderer assertion
 * covers the emitted CSS, not the cascade around it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

// ── jsdom globals BEFORE react-dom/client touches document ──────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MutationObserver = dom.window.MutationObserver;
g.CustomEvent = dom.window.CustomEvent;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act, useEffect } from "react";
import { createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import {
  renderBuilderNodes,
  BuilderNodeRendererStyles,
} from "@/lib/site-admin/builder-node/render";
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";
import { NODE_SPACING } from "@/lib/site-admin/builder-node/style-scales";

import { MarginSidesGroup, PaddingSidesGroup } from "./exact-spacing-sides";
import { styleWithViewportPatch, type StyleCleaners } from "./viewport-style-patch";
import type { NodeViewport } from "./section-types";
/* eslint-enable import/first */

// The router's cleaners are injected by style-panel.tsx and not exported; the
// wiring under test is read → step → patch → route, so identity cleaners keep
// this file honest about what it measures (see the header).
const PASS_THROUGH_CLEANERS: StyleCleaners = {
  cleanStyle: (v) => v as BuilderNodeStyle | undefined,
  cleanValue: (v) => v as BuilderNodeStyleValue | undefined,
};

/**
 * The panel hands the sides the ACTIVE TIER's resolved style (base merged
 * under the tier bucket). Mirroring that read here is what lets a click's
 * write become the next click's value — the exact seam that was broken.
 */
function viewportStyleOf(
  style: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
): BuilderNodeStyleValue | undefined {
  if (viewport === "desktop") return style;
  return { ...style, ...style?.responsive?.[viewport] };
}

/** Mounts one sides-group against a live style object + the real router. */
function Harness({
  viewport,
  group,
  initial,
}: {
  viewport: NodeViewport;
  group: typeof PaddingSidesGroup;
  initial?: BuilderNodeStyle;
}) {
  const [style, setStyle] = useState<BuilderNodeStyle | undefined>(initial);
  // Publish through an effect, not during render: writing a module ref while
  // rendering is a side effect (react-hooks/immutability). act() flushes
  // effects before it returns, so the ref is still current synchronously
  // after every act() the assertions run inside.
  useEffect(() => {
    styleRef.value = style;
  }, [style]);
  return createElement(group, {
    patchSelectedStandaloneStyle: (patch: Partial<BuilderNodeStyleValue>) =>
      setStyle((cur) =>
        styleWithViewportPatch(cur, viewport, "viewport", patch, PASS_THROUGH_CLEANERS),
      ),
    selectedStandaloneViewportStyle: viewportStyleOf(style, viewport),
  });
}
// Latest committed style, readable synchronously after act() (setState is
// async; a ref written during render is current once the commit flushes).
const styleRef: { value: BuilderNodeStyle | undefined } = { value: undefined };

function mount(
  viewport: NodeViewport,
  group: typeof PaddingSidesGroup,
  initial?: BuilderNodeStyle,
): { root: Root; host: HTMLElement } {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Harness, { viewport, group, initial }));
  });
  return { root, host };
}

function unmount(root: Root, host: HTMLElement) {
  act(() => root.unmount());
  host.remove();
}

function stepperOf(host: HTMLElement, key: string): HTMLElement {
  const el = host.querySelector(
    `[data-builder-node-style-control="${key}"][data-field-kit-scale-stepper]`,
  );
  assert.ok(el, `stepper for ${key} is rendered`);
  return el as HTMLElement;
}

function press(host: HTMLElement, key: string, dir: "Larger" | "Smaller") {
  const button = stepperOf(host, key).querySelector(
    `button[aria-label="${dir}"]`,
  ) as HTMLButtonElement | null;
  assert.ok(button, `${dir} button exists on ${key}`);
  act(() => {
    button.click();
  });
}

function readout(host: HTMLElement, key: string): string {
  const span = stepperOf(host, key).querySelector("[data-field-kit-scale-readout]");
  assert.ok(span, `readout exists on ${key}`);
  return (span as HTMLElement).textContent ?? "";
}

// ── 1. Desktop/base tier: plus walks the WHOLE scale, minus walks back ───────

test("padding Top +: each press advances one step of the real scale on the base style", () => {
  const { root, host } = mount("desktop", PaddingSidesGroup);
  const walkUp: Array<[stored: string, shown: string]> = [
    [NODE_SPACING.none, "0 · 0"],
    [NODE_SPACING.s, "S · 12"],
    [NODE_SPACING.m, "M · 24"],
    [NODE_SPACING.l, "L · 48"],
    [NODE_SPACING.xl, "XL · 96"],
  ];
  assert.equal(readout(host, "paddingTop"), "Auto");
  for (const [stored, shown] of walkUp) {
    press(host, "paddingTop", "Larger");
    // The stored value is the scale's own CSS, on the BASE style (no tier bucket).
    assert.equal(styleRef.value?.paddingTop, stored);
    assert.equal(styleRef.value?.responsive, undefined);
    // The readout advanced — the exact assertion the shipped defect failed
    // (it stayed "Auto" while re-writing "0" forever).
    assert.equal(readout(host, "paddingTop"), shown);
  }
  // Top of the scale: plus is inert, another press stays at XL.
  press(host, "paddingTop", "Larger");
  assert.equal(styleRef.value?.paddingTop, NODE_SPACING.xl);

  // Minus walks back down, and below the bottom step clears the key.
  const walkDown = [NODE_SPACING.l, NODE_SPACING.m, NODE_SPACING.s, NODE_SPACING.none];
  for (const stored of walkDown) {
    press(host, "paddingTop", "Smaller");
    assert.equal(styleRef.value?.paddingTop, stored);
  }
  press(host, "paddingTop", "Smaller");
  assert.equal(styleRef.value?.paddingTop, undefined);
  assert.equal(readout(host, "paddingTop"), "Auto");
  unmount(root, host);
});

test("margin Top +: same wiring, the *Free key, read-back included", () => {
  const { root, host } = mount("desktop", MarginSidesGroup);
  press(host, "marginTopFree", "Larger");
  assert.equal(styleRef.value?.marginTopFree, NODE_SPACING.none);
  // The second press only advances if the first press's "0" read back as the
  // bottom step — the exact regression this file pins.
  press(host, "marginTopFree", "Larger");
  assert.equal(styleRef.value?.marginTopFree, NODE_SPACING.s);
  assert.equal(readout(host, "marginTopFree"), "S · 12");
  unmount(root, host);
});

// ── 2. Mobile tier: the write lands in responsive.mobile, base untouched ─────

test("padding Right + on the mobile tier writes responsive.mobile and leaves the base alone", () => {
  const base: BuilderNodeStyle = { paddingRight: NODE_SPACING.l };
  const { root, host } = mount("mobile", PaddingSidesGroup, base);
  // The tier starts on the base value (L), so the first press steps UP from L.
  assert.equal(readout(host, "paddingRight"), "L · 48");
  press(host, "paddingRight", "Larger");
  assert.equal(styleRef.value?.responsive?.mobile?.paddingRight, NODE_SPACING.xl);
  assert.equal(styleRef.value?.paddingRight, NODE_SPACING.l, "base value untouched");
  // And the override reads back: the next press is inert (top of scale), not a
  // recomputed first step.
  press(host, "paddingRight", "Larger");
  assert.equal(styleRef.value?.responsive?.mobile?.paddingRight, NODE_SPACING.xl);
  assert.equal(readout(host, "paddingRight"), "XL · 96");
  unmount(root, host);
});

// ── 3. The values the clicks store render as real padding/margin ─────────────

function renderHeading(style: BuilderNodeStyle): string {
  const nodes: BuilderNode[] = [
    {
      id: "h1",
      kind: "heading",
      props: { text: "Hola", level: 2, style },
    } as BuilderNode,
  ];
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform" }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

test("renderer: a stepped base padding/margin is emitted as inline CSS", () => {
  const html = renderHeading({ paddingTop: NODE_SPACING.m, marginTopFree: NODE_SPACING.l });
  assert.ok(html.includes("padding-top:1.5rem"), `padding-top in ${html}`);
  assert.ok(html.includes("margin-top:3rem"), `margin-top in ${html}`);
  // The bottom step ("0") must render too — it is the first value every walk
  // stores, and `if (style.paddingTop)` would drop an empty string but not "0".
  const zero = renderHeading({ paddingTop: NODE_SPACING.none });
  assert.ok(zero.includes("padding-top:0"), `padding-top:0 in ${zero}`);
});

test("renderer: a mobile-tier step emits the var, the attribute, and the sheet rule that consumes them", () => {
  const html = renderHeading({
    responsive: { mobile: { paddingTop: NODE_SPACING.m } },
  });
  assert.ok(html.includes("--bn-mobile-padding-top:1.5rem"), `mobile var in ${html}`);
  assert.ok(html.includes("data-builder-style-mobile-padding-top"), `mobile attr in ${html}`);
  const sheet = renderToStaticMarkup(
    createElement(BuilderNodeRendererStyles) as Parameters<typeof renderToStaticMarkup>[0],
  );
  assert.ok(
    sheet.includes(
      ".site-builder-node[data-builder-style-mobile-padding-top]{padding-top:var(--bn-mobile-padding-top)!important}",
    ),
    "the sheet rule that turns the var into padding exists",
  );
});
