/**
 * Gridline G10 + G11: the spec table, the work-order portfolio layout and the
 * area card. Rendering, token-only CSS, and the privacy guarantee (no address
 * ever reaches the area card's markup, in any address mode).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ADDRESS_MODES,
  DEFAULT_LOCATION_SETTINGS,
  toPublicLocation,
  type AddressMode,
} from "@/lib/talent/location-settings";

import { AREA_CSS, areaChips } from "./area-block";
import { createBuilderNode } from "./create";
import { PORTFOLIO_WORK_ORDER_CSS, splitWorkOrderCaption } from "./portfolio-work-order";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import { SPEC_TABLE_CSS } from "./spec-table-block";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { BuilderNode, BuilderSpecTableNode, BuilderVisitNode } from "./types";
import { AREA_DEFAULT_PROPS } from "./visit-defaults";
import type { TalentVisitFact } from "./visit-types";

const SECRET = "Calle Privada 42, Piso 3";

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

test("G10/G11 CSS is token-only (no hex)", () => {
  for (const css of [SPEC_TABLE_CSS, PORTFOLIO_WORK_ORDER_CSS, AREA_CSS]) {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  }
});

// ── spec table ────────────────────────────────────────────────────────────

function specNode(rows: Array<{ label: string; value: string }>): BuilderNode {
  const n = createBuilderNode("spec_table") as BuilderSpecTableNode;
  return { ...n, props: { ...n.props, rows } } as BuilderNode;
}

test("spec_table renders a real table: th row headers, td values, 5-row strip var", () => {
  const rows = ["Voltaje", "Garantia", "Materiales", "Precio", "Pago"].map((label, i) => ({ label, value: `Valor ${i}` }));
  const html = render([specNode(rows)]);
  assert.match(html, /data-builder-node-kind="spec_table"/);
  assert.equal((html.match(/<th scope="row">/g) ?? []).length, 5);
  assert.match(html, /<td>Valor 4<\/td>/);
  assert.match(html, /--sb-spec-cols:5/);
  assert.match(html, /data-spec-empty="0"/);
});

test("spec_table container query matches the mockup tiers (strip from 900px)", () => {
  assert.match(SPEC_TABLE_CSS, /@container sbspec \(min-width:900px\)/);
  assert.match(SPEC_TABLE_CSS, /container:sbspec\/inline-size/);
  assert.match(SPEC_TABLE_CSS, /width:38%/);
});

test("spec_table drops half-filled rows and hides when none is left", () => {
  const html = render([specNode([{ label: "Solo etiqueta", value: "" }, { label: "", value: "Solo valor" }])]);
  assert.match(html, /data-spec-empty="1"/);
  assert.match(html, /\shidden(?:[=/\s>]|$)/);
  assert.doesNotMatch(html, /<table/);
});

// ── work-order portfolio ──────────────────────────────────────────────────

function shot(id: string, caption: string | null, alt = "Maria Lopez con el cliente"): TalentPortfolioShot {
  return {
    id,
    url: `https://example.test/${id}.jpg`,
    alt,
    caption,
    offeringId: "off-1",
    offeringTitle: "Cambio de tablero",
    albumId: null,
  };
}

function portfolioNode(): BuilderNode {
  const base = createBuilderNode("portfolio");
  return { ...base, id: "port-wo", props: { ...base.props, layout: "work_order" } } as BuilderNode;
}

test("work_order: job cards with a two-line caption, no link, no alt text", () => {
  const html = render([portfolioNode()], {
    talentPortfolioShots: [
      shot("a", "Cambio de tablero\nOT-0412 · San Pedro · 1 día"),
      shot("b", "Acometida\nOT-0377 · Guadalupe · 4 h"),
    ],
  });
  assert.match(html, /data-portfolio-layout="work_order"/);
  assert.equal((html.match(/class="sb-wo-job"/g) ?? []).length, 2);
  assert.match(html, /<figcaption><b>Cambio de tablero<\/b>OT-0412 · San Pedro · 1 día<\/figcaption>/);
  assert.doesNotMatch(html, /<a\s|<button/, "tiles never link to an offering");
  assert.doesNotMatch(html, /Maria Lopez/, "the shot alt (a person) never reaches the markup");
  assert.match(html, /alt=""/);
});

test("work_order: container query matches the mockup (6 columns, 4:5 tiles from 900px; 2 on a phone)", () => {
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /grid-template-columns:1fr 1fr/);
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /@container sbwo \(min-width:900px\)/);
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /repeat\(6,1fr\)/);
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /aspect-ratio:4\/5/);
});

test("work_order caption convention splits title and detail", () => {
  assert.deepEqual(splitWorkOrderCaption("Lampara\nOT-1 · Centro"), { title: "Lampara", detail: "OT-1 · Centro" });
  assert.deepEqual(splitWorkOrderCaption("Solo titulo"), { title: "Solo titulo", detail: "" });
  assert.deepEqual(splitWorkOrderCaption(null), { title: "", detail: "" });
});

// ── area card ─────────────────────────────────────────────────────────────

function areaNode(): BuilderNode {
  const base = createBuilderNode("visit") as BuilderVisitNode;
  return { ...base, props: { ...base.props, ...AREA_DEFAULT_PROPS } } as BuilderNode;
}

const travel: TalentVisitFact = {
  label: "Va a",
  value: "San Pedro · Guadalupe · Santa Catarina",
  icon: "travel",
  chips: ["San Pedro", "Guadalupe", "Santa Catarina"],
};

function publicLoc(mode: AddressMode) {
  return toPublicLocation(
    {
      ...DEFAULT_LOCATION_SETTINGS,
      addressMode: mode,
      zoneNeighbourhood: "Cumbres",
      arrivalNote: "Llego en camioneta blanca, avisa por WhatsApp.",
      exactAddress: SECRET,
    },
    "Monterrey",
  );
}

test("area card: chips from the travel fact, zone, travel note and a token-coloured grid svg", () => {
  const html = render([areaNode()], { talentVisitFacts: [travel], talentLocation: publicLoc("zone_only") });
  assert.match(html, /data-visit-layout="area"/);
  assert.match(html, /data-area-empty="0"/);
  for (const c of ["San Pedro", "Guadalupe", "Santa Catarina"]) assert.match(html, new RegExp(`<li>${c}</li>`));
  assert.match(html, /<svg[^>]*viewBox="0 0 320 150"/);
  assert.match(html, /<pattern id="sb-area-grid-/);
  assert.match(html, /var\(--token-color-accent/);
  assert.match(html, /Llego en camioneta blanca/);
  assert.match(html, /Approximate area: Cumbres, Monterrey/);
});

test("area card: ES copy on a Spanish site", () => {
  const html = render([areaNode()], { talentVisitFacts: [travel], talentLocation: publicLoc("zone_only") }, "es");
  assert.match(html, /Zona aproximada: Cumbres, Monterrey\. No es una dirección\./);
  assert.match(html, /aria-label="Zonas que cubro"/);
});

test("area card: no address leaks in any address mode (markup, attrs, links)", () => {
  for (const mode of ADDRESS_MODES) {
    const html = render([areaNode()], { talentVisitFacts: [travel], talentLocation: publicLoc(mode) });
    assert.doesNotMatch(html, /Calle Privada/, `${mode}: address text`);
    assert.doesNotMatch(html, /Piso 3/, `${mode}: address part`);
    assert.doesNotMatch(html, /exactAddress|exact_address/, `${mode}: field name`);
    assert.doesNotMatch(html, /<a\s/, `${mode}: the area card has no directions link`);
  }
});

test("area card: the privacy gate still scrubs an address typed into the note", () => {
  const loc = toPublicLocation(
    { ...DEFAULT_LOCATION_SETTINGS, addressMode: "zone_only", zoneNeighbourhood: "Cumbres", arrivalNote: `Estoy en ${SECRET}`, exactAddress: SECRET },
    "Monterrey",
  );
  const html = render([areaNode()], { talentVisitFacts: [travel], talentLocation: loc });
  assert.doesNotMatch(html, /Calle Privada/);
});

test("area card hides with neither a zone nor a chip", () => {
  const html = render([areaNode()], { talentVisitFacts: [], talentLocation: null });
  assert.match(html, /data-area-empty="1"/);
  assert.match(html, /\shidden(?:[=/\s>]|$)/);
  assert.doesNotMatch(html, /<svg/);
});

test("areaChips de-duplicates and ignores non-travel facts", () => {
  const dup: TalentVisitFact = { label: "x", value: "x", icon: "travel", chips: ["A", "a", " B "] };
  const place: TalentVisitFact = { label: "Where", value: "Z", icon: "place", chips: ["Nope"] };
  assert.deepEqual(areaChips([dup, place]), ["A", "B"]);
});

test("the area drawing is deterministic for a zone and differs between zones", () => {
  const a1 = render([areaNode()], { talentLocation: publicLoc("zone_only"), talentVisitFacts: [travel] });
  const a2 = render([areaNode()], { talentLocation: publicLoc("zone_only"), talentVisitFacts: [travel] });
  assert.equal(a1, a2);
  const other = toPublicLocation({ ...DEFAULT_LOCATION_SETTINGS, zoneNeighbourhood: "Obispado" }, "Monterrey");
  assert.notEqual(a1, render([areaNode()], { talentLocation: other, talentVisitFacts: [travel] }));
});
