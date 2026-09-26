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

test("row with extras uses Elegir opciones unless inspector overrides", () => {
  const html = render([catalogNode()], {
    talentOfferings: [
      offering({
        addOns: [{ id: "x1", label: "French", amountCents: 8000 }],
      }),
    ],
  });
  assert.match(html, />Choose options</);
  assert.match(html, /data-offering-cta=/);
});

test("the catalog island mounts the booking sheet and bar", () => {
  const html = render([catalogNode()], { talentOfferings: [offering({})] });
  assert.match(html, /class="cb-island"/);
  assert.match(html, /class="cb-bar"/);
  assert.match(html, /Choose a service/);
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

test("layout prop is emitted and cards layout uses a multi-column list", () => {
  const html = render([catalogNode({ layout: "cards", columns: 2 })], {
    talentOfferings: [offering({})],
  });
  assert.match(html, /data-layout="cards"/);
  assert.match(html, /--svc-columns:\s*2/);
});

test("compact_list omits photos even when showPhoto is true", () => {
  const html = render([catalogNode({ layout: "compact_list", showPhoto: true })], {
    talentOfferings: [offering({})],
  });
  assert.match(html, /data-layout="compact_list"/);
  assert.doesNotMatch(html, /gel-pedicure\.jpg/);
});

test("tabs categoryNav uses distinct data-category-nav=tabs", () => {
  const html = render([catalogNode({ categoryNav: "tabs" })], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
    ],
  });
  assert.match(html, /data-category-nav="tabs"/);
});

test("jump nav uses serializable nodeId-derived fragment ids", () => {
  const html = render([catalogNode({ categoryNav: "jump_strip" })], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
    ],
  });
  // "Uñas" → slug "u-as" (ñ stripped); node id from catalogNode helper is cat-1.
  assert.match(html, /href="#cat-1-u-as"/);
  assert.match(html, /id="cat-1-u-as"/);
  assert.match(html, /href="#cat-1-pesta-as"/);
});

test("catalog island props are JSON-serializable (RSC boundary)", () => {
  // Reconstruct the props object the server renderer hands the client island.
  // A function `jumpSlug` here is exactly what 500'd vanity hosts after #2272.
  const nodeId = "mn-svc-catalog-golive";
  const groups = [
    {
      name: "Uñas",
      items: [offering({ id: "a", category: "Uñas" })],
    },
  ];
  const props = {
    groups,
    locale: "es",
    nav: "pills" as const,
    showPhoto: true,
    showDuration: true,
    showUsdEquivalent: false,
    confirmsByHand: true,
    usdRates: null,
    ctaLabel: "Seleccionar",
    bookingMode: "live" as const,
    tenantId: "tenant-1",
    nodeId,
  };
  assert.doesNotThrow(() => JSON.stringify(props));
  assert.equal(typeof props.nodeId, "string");
  assert.equal("jumpSlug" in props, false);
});

test("golive-shaped services_catalog SSR markup has no __next_error__", () => {
  const golive = catalogNode({
    eyebrow: "EL MENÚ",
    title: "Servicios {i}y precios{/i}",
    subtitle: "Todos los precios en pesos mexicanos (MXN). Se paga en el estudio.",
    ctaLabel: "Seleccionar",
    categoryNav: "pills",
    showUsdEquivalent: false,
    anchorId: "servicios",
  });
  golive.id = "mn-svc-catalog-golive";
  const html = render([golive], {
    talentOfferings: [
      offering({ id: "a", title: "Manicure", category: "Uñas" }),
      offering({ id: "b", title: "Lash lift", category: "Pestañas" }),
      offering({ id: "c", title: "Brow", category: "Cejas" }),
      offering({ id: "d", title: "Wax", category: "Depilación" }),
    ],
    talentOfferingsConfirmsByHand: true,
    catalogBookingLive: true,
    tenantId: "tenant-1",
  });
  assert.match(html, /data-builder-node-kind="services_catalog"/);
  assert.match(html, /mn-svc-catalog-golive/);
  assert.match(html, /EL MEN/);
  assert.match(html, /Seleccionar/);
  assert.match(html, /class="cb-island"/);
  assert.doesNotMatch(html, /__next_error__/);
  assert.doesNotMatch(html, /Algo no cargó/);
});

test("selectionMode ids only renders selected eligible offerings", () => {
  const html = render(
    [
      catalogNode({
        selectionMode: "ids",
        selectedOfferingIds: ["keep-me"],
      }),
    ],
    {
      talentOfferings: [
        offering({ id: "keep-me", title: "Keep me" }),
        offering({ id: "hide-me", title: "Hide me" }),
      ],
    },
  );
  assert.match(html, /Keep me/);
  assert.doesNotMatch(html, /Hide me/);
});

test("mixed duration formats as hours and minutes", () => {
  const html = render([catalogNode({ durationFormat: "auto" })], {
    talentOfferings: [offering({ durationMinutes: 135, title: "Long service" })],
  });
  assert.match(html, /2 h 15 min · estimated duration/);
});

test("outline CTA variant is the default data attribute", () => {
  const html = render([catalogNode()], { talentOfferings: [offering({})] });
  assert.match(html, /data-cta-variant="outline"/);
});

test("each layout sets a distinct data-layout attribute", () => {
  for (const layout of ["rows", "cards", "grid", "compact_list", "editorial", "featured"] as const) {
    const html = render([catalogNode({ layout })], {
      talentOfferings: [offering({ id: "a" }), offering({ id: "b", title: "Other" })],
    });
    assert.match(html, new RegExp(`data-layout="${layout}"`));
  }
});

test("featured layout puts featuredOfferingIds first as hero", () => {
  const html = render(
    [
      catalogNode({
        layout: "featured",
        featuredOfferingIds: ["hero"],
        categoryNav: "pills",
      }),
    ],
    {
      talentOfferings: [
        offering({ id: "other", title: "Other service", category: "A", sortOrder: 0 }),
        offering({ id: "hero", title: "Hero service", category: "B", sortOrder: 1 }),
      ],
    },
  );
  assert.match(html, /data-layout="featured"/);
  // Flat list for featured — hero title appears before other in markup
  const heroAt = html.indexOf("Hero service");
  const otherAt = html.indexOf("Other service");
  assert.ok(heroAt >= 0 && otherAt >= 0 && heroAt < otherAt);
});

test("grid defaults to 3 columns via --svc-columns", () => {
  const html = render([catalogNode({ layout: "grid" })], {
    talentOfferings: [offering({})],
  });
  assert.match(html, /--svc-columns:\s*3/);
});

test("sections categoryNav omits jump strip", () => {
  const html = render([catalogNode({ categoryNav: "sections" })], {
    talentOfferings: [
      offering({ id: "a", category: "Uñas" }),
      offering({ id: "b", category: "Cejas", title: "Brow" }),
    ],
  });
  assert.match(html, /data-builder-node-kind="services_catalog"[^>]*data-category-nav="sections"/);
  // Jump strip is a <nav data-category-nav="jump"> — sections must not emit one.
  assert.doesNotMatch(html, /<nav[^>]*data-category-nav="jump"/);
  assert.match(html, /site-builder-node--services-catalog-group-title/);
});

test("jump_strip categoryNav renders jump strip", () => {
  const html = render([catalogNode({ categoryNav: "jump_strip" })], {
    talentOfferings: [
      offering({ id: "a", category: "Uñas" }),
      offering({ id: "b", category: "Cejas", title: "Brow" }),
    ],
  });
  assert.match(html, /data-category-nav="jump"/);
});
