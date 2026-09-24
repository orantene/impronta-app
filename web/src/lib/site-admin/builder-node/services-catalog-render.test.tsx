/**
 * `services_catalog` — real widget, not the display-only MVP stub.
 *
 * This is the same render-to-static-markup technique `native-data-blocks.test.ts`
 * uses for `menu_board` et al.: no dev server, no DB, no browser — pass
 * `dataSources.talentOfferings` directly and assert on the emitted HTML. What
 * matters, in order:
 *
 *   1. it reuses `OfferingCta` (`data-offering-cta` / `data-offering-id`), the
 *      SAME client island the hub-profile storefront uses, so Select is a real
 *      click-to-book action wherever this renders — never a dead <button>;
 *   2. price, USD-equivalent, duration and photo respect their show* props;
 *   3. the defensive re-filter holds (draft / agency_only / unapproved never
 *      reach the markup, even if a caller's dataSources forgot to filter);
 *   4. category grouping only appears at 2+ categories, matching
 *      `TalentStorefront`'s own "a single category needs no filter" rule;
 *   5. the empty state renders instead of a blank section.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode } from "./types";
import type { TalentOffering } from "@/lib/talent/offerings-types";

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

test("services_catalog renders a real OfferingCta, not a dead button", () => {
  const html = render([catalogNode()], { talentOfferings: [offering({})] });
  assert.match(html, /data-offering-cta=/, "must render the real click-to-book island");
  assert.match(html, /data-offering-id="off-1"/);
  assert.match(html, /Gel pedicure/);
  assert.match(html, /300/, "price must be printed (300 MXN)");
});

test("USD-equivalent line only appears when rates are supplied and showUsdEquivalent is not false", () => {
  const withRates = render([catalogNode()], {
    talentOfferings: [offering({})],
    talentOfferingsUsdRates: { rateDate: "2026-01-01", perUsd: { MXN: 17.5 } },
  });
  assert.match(withRates, /<span class="site-builder-node--services-catalog-usd"/);

  const withoutRates = render([catalogNode()], { talentOfferings: [offering({})] });
  assert.doesNotMatch(withoutRates, /<span class="site-builder-node--services-catalog-usd"/, "no rates ⇒ no guessed line");

  const suppressed = render([catalogNode({ showUsdEquivalent: false })], {
    talentOfferings: [offering({})],
    talentOfferingsUsdRates: { rateDate: "2026-01-01", perUsd: { MXN: 17.5 } },
  });
  assert.doesNotMatch(suppressed, /<span class="site-builder-node--services-catalog-usd"/);
});

test("a draft / agency_only / unapproved offering never reaches the markup even if dataSources forgot to filter", () => {
  const html = render([catalogNode()], {
    talentOfferings: [
      offering({ id: "draft-1", title: "Draft item", status: "draft" }),
      offering({ id: "agency-1", title: "Agency only item", visibility: "agency_only" }),
      offering({ id: "unmoderated-1", title: "Unmoderated item", moderationState: "pending" }),
      offering({ id: "ok-1", title: "Visible item" }),
    ],
  });
  assert.doesNotMatch(html, /Draft item/);
  assert.doesNotMatch(html, /Agency only item/);
  assert.doesNotMatch(html, /Unmoderated item/);
  assert.match(html, /Visible item/);
});

test("category nav appears only at 2+ categories; a single category renders flat", () => {
  const oneCategory = render([catalogNode()], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Pedicure", category: "Uñas" }),
    ],
  });
  assert.doesNotMatch(oneCategory, /<nav[^>]*services-catalog-nav/);

  const twoCategories = render([catalogNode()], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
    ],
  });
  assert.match(twoCategories, /<nav[^>]*services-catalog-nav/);
  assert.match(twoCategories, /data-category-nav="pills"/);
  assert.match(twoCategories, /data-catalog-tab="Uñas"/);
  assert.match(twoCategories, /data-catalog-tab="Pestañas"/);
  assert.match(twoCategories, />Uñas</);
  assert.match(twoCategories, />Pestañas</);
  assert.match(twoCategories, /hidden="" data-catalog-category="Pestañas"/);
});

test("categoryNav: 'none' always renders flat, even at 2+ categories", () => {
  const html = render([catalogNode({ categoryNav: "none" })], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
    ],
  });
  assert.doesNotMatch(html, /<nav[^>]*services-catalog-nav/);
  assert.match(html, /Manicure/);
  assert.match(html, /Lash lift/);
});

test("empty catalogue renders the empty state, never a blank section", () => {
  const html = render([catalogNode()], { talentOfferings: [] });
  assert.match(html, /No services are published yet\.|Todavía no hay servicios publicados\./);
});

test("a product's price row omits '· N min', a service's does not", () => {
  const html = render([catalogNode()], {
    talentOfferings: [
      offering({ id: "svc", title: "Facial", kind: "service", durationMinutes: 60 }),
      offering({ id: "prod", title: "Serum", kind: "product", durationMinutes: null, priceDisplay: "exact" }),
    ],
  });
  assert.match(html, /Facial[\s\S]*?1 h · estimated duration/);
  assert.doesNotMatch(html.split("Serum")[1]?.slice(0, 280) ?? "", /\d+ min|estimated duration/);
});

test("italic {i} markers render as em, never as raw braces", () => {
  const html = render([catalogNode({ title: "Servicios {i}y precios{/i}" })]);
  assert.match(html, /Servicios <em>y precios<\/em>/);
  assert.doesNotMatch(html, /\{i\}|\{\/i\}/);
});

test("ctaLabel overrides the OfferingCta text", () => {
  const html = render([catalogNode({ ctaLabel: "Seleccionar" })], {
    talentOfferings: [offering({})],
  });
  assert.match(html, />Seleccionar</);
});

test("category_order wins over first-seen order in the pill strip", () => {
  const html = render([catalogNode()], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
    ],
    talentOfferingsCategoryOrder: ["Pestañas", "Uñas"],
  });
  const pest = html.indexOf('data-catalog-tab="Pestañas"');
  const unas = html.indexOf('data-catalog-tab="Uñas"');
  assert.ok(pest >= 0 && unas >= 0 && pest < unas);
});
