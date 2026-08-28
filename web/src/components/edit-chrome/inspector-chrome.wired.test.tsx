/**
 * inspector-chrome.wired.test.tsx — A2: curated sections and freeform nodes
 * open the same inspector product (tabs from inspector-tab-config, StylePanel).
 *
 * Drives the real resolver the command rail AND the dock body call. Does not
 * import InspectorDock (that pulls the editor). The dock wiring is asserted
 * against source so a second tab map cannot silently return.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/inspector-chrome.wired.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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
g.HTMLButtonElement = dom.window.HTMLButtonElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  INSPECTOR_STYLE_MOUNT,
  INSPECTOR_TABS,
  inspectorTabItemsForKeys,
  resolveInspectorChrome,
  type InspectorStyleMount,
  type InspectorTabKey,
} from "./inspector-tab-config";
/* eslint-enable import/first */

const HERE = dirname(fileURLToPath(import.meta.url));

const HEADING_NODE = {
  id: "w4-a2-heading",
  kind: "heading" as const,
  props: { text: "Studio heading", level: "h2" as const },
};

const CONTAINER_NODE = {
  id: "w4-a2-container",
  kind: "container" as const,
  props: {},
  children: [],
};

/** Tabs both a CTA banner and a heading always offer (Layout hides when empty). */
const SHARED_CHROME_KEYS: ReadonlyArray<InspectorTabKey> = [
  "content",
  "style",
  "motion",
];

function inProductOrder(
  keys: ReadonlyArray<InspectorTabKey>,
): InspectorTabKey[] {
  const set = new Set(keys);
  return INSPECTOR_TABS.filter((t) => set.has(t.key)).map((t) => t.key);
}

function ChromeProbe({
  tabKeys,
  styleMount,
}: {
  tabKeys: ReadonlyArray<InspectorTabKey>;
  styleMount: InspectorStyleMount;
}) {
  const [tab, setTab] = useState<InspectorTabKey | null>(null);
  const items = inspectorTabItemsForKeys(tabKeys);
  return createElement(
    "div",
    { "data-inspector-chrome": "" },
    createElement(
      "div",
      { role: "tablist" },
      items.map((item) =>
        createElement(
          "button",
          {
            key: item.key,
            type: "button",
            role: "tab",
            "data-inspector-rail-tab": item.key,
            onClick: () => setTab(item.key),
          },
          item.label,
        ),
      ),
    ),
    tab === "style"
      ? createElement("div", { "data-inspector-style-mount": styleMount })
      : null,
  );
}

function mountChrome(input: {
  tabKeys: ReadonlyArray<InspectorTabKey>;
  styleMount: InspectorStyleMount;
}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(ChromeProbe, input));
  });
  return {
    host,
    clickTab(key: InspectorTabKey) {
      const btn = host.querySelector(`[data-inspector-rail-tab="${key}"]`);
      assert.ok(btn, `Missing tab button for ${key}`);
      act(() => {
        (btn as HTMLButtonElement).click();
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("curated cta_banner and freeform heading resolve the same chrome tab keys and StylePanel", () => {
  const cta = resolveInspectorChrome({
    sectionTypeKey: "cta_banner",
    selectedStandaloneBuilderNode: null,
  });
  const heading = resolveInspectorChrome({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: HEADING_NODE as never,
  });

  assert.deepEqual(
    [...cta.tabKeys],
    inProductOrder(cta.tabKeys),
    "cta_banner tabs must follow INSPECTOR_TABS order",
  );
  assert.deepEqual(
    [...heading.tabKeys],
    inProductOrder(heading.tabKeys),
    "heading tabs must follow INSPECTOR_TABS order",
  );

  const ctaShared = SHARED_CHROME_KEYS.filter((k) => cta.tabKeys.includes(k));
  const headingShared = SHARED_CHROME_KEYS.filter((k) =>
    heading.tabKeys.includes(k),
  );
  assert.deepEqual(ctaShared, [...SHARED_CHROME_KEYS]);
  assert.deepEqual(
    headingShared,
    ctaShared,
    `Expected the same chrome keys; cta=${JSON.stringify(cta.tabKeys)} heading=${JSON.stringify(heading.tabKeys)}`,
  );

  assert.equal(cta.styleMount, heading.styleMount);
  assert.equal(cta.styleMount, INSPECTOR_STYLE_MOUNT);
  assert.equal(heading.styleMount, "StylePanel");
});

test("curated cta_banner and freeform container share chrome keys and StylePanel", () => {
  const cta = resolveInspectorChrome({
    sectionTypeKey: "cta_banner",
    selectedStandaloneBuilderNode: null,
  });
  const container = resolveInspectorChrome({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: CONTAINER_NODE as never,
  });
  const ctaShared = SHARED_CHROME_KEYS.filter((k) => cta.tabKeys.includes(k));
  const containerShared = SHARED_CHROME_KEYS.filter((k) =>
    container.tabKeys.includes(k),
  );
  assert.deepEqual(containerShared, ctaShared);
  assert.ok(container.tabKeys.includes("layout"), "container keeps Layout");
  assert.ok(cta.tabKeys.includes("layout"), "cta_banner keeps Layout");
  assert.equal(cta.styleMount, container.styleMount);
  assert.equal(container.styleMount, "StylePanel");
});

test("clicking Style on a cta_banner and a heading mounts the same StylePanel chrome", () => {
  const cta = resolveInspectorChrome({
    sectionTypeKey: "cta_banner",
    selectedStandaloneBuilderNode: null,
  });
  const heading = resolveInspectorChrome({
    sectionTypeKey: null,
    selectedStandaloneBuilderNode: HEADING_NODE as never,
  });

  const ctaUi = mountChrome(cta);
  const headingUi = mountChrome(heading);
  try {
    ctaUi.clickTab("style");
    headingUi.clickTab("style");
    const ctaMount = ctaUi.host.querySelector("[data-inspector-style-mount]");
    const headingMount = headingUi.host.querySelector(
      "[data-inspector-style-mount]",
    );
    assert.equal(ctaMount?.getAttribute("data-inspector-style-mount"), "StylePanel");
    assert.equal(
      headingMount?.getAttribute("data-inspector-style-mount"),
      ctaMount?.getAttribute("data-inspector-style-mount"),
    );
  } finally {
    ctaUi.unmount();
    headingUi.unmount();
  }
});

test("inspector-dock uses the shared chrome resolver and mounts StylePanel", () => {
  const source = readFileSync(join(HERE, "inspector-dock.tsx"), "utf8");
  assert.ok(
    source.includes("useInspectorVisibleTabs"),
    "inspector-dock must read tabs from the shared hook, not a private map.",
  );
  assert.ok(
    !/TABS_BY_SECTION_TYPE/.test(source),
    "inspector-dock must not keep a second TABS_BY_SECTION_TYPE map.",
  );
  assert.ok(
    source.includes('styleMount === "StylePanel"'),
    "inspector-dock must gate the Style tab on the shared StylePanel mount.",
  );
  assert.ok(
    source.includes("./inspectors/style-panel"),
    "inspector-dock no longer imports StylePanel.",
  );
  assert.ok(
    source.includes("./inspectors/content-dispatch"),
    "Keep ContentTab / CtaBannerContentInspector; this item unifies chrome only.",
  );
});
