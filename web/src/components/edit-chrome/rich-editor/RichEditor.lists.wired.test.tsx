/**
 * RichEditor.lists.wired.test.tsx — B4: drive the real list control, assert
 * the patch lands, and the published renderer emits a real <ul>.
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/rich-editor/RichEditor.lists.wired.test.tsx
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
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
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Text = dom.window.Text;
g.Range = dom.window.Range;
g.DocumentFragment = dom.window.DocumentFragment;
g.MutationObserver = dom.window.MutationObserver;
g.CustomEvent = dom.window.CustomEvent;
g.Event = dom.window.Event;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.getSelection = () => dom.window.getSelection();
g.document.createRange = () => dom.window.document.createRange();
g.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { RichEditor } from "./RichEditor";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node";
/* eslint-enable import/first */

function flush(): Promise<void> {
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

test("clicking Bullet list writes a real list onto the node and the renderer emits <ul>", async () => {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  let root: Root | null = null;
  const captured: { value: string } = { value: "" };

  function Harness() {
    const [value, setValue] = useState("Shop {b}this{/b}");
    captured.value = value;
    return createElement(RichEditor, {
      value,
      onChange: setValue,
      variant: "multi",
      ariaLabel: "Body",
    });
  }

  await act(async () => {
    root = createRoot(host);
    root.render(createElement(Harness));
  });
  await flush();

  const editable = host.querySelector('[contenteditable="true"]');
  assert.ok(editable, "the Lexical surface must be in the editor");
  await act(async () => {
    (editable as HTMLElement).focus();
  });

  const button = host.querySelector('[data-rich-list="ul"]');
  assert.ok(button, "the real Bullet list control must be in the editor");
  const propsKey = Object.keys(button).find((k) => k.startsWith("__reactProps"));
  assert.ok(propsKey, "Bullet list control carries React props");
  const props = (
    button as unknown as Record<string, { onClick?: () => void }>
  )[propsKey];
  assert.ok(props?.onClick, "Bullet list control has a wired onClick");
  await act(async () => {
    props.onClick?.();
  });
  await flush();

  assert.match(
    captured.value,
    /\{ul\}\{li\}/,
    "the stored patch must carry list markers, not a fake bullet glyph",
  );
  assert.match(captured.value, /\{b\}this\{\/b\}/);

  const tree: BuilderNode[] = [
    {
      id: "p1",
      kind: "paragraph",
      props: { text: captured.value },
    },
  ];
  const html = renderToStaticMarkup(
    renderBuilderNodes(tree, { includeRendererStyles: false }),
  );
  assert.match(html, /<ul[\s>]/);
  assert.match(html, /<li[\s>]/);
  assert.equal(html.includes("{ul}"), false, "published HTML must not leak markers");
  assert.match(html, /<strong>this<\/strong>/);

  await act(async () => {
    root?.unmount();
  });
  host.remove();
});
