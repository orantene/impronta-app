/**
 * device-frame-skeleton.test.tsx — TUL-397 render test.
 *
 * Skeleton shows at t=0 for an unloaded non-desktop tier and disappears after
 * the tier is marked loaded (iframe `load`).
 *
 * Run: npm run test:wt -- src/components/edit-chrome/device-frame-skeleton.test.tsx
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
  value: { ...dom.window.navigator, language: "en-US" },
  configurable: true,
});
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before these load */
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";
import {
  DeviceFrameSkeleton,
  useDeviceFrameLoadTracking,
} from "./device-frame-skeleton";
import type { EditDevice } from "./edit-context-types";
/* eslint-enable import/first */

function mount(
  device: EditDevice,
  loadedTiers: ReadonlySet<EditDevice>,
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      createElement(
        DashboardLocaleProvider as never,
        { locale: "en" } as never,
        createElement(DeviceFrameSkeleton, { device, loadedTiers }),
      ),
    );
  });
  return {
    host,
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("skeleton shows at t=0 for an unloaded tablet tier", () => {
  const m = mount("tablet", new Set());
  const el = m.host.querySelector("[data-device-frame-skeleton]");
  assert.ok(el, "expected data-device-frame-skeleton at t=0");
  assert.equal(el?.getAttribute("data-device-frame-skeleton"), "tablet");
  assert.ok(el?.querySelector("[data-device-frame-skeleton-bezel]"), "expected bezel");
  assert.equal(el?.getAttribute("aria-label"), "Loading preview…");
  m.unmount();
});

test("skeleton gone after the active tier is marked loaded", () => {
  const m = mount("tablet", new Set<EditDevice>(["tablet"]));
  assert.equal(m.host.querySelector("[data-device-frame-skeleton]"), null);
  m.unmount();
});

test("warm-kept loaded tablet skips skeleton when switching back", () => {
  const loaded = new Set<EditDevice>(["tablet", "mobile"]);
  const m = mount("tablet", loaded);
  assert.equal(m.host.querySelector("[data-device-frame-skeleton]"), null);
  m.unmount();
});

test("useDeviceFrameLoadTracking resets on pageVersion/pageSlug change", () => {
  function Probe({
    pageVersion,
    pageSlug,
    onReady,
  }: {
    pageVersion: number;
    pageSlug: string;
    onReady: (size: number) => void;
  }) {
    const { loadedTiers, markTierLoaded } = useDeviceFrameLoadTracking(
      pageVersion,
      pageSlug,
    );
    useEffect(() => {
      markTierLoaded("tablet");
    }, [pageVersion, pageSlug, markTierLoaded]);
    useEffect(() => {
      onReady(loadedTiers.size);
    }, [loadedTiers, onReady]);
    return null;
  }

  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sizes: number[] = [];
  act(() => {
    root.render(
      createElement(Probe, {
        pageVersion: 1,
        pageSlug: "home",
        onReady: (n) => {
          sizes.push(n);
        },
      }),
    );
  });
  // After markTierLoaded: size 1
  assert.ok(sizes.includes(1), `expected loaded size 1, got ${JSON.stringify(sizes)}`);

  act(() => {
    root.render(
      createElement(Probe, {
        pageVersion: 2,
        pageSlug: "home",
        onReady: (n) => {
          sizes.push(n);
        },
      }),
    );
  });
  // Reset then re-mark: a 0 (reset) then 1 again
  assert.ok(
    sizes.includes(0),
    `expected a reset to 0 after pageVersion change, got ${JSON.stringify(sizes)}`,
  );

  act(() => {
    root.unmount();
  });
  host.remove();
});
