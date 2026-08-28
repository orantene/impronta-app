/**
 * visual-effect-wiring.test.tsx — the visual effect controls, WIRED, on a real
 * React commit cycle.
 *
 * Two features in this codebase shipped dead with fully green tests because
 * the tests only exercised the pure model while the bug lived in the seam
 * between the control, the value bridge, and the viewport router (see
 * spacing-stepper-wiring.test.tsx, whose harness this file reuses). So every
 * control here is driven the way an operator drives it — real clicks and real
 * input events on the mounted component — and the assertions read the STORED
 * style after routing through the real `styleWithViewportPatch`, plus the
 * real renderer's emitted markup for the values those gestures store.
 *
 * The anti-silent-snap contract is pinned in both directions:
 *   - mounting any control over a hand-authored value it cannot represent
 *     emits ZERO patches (patch counts are asserted), and
 *   - the un-representable text is still on screen verbatim.
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
g.HTMLInputElement = dom.window.HTMLInputElement;
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
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type {
  BuilderNode,
  BuilderNodeStyle,
  BuilderNodeStyleValue,
} from "@/lib/site-admin/builder-node";

import { GradientStopsBuilder } from "../css-value-builders";
import { GlassBackdropField } from "./glass-backdrop-field";
import { FilterField } from "./filter-field";
import { ShadowStackBuilder } from "./shadow-stack-builder";
import { BorderSidesField, CornerRadiusField } from "./corner-border-sides-fields";
import { styleWithViewportPatch, type StyleCleaners } from "./viewport-style-patch";
import type { NodeViewport } from "./section-types";
/* eslint-enable import/first */

const PASS_THROUGH_CLEANERS: StyleCleaners = {
  cleanStyle: (v) => v as BuilderNodeStyle | undefined,
  cleanValue: (v) => v as BuilderNodeStyleValue | undefined,
};

function viewportStyleOf(
  style: BuilderNodeStyle | undefined,
  viewport: NodeViewport,
): BuilderNodeStyleValue | undefined {
  if (viewport === "desktop") return style;
  return { ...style, ...style?.responsive?.[viewport] };
}

// Latest committed style + patch count, readable synchronously after act().
const styleRef: { value: BuilderNodeStyle | undefined; patches: number } = {
  value: undefined,
  patches: 0,
};

/**
 * Mounts one control against a live style object + the real viewport router.
 * `pick` selects the style key the control reads; `render` receives the
 * control's two possible wirings (single-key onChange, or a style patch).
 */
function Harness({
  viewport,
  initial,
  render,
}: {
  viewport: NodeViewport;
  initial?: BuilderNodeStyle;
  render: (
    viewportStyle: BuilderNodeStyleValue | undefined,
    patch: (p: Partial<BuilderNodeStyleValue>) => void,
  ) => React.ReactElement;
}) {
  const [style, setStyle] = useState<BuilderNodeStyle | undefined>(initial);
  const [patches, setPatches] = useState(0);
  // Publish through an effect, not during render (react-hooks/immutability);
  // act() flushes effects, so the ref is current when the assertions run.
  useEffect(() => {
    styleRef.value = style;
    styleRef.patches = patches;
  }, [style, patches]);
  return render(viewportStyleOf(style, viewport), (p) => {
    setPatches((c) => c + 1);
    setStyle((cur) =>
      styleWithViewportPatch(cur, viewport, "viewport", p, PASS_THROUGH_CLEANERS),
    );
  });
}

function mount(
  render: Parameters<typeof Harness>[0]["render"],
  initial?: BuilderNodeStyle,
  viewport: NodeViewport = "desktop",
): { root: Root; host: HTMLElement } {
  styleRef.value = initial;
  styleRef.patches = 0;
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Harness, { viewport, initial, render }));
  });
  return { root, host };
}

function unmount(root: Root, host: HTMLElement) {
  act(() => root.unmount());
  host.remove();
}

