/**
 * hover-v2.wired.test.tsx — B6: click the real hover controls, assert stored
 * style, and assert the renderer emits :hover / parent-hover CSS that matches.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/inspectors/style-panel/hover-v2.wired.test.tsx
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

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

import {
  renderBuilderNodes,
  BuilderNodeRendererStyles,
} from "@/lib/site-admin/builder-node/render";
import type { BuilderNode, BuilderNodeStyle } from "@/lib/site-admin/builder-node";
import { CHROME } from "../../kit/tokens";
import { StateStyleFields } from "../style-panel-state-style-fields";
import {
  styleWithHoverPatch,
  type StyleCleaners,
} from "./viewport-style-patch";
import { readHoverLane, type HoverLaneStyle } from "./hover-lane";
import type { NodeViewport } from "./section-types";
/* eslint-enable import/first */

const PASS_THROUGH_CLEANERS: StyleCleaners = {
  cleanStyle: (v) => v as BuilderNodeStyle | undefined,
  cleanValue: (v) => v,
};

const styleRef: { value: BuilderNodeStyle | undefined } = { value: undefined };

function Harness({
  viewport,
  initial,
}: {
  viewport: NodeViewport;
  initial?: BuilderNodeStyle;
}) {
  const [style, setStyle] = useState<BuilderNodeStyle | undefined>(initial);
  useEffect(() => {
    styleRef.value = style;
  }, [style]);
  const hover = readHoverLane(style, viewport);
  return createElement(StateStyleFields, {
    state: "default",
    hoverStyle: hover,
    focusStyle: undefined,
    activeStyle: undefined,
    onPatchHover: (patch: Partial<HoverLaneStyle>) => {
      setStyle((cur) =>
        styleWithHoverPatch(cur, viewport, patch, PASS_THROUGH_CLEANERS),
      );
    },
    onPatchFocus: () => undefined,
    onPatchActive: () => undefined,
    chromeMuted: CHROME.muted,
    chromeSurface2: CHROME.surface2,
    chromeControlBorder: CHROME.controlBorder,
    chromeInk: CHROME.ink,
  });
}

async function mount(viewport: NodeViewport, initial?: BuilderNodeStyle) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  styleRef.value = initial;
  await act(async () => {
    root.render(createElement(Harness, { viewport, initial }));
  });
  return { host, root };
}

async function unmount(root: Root, host: HTMLDivElement) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

function typeInto(host: HTMLElement, field: string, value: string) {
  const wrap = host.querySelector(`[data-builder-hover-field="${field}"]`);
  assert.ok(wrap, `missing hover field ${field}`);
  const input = wrap.querySelector("input:not([type=checkbox])") as HTMLInputElement | null;
  assert.ok(input, `missing input for ${field}`);
  const desc = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    "value",
  );
  assert.ok(desc?.set, `${field} has a value setter`);
  desc.set.call(input, value);
  const propsKey = Object.keys(input).find((k) => k.startsWith("__reactProps"));
  assert.ok(propsKey, `${field} carries React props`);
  const props = (input as unknown as Record<
    string,
    { onChange?: (e: { target: HTMLInputElement }) => void }
  >)[propsKey];
  assert.ok(props?.onChange, `${field} has a wired onChange`);
  act(() => {
    props.onChange?.({ target: input });
  });
}

test("desktop hover filter click writes style.hover.filter and renderer emits :hover CSS", async () => {
  const { host, root } = await mount("desktop");
  typeInto(host, "filter", "blur(8px)");
  typeInto(host, "backgroundColor", "#111111");
  const parentWrap = host.querySelector(
    '[data-builder-hover-field="parentHover"]',
  );
  assert.ok(parentWrap);
  const checkbox = parentWrap.querySelector('input[type="checkbox"]');
  assert.ok(checkbox);
  const checkboxEl = checkbox as HTMLInputElement;
  const propsKey = Object.keys(checkboxEl).find((k) =>
    k.startsWith("__reactProps"),
  );
  assert.ok(propsKey, "parentHover checkbox carries React props");
  const props = (
    checkboxEl as unknown as Record<
      string,
      { onChange?: (e: { target: HTMLInputElement }) => void }
    >
  )[propsKey];
  checkboxEl.checked = true;
  await act(async () => {
    props?.onChange?.({ target: checkboxEl });
  });

  assert.equal(styleRef.value?.hover?.filter, "blur(8px)");
  assert.equal(styleRef.value?.hover?.backgroundColor, "#111111");
  assert.equal(
    (styleRef.value?.hover as HoverLaneStyle | undefined)?.parentHover,
    true,
  );

  const tree: BuilderNode[] = [
    {
      id: "parent",
      kind: "container",
      props: { layout: "stack" },
      children: [
        {
          id: "child",
          kind: "heading",
          props: {
            text: "Hi",
            level: 2,
            style: styleRef.value,
          },
        },
      ],
    },
  ];
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(BuilderNodeRendererStyles, {
        kinds: new Set(["container", "heading"]),
      }),
      renderBuilderNodes(tree, { includeRendererStyles: false }),
    ),
  );
  assert.match(html, /data-builder-style-hover-filter/);
  assert.match(html, /data-builder-style-parent-hover/);
  assert.match(html, /--bn-hover-filter:blur\(8px\)/);
  assert.match(html, /:hover/);
  assert.match(
    html,
    /\.site-builder-node:hover>\.site-builder-node\[data-builder-style-parent-hover\]/,
  );

  await unmount(root, host);
});

test("tablet hover writes style.responsive.tablet.hover and leaves desktop hover alone", async () => {
  const { host, root } = await mount("tablet", {
    hover: { backgroundColor: "#000000" },
  });
  typeInto(host, "filter", "grayscale(1)");
  assert.equal(styleRef.value?.hover?.backgroundColor, "#000000");
  assert.equal(
    (styleRef.value?.responsive?.tablet as { hover?: HoverLaneStyle } | undefined)
      ?.hover?.filter,
    "grayscale(1)",
  );
  assert.equal(
    (styleRef.value?.hover as HoverLaneStyle | undefined)?.filter,
    undefined,
    "a tablet hover write must not snap the desktop hover lane",
  );

  const tree: BuilderNode[] = [
    {
      id: "h",
      kind: "heading",
      props: {
        text: "Hi",
        level: 2,
        style: styleRef.value,
      },
    },
  ];
  const html = renderToStaticMarkup(
    createElement(
      "div",
      null,
      createElement(BuilderNodeRendererStyles, {
        kinds: new Set(["heading"]),
      }),
      renderBuilderNodes(tree, { includeRendererStyles: false }),
    ),
  );
  assert.match(html, /data-builder-style-tablet-hover-filter/);
  assert.match(html, /--bn-tablet-hover-filter:grayscale\(1\)/);
  assert.match(html, /@media \(max-width:900px\)/);

  await unmount(root, host);
});
