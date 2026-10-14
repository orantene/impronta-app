import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode } from "./types";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { catalogPromoPrices } from "@/lib/promos/catalog-promo-prices";
import type { Promo } from "@/lib/promos/types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function catalogNode(props: Record<string, unknown> = {}): BuilderNode {
  const base = createBuilderNode("services_catalog");
  return { ...base, id: "cat-1", props: { ...base.props, ...props } } as BuilderNode;
}

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Gel pedicure",
    description: "Semi-permanent gel on toes.",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 30000,
    currency: "MXN",
    bookingMode: "instant",
    reserveMode: "deposit",
    depositPct: 25,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: 75,
    category: "Uñas",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: ["https://example.test/gel-pedicure.jpg"],
    variants: [],
    addOns: [],
    ...partial,
  };
}


const NOW = "2026-10-14T18:00:00Z";
function autoPromo(over: Partial<Promo> = {}): Promo {
  return {
    id: "promo-1", offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public",
    unlock: "auto", applies_on: "purchase", tz: "America/Mexico_City", ...over,
  };
}

test("promo prices: with no live promo the home catalog HTML is byte-identical", () => {
  const offerings = [offering({}), offering({ id: "off-2", title: "Manicure", amountCents: 25000 })];
  const before = render([catalogNode()], { talentOfferings: offerings });
  const empty = catalogPromoPrices(offerings, { promos: [], now: NOW, locale: "es" });
  assert.deepEqual(empty, {});
  assert.equal(render([catalogNode()], { talentOfferings: offerings, talentOfferingsPromoPrices: empty }), before);
  // A paused / code-only promo is not advertised: still identical.
  const hidden = catalogPromoPrices(offerings, { promos: [autoPromo({ unlock: "code", code: "X" })], now: NOW, locale: "es" });
  assert.deepEqual(hidden, {});
  assert.equal(render([catalogNode()], { talentOfferings: offerings, talentOfferingsPromoPrices: hidden }), before);
  // priceInMeta layout too.
  const meta = render([catalogNode({ pricePlacement: "meta" })], { talentOfferings: offerings });
  assert.equal(render([catalogNode({ pricePlacement: "meta" })], { talentOfferings: offerings, talentOfferingsPromoPrices: {} }), meta);
});

test("promo prices: a live auto promo strikes the list price on the card", () => {
  const offerings = [offering({}), offering({ id: "off-2", title: "Manicure", amountCents: 25000 })];
  const prices = catalogPromoPrices(offerings, { promos: [autoPromo({ target_ids: ["off-1"] })], now: NOW, locale: "es" });
  assert.deepEqual(Object.keys(prices), ["off-1"]);
  assert.equal(prices["off-1"]?.final_cents, 24000);
  const html = render([catalogNode()], { talentOfferings: offerings, talentOfferingsPromoPrices: prices });
  assert.match(html, /data-promo-price=""/);
  assert.match(html, /<s[^>]*>\$300/);
  assert.match(html, /data-promo-badge=""/);
  assert.equal((html.match(/data-promo-price=""/g) ?? []).length, 1, "only the promoted card changes");
});