function click(el: Element | null, what: string) {
  assert.ok(el, `${what} is rendered`);
  act(() => {
    (el as HTMLElement).click();
  });
}

/**
 * Drive a controlled React input the way a keystroke does: set the value on
 * the real DOM node, then invoke the onChange handler REACT WIRED ONTO THAT
 * NODE (via its __reactProps expando). React's synthetic change plugin does
 * not fire from programmatic events in this jsdom setup, but the handler
 * being invoked is the mounted component's own — so the component → patch →
 * viewport-router seam (where the shipped wiring bugs lived) is still the
 * real thing, read back through the store on the next render.
 */
function setInput(el: Element | null, value: string, what: string) {
  assert.ok(el, `${what} is rendered`);
  const input = el as HTMLInputElement;
  const desc = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  assert.ok(desc?.set, `${what} has a value setter`);
  desc.set.call(input, value);
  const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps"));
  assert.ok(propsKey, `${what} carries React props`);
  const props = (input as unknown as Record<
    string,
    { onChange?: (e: { target: HTMLInputElement }) => void }
  >)[propsKey];
  assert.ok(props?.onChange, `${what} has a wired onChange`);
  act(() => {
    props.onChange?.({ target: input });
  });
}

// ── 1. Glass backdrop ────────────────────────────────────────────────────────

test("glass: the preset click writes the whole surface in one patch, on the base style", () => {
  const { root, host } = mount((vs, patch) =>
    createElement(GlassBackdropField, { value: vs?.backdropFilter, onPatch: patch }),
  );
  assert.equal(styleRef.patches, 0, "mounting emits no patch");
  click(host.querySelector("[data-builder-glass-preset]"), "Glass preset button");
  assert.equal(styleRef.value?.backdropFilter, "blur(12px) saturate(1.4)");
  assert.equal(styleRef.value?.backgroundColor, "rgba(255,255,255,0.12)");
  assert.equal(styleRef.value?.borderColor, "rgba(255,255,255,0.25)");
  assert.equal(styleRef.value?.borderWidth, "1px");
  assert.equal(styleRef.value?.borderStyle, "solid");
  assert.equal(styleRef.value?.responsive, undefined);
  // The stored value reads back into the blur control, and editing it
  // recomposes ONLY the backdropFilter.
  setInput(host.querySelector("[data-builder-glass-blur]"), "20", "blur input");
  assert.equal(styleRef.value?.backdropFilter, "blur(20px) saturate(1.4)");
  assert.equal(styleRef.value?.backgroundColor, "rgba(255,255,255,0.12)", "fill untouched");
  unmount(root, host);
});

test("glass: on the mobile tier the preset writes responsive.mobile and leaves base alone", () => {
  const base: BuilderNodeStyle = { backgroundColor: "#fff" };
  const { root, host } = mount(
    (vs, patch) =>
      createElement(GlassBackdropField, { value: vs?.backdropFilter, onPatch: patch }),
    base,
    "mobile",
  );
  click(host.querySelector("[data-builder-glass-preset]"), "Glass preset button");
  assert.equal(
    styleRef.value?.responsive?.mobile?.backdropFilter,
    "blur(12px) saturate(1.4)",
  );
  assert.equal(styleRef.value?.backdropFilter, undefined, "base untouched");
  assert.equal(styleRef.value?.backgroundColor, "#fff", "base fill untouched");
  unmount(root, host);
});

test("glass: a hand-authored filter outside the grammar is shown verbatim and never rewritten", () => {
  const exotic = "blur(4px) invert(1)";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(GlassBackdropField, { value: vs?.backdropFilter, onPatch: patch }),
    { backdropFilter: exotic },
  );
  assert.equal(styleRef.patches, 0, "mounting over an exotic value emits no patch");
  const raw = host.querySelector("[data-builder-glass-raw]") as HTMLInputElement;
  assert.equal(raw.value, exotic, "raw input shows the value verbatim");
  assert.equal(host.querySelector("[data-builder-glass-blur]"), null, "no blur control offered");
  assert.equal(styleRef.value?.backdropFilter, exotic);
  unmount(root, host);
});

