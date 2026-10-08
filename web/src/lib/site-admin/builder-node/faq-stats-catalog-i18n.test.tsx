/**
 * TUL-207: FAQ, stats and the services catalog can hold a translation.
 *
 * Per kind: an ES visitor reads the ES overlay, an EN visitor the EN overlay,
 * no overlay (or no contentLocale) renders the base text, and a tree without
 * overlays renders byte-identical markup. For the catalog's category tabs the
 * text comes from live data (`category_i18n`), so the loader mapping
 * (`rowToOffering`) and the render are covered here too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { rowToOffering, type TalentOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

import { categoryLabelFor } from "./catalog-category-label";
import { createBuilderNode } from "./create";
import {
  renderBuilderNodes,
  type BuilderNodeContentLocaleOptions,
  type BuilderNodeRenderDataSources,
} from "./render";
import type { BuilderNode, BuilderNodeKind } from "./types";

const ES: BuilderNodeContentLocaleOptions = { locale: "es", defaultLocale: "en", chain: ["en"] };
const EN: BuilderNodeContentLocaleOptions = { locale: "en", defaultLocale: "es", chain: ["es"] };
/** A Spanish-primary site read in Spanish (the base text is Spanish). */
const ES_BASE: BuilderNodeContentLocaleOptions = { locale: "es", defaultLocale: "es", chain: [] };

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources = {},
  contentLocale?: BuilderNodeContentLocaleOptions,
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(contentLocale ? { contentLocale } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

type Overlay = Record<string, Record<string, string>>;

function node(kind: BuilderNodeKind, id: string, props: Record<string, unknown>, i18n?: Overlay, children?: BuilderNode[]): BuilderNode {
  const base = createBuilderNode(kind);
  return {
    ...base,
    id,
    props: { ...base.props, ...props, ...(i18n ? { i18n } : {}) },
    ...(i18n ? { i18n } : {}),
    ...(children ? { children } : {}),
  } as BuilderNode;
}

// ── stats ───────────────────────────────────────────────────────────────────

const STATS_ITEMS = [
  { label: "Response", value: "Within 1 day", caption: "Usually faster" },
  { label: "Warranty", value: "6 months" },
];

const STATS_OVERLAY_ES: Record<string, string> = {
  "items.0.label": "Respuesta",
  "items.0.value": "En 1 o 2 dias",
  "items.0.caption": "Casi siempre antes",
  "items.1.label": "Garantia",
  headline: "En numeros",
};

for (const variant of ["row", "spec"] as const) {
  const props = { variant, animate: false, headline: "In numbers", items: STATS_ITEMS };
  const plain = node("stats", "s1", props);
  const withEs = node("stats", "s1", props, { es: STATS_OVERLAY_ES });
  const withEn = node("stats", "s1", { ...props, items: [{ label: "Respuesta", value: "En 2 dias" }] }, {
    en: { "items.0.label": "Response", "items.0.value": "In 2 days" },
  });

  test(`stats (${variant}): no overlay or no contentLocale is byte-identical`, () => {
    const base = render([plain]);
    assert.ok(base.includes("Response") && base.includes("Within 1 day"));
    assert.equal(render([withEs]), base, "an overlay nobody asked for changes nothing");
    assert.equal(render([plain], {}, ES), base, "a locale with no overlay changes nothing");
  });

  test(`stats (${variant}): an ES visitor reads the ES overlay, base where none`, () => {
    const html = render([withEs], {}, ES);
    for (const s of ["Respuesta", "En 1 o 2 dias", "Garantia"]) assert.ok(html.includes(s), `missing ${s}`);
    for (const gone of ["Response", "Within 1 day", "Warranty"]) assert.ok(!html.includes(gone), `${gone} still rendered`);
    assert.ok(html.includes("6 months"), "a value with no overlay keeps its base text");
  });

  test(`stats (${variant}): an EN visitor reads the EN overlay on a Spanish base`, () => {
    const html = render([withEn], {}, EN);
    assert.ok(html.includes("Response") && html.includes("In 2 days"));
    assert.ok(!html.includes("Respuesta") && !html.includes("En 2 dias"));
  });
}

test("stats (row): the headline overlay still works next to the cell overlays", () => {
  const n = node("stats", "s2", { variant: "row", animate: false, headline: "In numbers", items: STATS_ITEMS }, { es: STATS_OVERLAY_ES });
  const html = render([n], {}, ES);
  assert.ok(html.includes("En numeros") && html.includes("Respuesta"));
});

// ── FAQ (accordion / accordion_item) ───────────────────────────────────────

function faq(i18nQuestion?: Overlay, i18nAnswer?: Overlay): BuilderNode {
  const answer = node("paragraph", "a1", { text: "Four to six weeks." }, i18nAnswer);
  const item = node("accordion_item", "q1", { title: "How long do extensions last?" }, i18nQuestion, [answer]);
  return node("accordion", "faq", {}, undefined, [item]);
}

test("faq: no overlay is byte-identical, with or without a contentLocale", () => {
  const base = render([faq()]);
  assert.ok(base.includes("How long do extensions last?") && base.includes("Four to six weeks."));
  assert.equal(render([faq()], {}, ES), base);
});

test("faq: an ES visitor reads the ES question and answer, an EN visitor the EN ones", () => {
  const es = faq({ es: { title: "Cuanto duran las extensiones?" } }, { es: { text: "De cuatro a seis semanas." } });
  const html = render([es], {}, ES);
  assert.ok(html.includes("Cuanto duran las extensiones?") && html.includes("De cuatro a seis semanas."));
  assert.ok(!html.includes("How long do extensions last?"));

  const spanishBase = node("accordion_item", "q2", { title: "Cuanto duran?" }, { en: { title: "How long do they last?" } }, [
    node("paragraph", "a2", { text: "Un mes." }, { en: { text: "One month." } }),
  ]);
  const enHtml = render([node("accordion", "faq2", {}, undefined, [spanishBase])], {}, EN);
  assert.ok(enHtml.includes("How long do they last?") && enHtml.includes("One month."));
  assert.ok(!enHtml.includes("Cuanto duran?") && !enHtml.includes("Un mes."));
});

test("faq: a bound accordion draws the (already localized) rows it is given", () => {
  const bound = node("accordion", "faq3", { bindSource: "talent_faq_items" });
  const html = render([bound], {
    talentFaqItems: [{ id: "f1", question: "How long?", answer: "A month.", sort_order: 0 }],
  }, ES);
  assert.ok(html.includes("How long?") && html.includes("A month."));
});

// ── services_catalog ────────────────────────────────────────────────────────

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Gel",
    description: null,
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
    imageUrls: [],
    variants: [],
    addOns: [],
    ...partial,
  };
}

