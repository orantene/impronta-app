/**
 * Gridline G7 + G8: the hero spec block (stats `spec` variant + kit factory)
 * and the services comparison matrix. Render, structure (table on wide, cards
 * on narrow), the live emergency column, typed fields, and token-only CSS.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { heroSpecBlock } from "@/lib/talent-site/theme-catalog/section-kit";
import {
  offeringMatrixFromAttributes,
  offeringMatrixValue,
  patchOfferingMatrix,
} from "@/lib/talent/offering-matrix";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import { SERVICES_MATRIX_CSS } from "./services-catalog-matrix";
import { STATS_SPEC_CSS } from "./stats-spec-block";
import type { BuilderNode, BuilderStatsNode } from "./types";
import { validateBuilderNodeTree } from "./validate";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}, locale?: string): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(locale ? { visitorLocale: locale } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function ids(): () => string {
  let n = 0;
  return () => `g7-${(n += 1)}`;
}

// ── G7: stats spec variant ────────────────────────────────────────────────

function specNode(items: Array<{ label: string; value: string }>): BuilderNode {
  const n = createBuilderNode("stats") as BuilderStatsNode;
  return { ...n, props: { ...n.props, variant: "spec", animate: false, items } } as BuilderNode;
}

const FOUR = [
  { label: "Respuesta", value: "24 h" },
  { label: "Garantía", value: "6 meses" },
  { label: "Precio", value: "Antes de empezar" },
  { label: "Revisión", value: "$550" },
];

test("stats spec: four typed cells, label before value, no count-up script", () => {
  const html = render([specNode(FOUR)]);
  assert.match(html, /data-bn-stats-variant="spec"/);
  assert.equal((html.match(/class="sb-sspec-cell"/g) ?? []).length, 4);
  assert.match(html, /<dt class="sb-sspec-label">Respuesta<\/dt><dd class="sb-sspec-value">24 h<\/dd>/);
  assert.match(html, /--sb-sspec-cols:4/);
  assert.doesNotMatch(html, /<script/, "typed values never animate or compute");
  assert.doesNotMatch(html, /data-bn-stat-to/);
});

test("stats spec: an incomplete cell is dropped, and no complete cell hides the block", () => {
  const partial = render([specNode([...FOUR.slice(0, 2), { label: "Precio", value: "" }, { label: "", value: "x" }])]);
  assert.equal((partial.match(/class="sb-sspec-cell"/g) ?? []).length, 2);
  const none = render([specNode([{ label: "Precio", value: " " }])]);
  assert.match(none, /data-spec-empty="1"/);
  assert.match(none, /hidden=""/);
  assert.doesNotMatch(none, /sb-sspec-cell/);
});

test("stats spec: phone is a 2-column grid, desktop a one-row-per-cell strip (container query)", () => {
  assert.match(STATS_SPEC_CSS, /\.sb-sspec-grid\{[^}]*grid-template-columns:1fr 1fr/);
  assert.match(STATS_SPEC_CSS, /@container sbstatsspec \(min-width:600px\)\{[^]*repeat\(var\(--sb-sspec-cols,4\),minmax\(0,1fr\)\)/);
  assert.doesNotMatch(STATS_SPEC_CSS, /#[0-9a-fA-F]{3,8}\b/);
});

test("the stats node with variant spec validates (schema layer)", () => {
  const r = validateBuilderNodeTree([specNode(FOUR)]);
  assert.equal(r.ok, true, JSON.stringify((r as { issues?: unknown }).issues));
});

// ── G7: hero kit factory ──────────────────────────────────────────────────

test("heroSpecBlock: kicker, wide headline with accent words, spec grid, CTA pair, who card", () => {
  const hero = heroSpecBlock(ids(), {
    headline: "Instalaciones seguras, {i}con garantía por escrito.{/i}",
    specs: FOUR,
    ctaRow: {
      primaryLabel: "Ver horarios",
      primaryHref: "#services",
      secondaryLabel: "¿Qué necesitas?",
      secondaryHref: "#pick",
    },
    badges: ["12 años", "Casas y locales"],
  });
  const props = hero.props as { slotKey?: string; originRole?: string; anchorId?: string };
  assert.equal(props.slotKey, "hero");
  assert.equal(props.originRole, "talent.hero");
  assert.equal(props.anchorId, "hero");
  const html = render([hero]);
  assert.match(html, /<h1[^>]*>.*<em>con garantía por escrito\.<\/em>/);
  assert.equal((html.match(/class="sb-sspec-cell"/g) ?? []).length, 4);
  assert.match(html, /Ver horarios/);
  assert.match(html, /href="#pick"[^>]*>[^<]*¿Qué necesitas\?|¿Qué necesitas\?/);
  assert.match(html, /\{\{displayName\}\}/, "who card keeps the name token");
  assert.match(html, /12 años/);
  assert.match(html, /Casas y locales/);
});

test("heroSpecBlock: no typed spec cells and no badges makes no claim", () => {
  const hero = heroSpecBlock(ids());
  const html = render([hero]);
  assert.doesNotMatch(html, /sb-sspec-cell/);
  assert.doesNotMatch(html, /24 h|6 meses|Garantía/);
  const json = JSON.stringify(hero);
  assert.doesNotMatch(json, /#[0-9a-fA-F]{3,8}\b/, "token-only style");
  assert.doesNotMatch(json, /"fontFamily"/, "no raw font stack in the kit");
});

test("heroSpecBlock: the who card is a row on phone and a stacked photo card on desktop", () => {
  const hero = heroSpecBlock(ids(), { badges: ["x"] });
  const who = ((hero as BuilderNode & { children?: BuilderNode[] }).children ?? [])[1] as BuilderNode & {
    props: { layout: string; responsive?: { mobile?: { layout?: string } } };
  };
  assert.equal(who.props.layout, "stack", "desktop base is the stacked photo card");
  assert.equal(who.props.responsive?.mobile?.layout, "row", "phone is a row");
});

test("heroSpecBlock validates as a design tree (allowed kinds, schema)", () => {
  const hero = heroSpecBlock(ids(), { specs: FOUR, badges: ["a"], ctaRow: { primaryLabel: "A", primaryHref: "#s", secondaryLabel: "B" } });
  const r = validateBuilderNodeTree([hero]);
  assert.equal(r.ok, true, JSON.stringify((r as { issues?: unknown }).issues));
});

// ── G8: offering matrix fields ────────────────────────────────────────────

test("offering matrix fields: EN/ES pair, bare string, bad data fails closed", () => {
  const a = { matrix: { warranty: { en: "6 months", es: "6 meses" }, materials: "Brand on quote", emergency: true } };
  assert.equal(offeringMatrixValue(a, "warranty", "es-MX"), "6 meses");
  assert.equal(offeringMatrixValue(a, "warranty", "en"), "6 months");
  assert.equal(offeringMatrixValue(a, "materials", "es"), "Brand on quote");
  assert.equal(offeringMatrixValue(a, "response", "es"), "");
  assert.equal(offeringMatrixFromAttributes(a).emergency, true);
  assert.deepEqual(offeringMatrixFromAttributes({ matrix: "nope" }), {});
  assert.deepEqual(offeringMatrixFromAttributes({ matrix: [1] }), {});
  assert.deepEqual(offeringMatrixFromAttributes(null), {});
});

test("patchOfferingMatrix: edits one language, removes emptied fields and an emptied matrix", () => {
  let attrs: Record<string, unknown> = { where: ["client"] };
  attrs = patchOfferingMatrix(attrs, { key: "warranty", lang: "es", value: "6 meses" });
  assert.deepEqual(attrs.matrix, { warranty: { es: "6 meses" } });
  assert.deepEqual(attrs.where, ["client"], "other attributes survive");
  attrs = patchOfferingMatrix(attrs, { key: "warranty", lang: "en", value: "6 months" });
  attrs = patchOfferingMatrix(attrs, { key: "emergency", value: true });
  assert.deepEqual(attrs.matrix, { warranty: { es: "6 meses", en: "6 months" }, emergency: true });
  attrs = patchOfferingMatrix(attrs, { key: "warranty", lang: "es", value: "" });
  attrs = patchOfferingMatrix(attrs, { key: "warranty", lang: "en", value: "" });
  attrs = patchOfferingMatrix(attrs, { key: "emergency", value: false });
  assert.equal("matrix" in attrs, false);
});

// ── G8: matrix render ─────────────────────────────────────────────────────

function offering(partial: Partial<TalentOffering>): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Revisión eléctrica",
    description: "",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 55000,
    currency: "MXN",
    bookingMode: "instant",
    reserveMode: "free",
    depositPct: null,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: null,
    freeReserveExpiresDays: null,
    durationMinutes: 60,
    category: null,
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

const SERVICES: TalentOffering[] = [
  offering({
    id: "rev",
    title: "Revisión eléctrica",
    attributes: { matrix: { warranty: { es: "6 meses por escrito", en: "6 months in writing" }, response: { es: "24 h", en: "24 h" } } },
  }),
  offering({
    id: "lam",
    title: "Instalación de lámparas",
    amountCents: 35000,
    bookingMode: "request",
    durationMinutes: 45,
    attributes: { matrix: { warranty: { es: "3 meses", en: "3 months" } } },
  }),
  offering({
    id: "tab",
    title: "Cambio de tablero",
    amountCents: null,
    priceDisplay: "quote",
    priceType: "custom",
    bookingMode: "inquiry",
    durationMinutes: null,
  }),
  offering({
    id: "eme",
    title: "Emergencia",
    amountCents: null,
    priceDisplay: "quote",
    priceType: "custom",
    bookingMode: "inquiry",
    durationMinutes: null,
    attributes: { matrix: { emergency: true, response: { es: "Mismo día", en: "Same day" } } },
  }),
];

function matrixNode(): BuilderNode {
  const n = createBuilderNode("services_catalog");
  return { ...n, id: "mx-1", props: { ...n.props, layout: "matrix", categoryNav: "none", showStats: false } } as BuilderNode;
}

const LIVE_ON = { emergenciesToday: true, emergenciesUntil: "2099-01-01T00:00:00.000Z" };

test("matrix: a real table (sticky label column) AND stacked article cards from the same offerings", () => {
  const html = render([matrixNode()], { talentOfferings: SERVICES }, "es");
  assert.match(html, /data-layout="matrix"/);
  assert.match(html, /<table class="sb-mx-table">/);
  assert.equal((html.match(/<article class="sb-mx-card"/g) ?? []).length, 4, "one card per service");
  assert.equal((html.match(/<th scope="col"[^>]*>/g) ?? []).length, 5, "label corner + 4 services");
  assert.match(html, /<th scope="row">Precio<\/th>/);
  assert.match(html, /<th scope="row">Duración<\/th>/);
  assert.match(html, /<th scope="row">Cómo se agenda<\/th>/);
  assert.match(html, /<th scope="row">Garantía<\/th>/);
  assert.match(html, /<th scope="row">Respuesta<\/th>/);
  assert.match(SERVICES_MATRIX_CSS, /\.sb-mx-table tbody th\{position:sticky;left:0/);
  assert.match(SERVICES_MATRIX_CSS, /@container sbmx \(min-width:720px\)\{[^]*\.sb-mx-cards\{display:none\}/);
  assert.match(SERVICES_MATRIX_CSS, /\.sb-mx-scroll\{display:none/);
});

test("matrix: price, duration and booking mode come from the real offering", () => {
  const html = render([matrixNode()], { talentOfferings: SERVICES }, "es");
  assert.match(html, /550/);
  assert.match(html, /350/);
  assert.match(html, /A cotizar/);
  assert.match(html, /Reserva inmediata/);
  assert.match(html, /Con confirmación/);
  assert.match(html, /Por cotización/);
  assert.match(html, /1 h|60 min|1 hora/);
  assert.match(html, /6 meses por escrito/);
  assert.match(html, /Mismo día/);
  assert.match(html, /data-offering-id="rev"/, "CTA row opens the real booking island");
});

test("matrix: English locale uses English labels and typed text", () => {
  const html = render([matrixNode()], { talentOfferings: SERVICES }, "en");
  assert.match(html, /<th scope="row">Warranty<\/th>/);
  assert.match(html, /6 months in writing/);
  assert.match(html, /Instant booking/);
});

test("matrix: a typed row no service filled is dropped", () => {
  const html = render([matrixNode()], { talentOfferings: SERVICES }, "es");
  assert.doesNotMatch(html, /<th scope="row">Materiales<\/th>/, "nobody typed materials");
  const bare = render([matrixNode()], { talentOfferings: [offering({ id: "a" }), offering({ id: "b", title: "Otro" })] }, "es");
  assert.doesNotMatch(bare, /<th scope="row">(Materiales|Garantía|Respuesta)<\/th>/);
  assert.match(bare, /<th scope="row">Precio<\/th>/);
});

test("matrix: the emergency column is highlighted only while the live status is on", () => {
  const off = render([matrixNode()], { talentOfferings: SERVICES }, "es");
  assert.doesNotMatch(off, /data-live-when="on"/, "never emit on-markup while off");
  assert.match(off, /data-emergency="off"/);
  const on = render([matrixNode()], { talentOfferings: SERVICES, liveStatus: LIVE_ON }, "es");
  assert.match(on, /data-emergency="on"/);
  assert.match(on, /<span class="sb-mx-hl" data-live-when="on"/);
  assert.match(on, /<span class="sb-mx-ring" data-live-when="on"/, "phone card ring");
  // Only the flagged service carries the highlight.
  const hlCols = (on.match(/data-mx-emergency="1"/g) ?? []).length;
  assert.ok(hlCols >= 3, "header, cells and card of the emergency service");
});

test("matrix: no hex anywhere in the CSS, tokens only", () => {
  assert.doesNotMatch(SERVICES_MATRIX_CSS, /#[0-9a-fA-F]{3,8}\b/);
});

test("matrix: the sticky label column and 44px CTA targets", () => {
  assert.match(SERVICES_MATRIX_CSS, /\.sb-mx-cta\{[^}]*min-height:44px/);
});