// ── 2. Shadow stack ──────────────────────────────────────────────────────────

const PRESET_M = "0 4px 8px rgba(18,18,18,0.06), 0 6px 16px rgba(18,18,18,0.12)";

test("shadow stack: add appends a layer; the shipped preset layers stay byte-identical", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(ShadowStackBuilder, {
        value: vs?.boxShadow,
        onChange: (next) => patch({ boxShadow: next }),
      }),
    { boxShadow: PRESET_M },
  );
  assert.equal(styleRef.patches, 0, "mounting emits no patch");
  assert.equal(host.querySelectorAll("[data-builder-shadow-layer]").length, 2);
  click(host.querySelector("[data-builder-shadow-layer-add]"), "add layer");
  assert.equal(
    styleRef.value?.boxShadow,
    `${PRESET_M}, 0px 8px 24px 0px rgba(0,0,0,0.18)`,
    "existing layers untouched, new layer appended",
  );
  // Editing the NEW layer's blur recomposes only that layer.
  setInput(
    host.querySelectorAll("[data-builder-shadow-field='blur']")[0] ?? null,
    "40",
    "expanded layer blur input",
  );
  assert.equal(
    styleRef.value?.boxShadow,
    `${PRESET_M}, 0px 8px 40px 0px rgba(0,0,0,0.18)`,
  );
  // Remove the first layer.
  click(host.querySelector("[data-builder-shadow-layer-remove='0']"), "remove layer 0");
  assert.equal(
    styleRef.value?.boxShadow,
    "0 6px 16px rgba(18,18,18,0.12), 0px 8px 40px 0px rgba(0,0,0,0.18)",
  );
  unmount(root, host);
});

test("shadow stack: reorder swaps layers without rewriting either", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(ShadowStackBuilder, {
        value: vs?.boxShadow,
        onChange: (next) => patch({ boxShadow: next }),
      }),
    { boxShadow: PRESET_M },
  );
  click(host.querySelector("[data-builder-shadow-layer-up='1']"), "move layer 2 up");
  assert.equal(
    styleRef.value?.boxShadow,
    "0 6px 16px rgba(18,18,18,0.12), 0 4px 8px rgba(18,18,18,0.06)",
  );
  unmount(root, host);
});

test("shadow stack: an exotic layer is edited as raw text, never flattened", () => {
  const exotic = "0 0 min(2px,1vw) red";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(ShadowStackBuilder, {
        value: vs?.boxShadow,
        onChange: (next) => patch({ boxShadow: next }),
      }),
    { boxShadow: `0 8px 24px rgba(0,0,0,0.18), ${exotic}` },
  );
  assert.equal(styleRef.patches, 0, "mounting emits no patch");
  click(host.querySelector("[data-builder-shadow-layer-toggle='1']"), "expand exotic layer");
  const raw = host.querySelector("[data-builder-shadow-field='raw']") as HTMLInputElement;
  assert.ok(raw, "the exotic layer offers a raw text editor, not sliders");
  assert.equal(raw.value, exotic);
  assert.equal(styleRef.value?.boxShadow, `0 8px 24px rgba(0,0,0,0.18), ${exotic}`);
  unmount(root, host);
});

test("shadow stack: removing the last layer clears the key", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(ShadowStackBuilder, {
        value: vs?.boxShadow,
        onChange: (next) => patch({ boxShadow: next }),
      }),
    { boxShadow: "0 8px 24px rgba(0,0,0,0.18)" },
  );
  click(host.querySelector("[data-builder-shadow-layer-remove='0']"), "remove only layer");
  assert.equal(styleRef.value?.boxShadow, undefined);
  unmount(root, host);
});

// ── 3. Per-corner radius ─────────────────────────────────────────────────────

