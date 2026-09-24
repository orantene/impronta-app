/**
 * D-MSG-421 — menu_board USD hint. Kept beside native-data-blocks.test.ts so
 * that file stays under the 800-line lint cap.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/native-data-blocks-usd.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  renderBuilderNodes,
  type BuilderNodeRenderDataSources,
} from "./render";
import type { BuilderNode } from "./types";

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources = {},
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function menuNode(): BuilderNode {
  return {
    id: "menu-1",
    kind: "menu_board",
    props: {},
  } as BuilderNode;
}

const mxnOffering = {
  id: "menu-mxn",
  title: "Gel semipermanente",
  description: null,
  amountCents: 30000,
  currency: "MXN",
  priceType: "flat_package",
  priceDisplay: "exact",
  kind: "service",
  unitsLeft: null,
  allowPayInPerson: true,
};

test("menu_board prints ≈ US$ beside an MXN price when rates are present", () => {
  const html = render([menuNode()], {
    tenantId: "tenant-menu-a",
    usdRates: { rateDate: "2026-09-23", perUsd: { MXN: 18.5 } },
    menuOfferings: [mxnOffering],
  });
  assert.match(html, /Gel semipermanente/);
  assert.match(html, /data-usd-equivalent/);
  assert.match(html, /≈ US\$/);
});

test("menu_board prints no dollar guess when an MXN price has no rates", () => {
  const html = render([menuNode()], {
    tenantId: "tenant-menu-a",
    menuOfferings: [mxnOffering],
  });
  assert.match(html, /Gel semipermanente/);
  assert.doesNotMatch(html, /data-usd-equivalent/);
  assert.doesNotMatch(html, /≈ US\$/);
});