const OFFERINGS: TalentOffering[] = [
  offering({ id: "o1", title: "Gel", category: "Uñas" }),
  offering({ id: "o2", title: "Corte", category: "Pestañas" }),
];
const LABELLED: TalentOffering[] = [
  offering({ id: "o1", title: "Gel", category: "Uñas", categoryLabel: "Nails" }),
  offering({ id: "o2", title: "Corte", category: "Pestañas", categoryLabel: "Lashes" }),
];

const CATALOG_PROPS = { categoryNav: "pills", showCategory: true, ctaLabel: "Reservar ahora", title: "Servicios", subtitle: "Precios claros" };

test("services_catalog: category labels default to the category text", () => {
  const html = render([node("services_catalog", "c1", CATALOG_PROPS)], { talentOfferings: OFFERINGS }, EN);
  assert.ok(html.includes("Uñas") && html.includes("Pestañas"));
  assert.equal(
    render([node("services_catalog", "c1", CATALOG_PROPS)], { talentOfferings: OFFERINGS }),
    render([node("services_catalog", "c1", CATALOG_PROPS)], { talentOfferings: OFFERINGS }, EN),
    "no stored translation, no overlay: the EN visitor markup equals the plain markup",
  );
});

test("services_catalog: tab labels and row category lines read the per-language category", () => {
  const html = render([node("services_catalog", "c1", CATALOG_PROPS)], { talentOfferings: LABELLED }, EN);
  assert.ok(html.includes("Nails") && html.includes("Lashes"), "tabs");
  assert.ok(!html.includes(">Uñas<") && !html.includes(">Pestañas<"), "Spanish category text still drawn as a label");
});

test("services_catalog: section copy and the row button wording follow the overlay", () => {
  const overlay: Overlay = {
    en: { title: "Services", subtitle: "Clear prices", ctaLabel: "Book now" },
  };
  const n = node("services_catalog", "c2", CATALOG_PROPS, overlay);
  const en = render([n], { talentOfferings: OFFERINGS, talentOfferingsConfirmsByHand: false }, EN);
  assert.ok(en.includes("Services") && en.includes("Clear prices") && en.includes("Book now"));
  assert.ok(!en.includes("Reservar ahora") && !en.includes("Precios claros"));
  const es = render([n], { talentOfferings: OFFERINGS, talentOfferingsConfirmsByHand: false }, ES_BASE);
  assert.ok(es.includes("Reservar ahora") && es.includes("Precios claros"));
});

test("services_catalog: the empty-state line follows the overlay", () => {
  const n = node("services_catalog", "c3", { emptyMessage: "Aun no hay servicios." }, { en: { emptyMessage: "No services yet." } });
  assert.ok(render([n], {}, EN).includes("No services yet."));
  assert.ok(render([n], {}, ES_BASE).includes("Aun no hay servicios."));
});

test("categoryLabelFor picks the first labelled service of the category", () => {
  assert.equal(categoryLabelFor(LABELLED, "Uñas"), "Nails");
  assert.equal(categoryLabelFor(OFFERINGS, "Uñas"), undefined);
  assert.equal(categoryLabelFor(LABELLED, "Other"), undefined);
});

// ── loader mapping: category_i18n -> categoryLabel ──────────────────────────

function row(extra: Record<string, unknown>): TalentOfferingRow {
  return {
    id: "r1",
    talent_profile_id: "t1",
    owner_kind: "talent",
    tenant_id: null,
    kind: "service",
    title: "Gel",
    description: null,
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 1000,
    currency: "MXN",
    category: "Uñas",
    status: "published",
    visibility: "public",
    moderation_state: "approved",
    ...extra,
  } as unknown as TalentOfferingRow;
}

test("rowToOffering: category_i18n gives categoryLabel only when it differs", () => {
  // A category outside the platform dictionary with no stored translation stays as written (TUL-15).
  assert.equal(rowToOffering(row({ category: "Cuidado" }), "en").categoryLabel, undefined);
  assert.equal(rowToOffering(row({ category_i18n: { es: "Uñas", en: "Nails" } }), "en").categoryLabel, "Nails");
  assert.equal(rowToOffering(row({ category_i18n: { es: "Uñas", en: "Nails" } }), "es").categoryLabel, undefined);
  assert.equal(rowToOffering(row({ category: "Cuidado", category_i18n: { es: "Cuidado" } }), "en", [], ["en"]).categoryLabel, undefined);
  assert.equal(rowToOffering(row({ category_i18n: { es: "Uñas", en: "Nails" } }), "en").category, "Uñas", "the grouping key is untouched");
});