function cornerInput(host: HTMLElement, key: string): HTMLInputElement | null {
  return host.querySelector(`[data-builder-corner-input='${key}'] input`);
}

test("corner radius: linked typing writes one uniform value; unlinked writes the shorthand", () => {
  const { root, host } = mount((vs, patch) =>
    createElement(CornerRadiusField, {
      value: vs?.borderRadius,
      onChange: (next) => patch({ borderRadius: next }),
    }),
  );
  click(host.querySelector("[data-builder-corner-radius-toggle]"), "Each corner toggle");
  assert.equal(styleRef.patches, 0, "opening the group emits no patch");
  // Linked (default): one input sets all four → minimal shorthand "16px".
  setInput(cornerInput(host, "topLeft"), "16", "TL input");
  assert.equal(styleRef.value?.borderRadius, "16px");
  // Unlink, zero the bottom corners → the designer's "top corners only".
  click(host.querySelector("[data-builder-corner-radius-link]"), "link toggle");
  setInput(cornerInput(host, "bottomLeft"), "0", "BL input");
  setInput(cornerInput(host, "bottomRight"), "0", "BR input");
  assert.equal(styleRef.value?.borderRadius, "16px 16px 0 0");
  unmount(root, host);
});

test("corner radius: elliptical 16px / 8px opens controls and emits zero patches until edited", () => {
  const exotic = "16px / 8px";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(CornerRadiusField, {
        value: vs?.borderRadius,
        onChange: (next) => patch({ borderRadius: next }),
      }),
    { borderRadius: exotic },
  );
  click(host.querySelector("[data-builder-corner-radius-toggle]"), "Each corner toggle");
  assert.equal(styleRef.patches, 0, "no patch on mount/open");
  assert.ok(cornerInput(host, "topLeft"), "circular X inputs are offered");
  assert.ok(cornerInput(host, "topLeftY"), "elliptical Y inputs are offered");
  assert.equal(styleRef.value?.borderRadius, exotic);
  setInput(cornerInput(host, "topLeftY"), "4", "TL Y input");
  assert.equal(styleRef.value?.borderRadius, "16px / 4px");
  unmount(root, host);
});

test("corner radius: a calc() value stands the controls down, verbatim", () => {
  const exotic = "calc(1rem + 2px)";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(CornerRadiusField, {
        value: vs?.borderRadius,
        onChange: (next) => patch({ borderRadius: next }),
      }),
    { borderRadius: exotic },
  );
  click(host.querySelector("[data-builder-corner-radius-toggle]"), "Each corner toggle");
  assert.equal(styleRef.patches, 0, "no patch on mount/open");
  assert.equal(cornerInput(host, "topLeft"), null, "no corner inputs offered");
  const note = host.querySelector("[data-builder-corner-radius-foreign]");
  assert.ok(note?.textContent?.includes(exotic), "the value is shown verbatim");
  assert.equal(styleRef.value?.borderRadius, exotic);
  unmount(root, host);
});

// ── 4. Per-side border widths ────────────────────────────────────────────────

test("border sides: a top-only rule writes the shorthand; four distinct sides now fit the cap", () => {
  const { root, host } = mount((vs, patch) =>
    createElement(BorderSidesField, {
      value: vs?.borderWidth,
      onChange: (next) => patch({ borderWidth: next }),
    }),
  );
  click(host.querySelector("[data-builder-border-sides-toggle]"), "Each side toggle");
  setInput(host.querySelector("[data-builder-border-side='top']"), "1", "top input");
  assert.equal(styleRef.value?.borderWidth, "1px 0 0");
  setInput(host.querySelector("[data-builder-border-side='right']"), "11", "right input");
  setInput(host.querySelector("[data-builder-border-side='bottom']"), "12", "bottom input");
  setInput(host.querySelector("[data-builder-border-side='top']"), "10", "top input");
  setInput(host.querySelector("[data-builder-border-side='left']"), "13", "left input");
  assert.equal(styleRef.value?.borderWidth, "10px 11px 12px 13px");
  assert.equal(
    host.querySelector("[data-builder-border-sides-overcap]"),
    null,
    "realistic per-side values no longer blow the cap",
  );
  unmount(root, host);
});

