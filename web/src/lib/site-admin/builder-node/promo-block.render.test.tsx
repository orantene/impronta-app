import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PromoWidgetData, WidgetPromo } from "@/lib/promos/widgets/types";

import { createBuilderNode } from "./create";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { renderBuilderNodes } from "./render";
import type { BuilderPromoNode } from "./types";
import { validateBuilderNodeTree } from "./validate";

const PID = "00000000-0000-4000-8000-0000000000a1";
const wp = (over: Partial<WidgetPromo> = {}): WidgetPromo => ({
  id: PID, offerKind: "percent", value: 20, currency: "MXN", unlock: "auto", audience: "public", scope: "all",
  tz: "America/Mexico_City", code: null, endsAtMs: null, showCountdown: false, showOnSite: true, title: null,
  description: null, left: null, ...over,
});
const data = (items: WidgetPromo[], preview = false): PromoWidgetData => ({ items, nowMs: 1_000, ...(preview ? { preview } : {}) });

function html(node: BuilderPromoNode, promoWidgets?: PromoWidgetData, locale = "en") {
  return renderToStaticMarkup(
    createElement("div", null, renderBuilderNodes([node], { mode: "freeform", visitorLocale: locale, dataSources: { promoWidgets } })),
  );
}
const make = (props: Partial<BuilderPromoNode["props"]> = {}): BuilderPromoNode => {
  const n = createBuilderNode("promo") as BuilderPromoNode;
  return { ...n, props: { ...n.props, ...props } };
};

test("the promo kind is registered, seeds a valid node and satisfies its own schema", () => {
  const entry = BUILDER_NODE_REGISTRY.promo;
  assert.ok(entry);
  assert.equal(entry.children.type, "none");
  const node = createBuilderNode("promo");
  assert.equal(node.kind, "promo");
  assert.equal(entry.propsSchema.safeParse(node.props).success, true);
  assert.equal(validateBuilderNodeTree([node]).ok, true);
});

test("the schema refuses off-site links, bad dates and out-of-range numbers", () => {
  const ok = (props: Record<string, unknown>) => BUILDER_NODE_REGISTRY.promo.propsSchema.safeParse(props).success;
  assert.equal(ok({ ctaHref: "#services" }), true);
  assert.equal(ok({ ctaHref: "//evil.example" }), false);
  assert.equal(ok({ ctaHref: "https://evil.example" }), false);
  assert.equal(ok({ startsAt: "2026-10-31" }), true);
  assert.equal(ok({ startsAt: "tomorrow" }), false);
  assert.equal(ok({ delaySec: 500 }), false);
  assert.equal(ok({ maxCards: 9 }), false);
  assert.equal(ok({ variant: "mystery" }), false);
  assert.equal(ok({ promoId: "not-a-uuid" }), false);
});

test("with no promo data the block publishes hidden (kind marker kept, nothing visible)", () => {
  for (const d of [undefined, data([])]) {
    const out = html(make(), d);
    assert.match(out, /data-builder-node-kind="promo"/);
    assert.match(out, /data-promo-state="empty"/);
    assert.match(out, /hidden=""/);
    assert.ok(!out.includes("pw-"), "no widget CSS or markup for an empty block");
  }
});

test("the editor preview explains an empty block instead of hiding it", () => {
  const out = html(make(), data([], true), "en");
  assert.match(out, /you have no live promo/);
  assert.ok(!/hidden=""/.test(out));
});

test("a live promo renders the island shell with its CSS, kind marker and anchor", () => {
  const node = { ...make({ variant: "banner" }), anchorId: "offer" } as BuilderPromoNode;
  const out = html(node, data([wp()]));
  assert.match(out, /data-builder-node-kind="promo"/);
  assert.match(out, /data-promo-state="live"/);
  assert.match(out, /data-promo-widget="banner"/);
  assert.match(out, /\.pw\{/);
  assert.match(out, /id="offer"/);
});

test("the code of a code promo never reaches the HTML of a block that shows another promo", () => {
  const other = wp({ id: "00000000-0000-4000-8000-0000000000b2", unlock: "code", code: "SECRET10", value: 5 });
  const out = html(make({ promoId: PID }), data([wp(), other]));
  assert.ok(!out.includes("SECRET10"));
});

test("a block that points at a promo that is no longer live shows nothing, not a different offer", () => {
  const out = html(make({ promoId: PID }), data([wp({ id: "00000000-0000-4000-8000-0000000000c3" })]));
  assert.match(out, /data-promo-state="empty"/);
});

test("auto-pick needs 'show on my site'; an explicit choice does not", () => {
  const offSite = wp({ showOnSite: false });
  assert.match(html(make(), data([offSite])), /data-promo-state="empty"/);
  assert.match(html(make({ promoId: PID }), data([offSite])), /data-promo-state="live"/);
});

test("every variant renders without throwing", () => {
  for (const variant of ["banner", "cards", "reveal", "countdown", "popup", "sticky", "book"] as const) {
    const out = html(make({ variant }), data([wp({ unlock: "code", code: "LUZ10" })]));
    assert.match(out, new RegExp(`data-promo-widget="${variant}"`));
  }
});

test("no em dashes in the shipped promo copy", async () => {
  const { widgetCopy } = await import("@/lib/promos/widgets/copy");
  for (const loc of ["es", "en"]) {
    const c = widgetCopy(loc);
    const text = JSON.stringify([
      c.showCode, c.copyCode, c.copied, c.codeLabel, c.autoApplied, c.bookWithOffer, c.codeCopiedBook("X"), c.close,
      c.endsIn, c.left(2), c.regionLabel, c.noPromoHint, c.getOffer("x"), c.offerShort("percent", 10, "MXN"),
    ]);
    assert.ok(!text.includes("—"), loc);
  }
});