test("border sides: mobile tier writes land in responsive.mobile, base untouched", () => {
  const base: BuilderNodeStyle = { borderWidth: "2px" };
  const { root, host } = mount(
    (vs, patch) =>
      createElement(BorderSidesField, {
        value: vs?.borderWidth,
        onChange: (next) => patch({ borderWidth: next }),
      }),
    base,
    "mobile",
  );
  click(host.querySelector("[data-builder-border-sides-toggle]"), "Each side toggle");
  setInput(host.querySelector("[data-builder-border-side='top']"), "4", "top input");
  assert.equal(styleRef.value?.responsive?.mobile?.borderWidth, "4px 2px 2px");
  assert.equal(styleRef.value?.borderWidth, "2px", "base untouched");
  unmount(root, host);
});

// ── 5. Multi-stop gradients ──────────────────────────────────────────────────

const LEGACY_TWO_STOP = "linear-gradient(180deg, #111111, #222222)";

function segButton(host: HTMLElement, label: string): HTMLElement | null {
  return (
    Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    ) ?? null
  );
}

test("gradient: a legacy two-stop value parses; add/reorder/conic all emit the patched string", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(GradientStopsBuilder, {
        value: vs?.backgroundImage,
        onChange: (next) => patch({ backgroundImage: next }),
      }),
    { backgroundImage: LEGACY_TWO_STOP },
  );
  assert.equal(styleRef.patches, 0, "mounting emits no patch");
  assert.equal(
    host.querySelector("[data-builder-gradient-stops-apply]"),
    null,
    "a parseable value needs no Apply step",
  );
  // Add a third stop.
  click(host.querySelector("[data-builder-gradient-stops-add]"), "add stop");
  assert.equal(
    styleRef.value?.backgroundImage,
    "linear-gradient(180deg, #111111, #222222, #ffffff 100%)",
  );
  // Reorder: move stop 1 down.
  click(host.querySelector("[data-builder-gradient-stops-move-down='0']"), "move stop 1 down");
  assert.equal(
    styleRef.value?.backgroundImage,
    "linear-gradient(180deg, #222222, #111111, #ffffff 100%)",
  );
  // Switch to conic — stops survive, the wrapper changes.
  click(segButton(host, "Conic"), "Conic segment");
  assert.equal(
    styleRef.value?.backgroundImage,
    "conic-gradient(from 180deg, #222222, #111111, #ffffff 100%)",
  );
  // And a conic value round-trips: the angle field still drives it.
  setInput(
    host.querySelector("[data-builder-gradient-stops-field='angle']"),
    "45",
    "angle input",
  );
  assert.equal(
    styleRef.value?.backgroundImage,
    "conic-gradient(from 45deg, #222222, #111111, #ffffff 100%)",
  );
  unmount(root, host);
});

test("gradient: a url() background is never rewritten on mount; Apply is an explicit gesture", () => {
  const url = "url(https://example.com/hero.jpg)";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(GradientStopsBuilder, {
        value: vs?.backgroundImage,
        onChange: (next) => patch({ backgroundImage: next }),
      }),
    { backgroundImage: url },
  );
  assert.equal(styleRef.patches, 0, "mounting emits no patch");
  assert.equal(styleRef.value?.backgroundImage, url);
  assert.ok(
    host.querySelector("[data-builder-gradient-stops-apply]"),
    "the builder offers Apply instead of clobbering",
  );
  unmount(root, host);
});

// ── 6. The values these gestures store render as real CSS ────────────────────

function renderCard(style: BuilderNodeStyle): string {
  const nodes: BuilderNode[] = [
    {
      id: "c1",
      kind: "container",
      props: { children: [], style },
    } as unknown as BuilderNode,
  ];
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform" }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

test("renderer: the stored shorthands actually emit as CSS", () => {
  const html = renderCard({
    borderRadius: "16px 16px 0 0",
    borderWidth: "1px 0 0",
    borderStyle: "solid",
    borderColor: "#e5e5e5",
    boxShadow: `${PRESET_M}, 0px 8px 40px 0px rgba(0,0,0,0.18)`,
    backdropFilter: "blur(12px) saturate(1.4)",
  });
  assert.ok(html.includes("border-radius:16px 16px 0 0"), `border-radius in ${html}`);
  assert.ok(html.includes("border-width:1px 0 0"), `border-width in ${html}`);
  assert.ok(
    html.includes("0 6px 16px rgba(18,18,18,0.12), 0px 8px 40px 0px rgba(0,0,0,0.18)"),
    `layered box-shadow in ${html}`,
  );
  assert.ok(html.includes("backdrop-filter:blur(12px) saturate(1.4)"), `backdrop in ${html}`);
});

test("renderer: elliptical radius and text-shadow stacks emit as CSS", () => {
  const html = renderCard({
    borderRadius: "16px / 8px",
    textShadow: "0px 2px 8px rgba(0,0,0,0.4), 0px 0px 2px #111",
    filter: "blur(8px) grayscale(0.4)",
    mixBlendMode: "difference",
  });
  assert.ok(html.includes("border-radius:16px / 8px"), `elliptical radius in ${html}`);
  assert.ok(html.includes("text-shadow:0px 2px 8px"), `text-shadow in ${html}`);
  assert.ok(html.includes("filter:blur(8px) grayscale(0.4)"), `filter in ${html}`);
  assert.ok(html.includes("mix-blend-mode:difference"), `blend in ${html}`);
});

test("filter: a hand-authored invert value is shown verbatim and never rewritten", () => {
  const exotic = "blur(4px) invert(1)";
  const { root, host } = mount(
    (vs, patch) =>
      createElement(FilterField, { value: vs?.filter, onPatch: patch }),
    { filter: exotic },
  );
  assert.equal(styleRef.patches, 0, "mounting over an exotic value emits no patch");
  const raw = host.querySelector("[data-builder-filter-raw]") as HTMLInputElement;
  assert.equal(raw.value, exotic, "raw input shows the value verbatim");
  assert.equal(host.querySelector("[data-builder-filter-field='blur']"), null);
  assert.ok(host.querySelector("[data-builder-filter-foreign]"));
  assert.equal(styleRef.value?.filter, exotic);
  unmount(root, host);
});

test("filter: owned blur edits recompose only filter; mobile lands in the bucket", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(FilterField, { value: vs?.filter, onPatch: patch }),
    { filter: "blur(8px)" },
    "mobile",
  );
  assert.equal(styleRef.patches, 0);
  setInput(host.querySelector("[data-builder-filter-field='blur']"), "12", "blur");
  assert.equal(styleRef.value?.responsive?.mobile?.filter, "blur(12px)");
  assert.equal(styleRef.value?.filter, "blur(8px)", "base untouched");
  unmount(root, host);
});

test("text-shadow stack: add appends a layer without rewriting the existing one", () => {
  const { root, host } = mount(
    (vs, patch) =>
      createElement(ShadowStackBuilder, {
        kind: "text",
        value: vs?.textShadow,
        onChange: (next) => patch({ textShadow: next }),
      }),
    { textShadow: "0 2px 8px rgba(0,0,0,0.4)" },
  );
  assert.equal(styleRef.patches, 0);
  click(host.querySelector("[data-builder-shadow-layer-add]"), "add text shadow");
  assert.ok(
    styleRef.value?.textShadow?.startsWith("0 2px 8px rgba(0,0,0,0.4), "),
    "existing layer byte-identical",
  );
  unmount(root, host);
});
