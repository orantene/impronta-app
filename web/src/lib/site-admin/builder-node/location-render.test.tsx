/**
 * Shared `visit` in the "location" layout: the three address modes, the zone
 * placeholder map, and the privacy guarantee on everything it emits (markup,
 * links, attributes). The live map is a later task: the "Ver mapa" button must
 * not exist while the flag is off.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ADDRESS_MODES,
  DEFAULT_LOCATION_SETTINGS,
  toPublicLocation,
  type AddressMode,
  type LocationSettings,
} from "@/lib/talent/location-settings";

import { createBuilderNode } from "./create";
import { LOCATION_CSS, LOCATION_LIVE_MAP_ENABLED, renderLocationBlock } from "./location-block";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode, BuilderVisitNode } from "./types";
import { LOCATION_DEFAULT_PROPS } from "./visit-defaults";
import type { TalentVisitFact } from "./visit-types";

const SECRET = "Calle Privada 42, Piso 3";

function locNode(over: Partial<BuilderVisitNode["props"]> = {}): BuilderNode {
  const base = createBuilderNode("visit") as BuilderVisitNode;
  return { ...base, props: { ...base.props, ...LOCATION_DEFAULT_PROPS, ...over } } as BuilderNode;
}

function settings(mode: AddressMode, over: Partial<LocationSettings> = {}): LocationSettings {
  return {
    ...DEFAULT_LOCATION_SETTINGS,
    addressMode: mode,
    zoneNeighbourhood: "Centro",
    arrivalNote: "Puerta verde",
    arrivalPhotoUrl: "https://photos.test/door.jpg",
    exactAddress: SECRET,
    ...over,
  };
}

function render(
  mode: AddressMode | null,
  opts: { locale?: string; kind?: LocationSettings["studioKind"]; facts?: TalentVisitFact[]; node?: BuilderNode } = {},
): string {
  const ds: BuilderNodeRenderDataSources = {
    talentLocation: mode ? toPublicLocation(settings(mode, { studioKind: opts.kind ?? "studio" }), "Mérida") : null,
    talentVisitFacts: opts.facts ?? [],
  };
  return renderToStaticMarkup(
    renderBuilderNodes([opts.node ?? locNode()], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      visitorLocale: opts.locale,
      dataSources: ds,
    }),
  );
}

test("location CSS and map use token vars only (no hex)", () => {
  assert.doesNotMatch(LOCATION_CSS, /#[0-9a-fA-F]{3,8}\b/);
  const html = render("zone_only");
  assert.doesNotMatch(html.replace(/href="[^"]*"/g, ""), /#[0-9a-fA-F]{3,8}\b/);
  assert.match(html, /var\(--token-color-accent/);
  assert.doesNotMatch(LOCATION_CSS, /[–—]/);
});

test("hidden when the talent has no zone yet (no invented place)", () => {
  const html = render(null);
  assert.match(html, /data-visit-empty="1"/);
  assert.match(html, /hidden/);
  assert.doesNotMatch(html, /sb-loc-card/);
  assert.doesNotMatch(html, /Mérida|M&#xE9;rida|Centro/);
});

test("zone only: shows the zone and a dashed area, never the address, never Como llegar", () => {
  const html = render("zone_only");
  assert.match(html, /data-location-mode="zone_only"/);
  assert.match(html, /Centro, M(é|&#xE9;)rida/);
  assert.match(html, /stroke-dasharray/);
  assert.match(html, /Approximate area/);
  assert.match(html, /Not published/);
  assert.doesNotMatch(html, /Get directions|C(ó|&#xF3;)mo llegar/);
  assert.match(html, /google\.com\/maps\/search\/\?api=1&amp;query=Centro/);
  assert.ok(!html.includes(SECRET) && !html.includes("Privada") && !html.includes("Calle%20Privada"));
});

test("exact address after booking: says so, shows no address", () => {
  const html = render("after_booking");
  assert.match(html, /We send you the exact location when you confirm/);
  assert.ok(!html.includes("Privada") && !html.includes("Piso"));
  assert.doesNotMatch(html, /Get directions/);
});

test("public address: the address, a pin instead of the dashed area, and directions", () => {
  const html = render("public");
  assert.match(html, /Calle Privada 42/);
  assert.match(html, /google\.com\/maps\/dir\/\?api=1&amp;destination=Calle%20Privada/);
  assert.match(html, /Get directions/);
  assert.doesNotMatch(html, /stroke-dasharray/);
});

test("NO LEAK: across every non-public mode nothing the talent typed as private reaches the markup", () => {
  for (const mode of ADDRESS_MODES) {
    if (mode === "public") continue;
    for (const locale of ["en", "es"]) {
      for (const kind of ["studio", "home_visits", "both"] as const) {
        const html = render(mode, { locale, kind });
        for (const fragment of ["Calle Privada", "Privada", "Piso 3", "Calle%20Privada"]) {
          assert.ok(!html.includes(fragment), `${mode}/${locale}/${kind}: ${fragment}`);
        }
      }
    }
  }
});

test("heading: eyebrow 'Tu visita' and 'Donde encontrarme' with an italic accent, EN and ES; editable", () => {
  const es = render("zone_only", { kind: "studio", locale: "es" });
  assert.match(es, /sb-loc-eyebrow[^>]*>Tu visita</);
  assert.match(es, /<h2[^>]*>D(ó|&#xF3;)nde <em>encontrarme<\/em><\/h2>/);
  const en = render("zone_only", { kind: "studio" });
  assert.match(en, /sb-loc-eyebrow[^>]*>Your visit</);
  assert.match(en, /<h2[^>]*>Where to <em>find me<\/em><\/h2>/);
  // "both" has a studio too, so it reads like the mockup's studio title; home visits only is "Voy a donde estes".
  assert.match(render("zone_only", { kind: "both", locale: "es" }), /encontrarme<\/em>/);
  assert.match(render("zone_only", { kind: "home_visits", locale: "es" }), /Voy a <em>donde est(é|&#xE9;)s<\/em>/);
  assert.match(render("zone_only", { kind: "home_visits" }), /I come <em>to you<\/em>/);
  // Editable: an authored heading (with its own italic word) and eyebrow win.
  const own = render("zone_only", { node: locNode({ title: "Find the studio", titleAccent: "studio", eyebrow: "Come by" }) });
  assert.match(own, /Find the <em>studio<\/em>/);
  assert.match(own, /sb-loc-eyebrow[^>]*>Come by</);
  // Sites seeded with an empty eyebrow still read "Tu visita".
  assert.match(render("zone_only", { locale: "es", node: locNode({ eyebrow: "" }) }), /sb-loc-eyebrow[^>]*>Tu visita</);
  // Design typography hooks: Maison v2 styles the shared visit classes.
  assert.match(es, /sb-visit-eyebrow/);
  assert.match(es, /sb-visit-title/);
});

test("details: the kind eyebrow, the zone as the title, 'Zona aproximada', then divided rows with icons", () => {
  const html = render("zone_only", {
    locale: "es",
    kind: "studio",
    facts: [{ label: "Hours", value: "Lun a sáb", icon: "hours", note: "9:00 a 20:00, con cita" }],
  });
  assert.match(html, /sb-loc-kind">Estudio</);
  assert.match(html, /sb-loc-where">Centro, M(é|&#xE9;)rida<small>Zona aproximada<\/small>/);
  // Rows: Zona / Direccion exacta / Horario / Al llegar, each with a lucide icon (svg), two lines.
  for (const title of ["Zona", "Dirección exacta", "Horario", "Al llegar"]) {
    assert.match(html.replace(/&#x([0-9A-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16))), new RegExp(`<b>${title}</b>`));
  }
  assert.equal((html.match(/class="sb-loc-row"/g) ?? []).length, 4);
  assert.equal((html.match(/class="lucide lucide-(map-pin|lock|clock|door-open)/g) ?? []).length, 4, "four real icons");
  assert.doesNotMatch(html, /[◷◉○]/, "no glyph stand-ins");
  assert.match(html, /Lun a sáb · 9:00 a 20:00, con cita|Lun a s(á|&#xE1;)b · 9:00 a 20:00, con cita/);
  assert.doesNotMatch(html, /\(aproximada\)/, "TUL-59 C: the parenthetical is gone; the small line under the title says it once");
  // Actions: the outlined map button and the policy link, nothing else.
  assert.match(html, /sb-loc-btn"[^>]*>Ver zona en el mapa</);
  assert.doesNotMatch(html, /Escribir/);
  const withPolicy = renderToStaticMarkup(
    renderLocationBlock({
      node: locNode() as BuilderVisitNode,
      location: toPublicLocation(settings("zone_only"), "Mérida"),
      facts: [],
      locale: "es",
      policyHref: "/politicas",
    }) as ReactElement,
  );
  assert.match(withPolicy, /href="\/politicas">Pagos, cambios y cancelaciones</);
});

test("the arrival note is its own row, clamped to two lines with 'Ver mas' when it is long", () => {
  const long = "Estudio privado en la planta alta, entra por el portón verde y toca el timbre dos veces. ".repeat(2);
  const loc = (note: string) =>
    renderToStaticMarkup(
      renderLocationBlock({
        node: locNode() as BuilderVisitNode,
        location: toPublicLocation(settings("zone_only", { arrivalNote: note, arrivalPhotoUrl: "" }), "Mérida"),
        facts: [],
        locale: "es",
      }) as ReactElement,
    );
  const longHtml = loc(long);
  assert.match(longHtml, /sb-loc-note-t" data-clamp="1"/);
  assert.match(longHtml, /Ver m(á|&#xE1;)s/);
  assert.match(longHtml, /Ver menos/);
  assert.match(LOCATION_CSS, /-webkit-line-clamp:2/);
  assert.match(LOCATION_CSS, /\.sb-loc-note:has\(\.sb-loc-more-c:checked\)/);
  const shortHtml = loc("Timbre verde.");
  assert.doesNotMatch(shortHtml, /Ver m(á|&#xE1;)s|sb-loc-more"/);
  assert.match(shortHtml, /Timbre verde\./);
  assert.doesNotMatch(loc(""), /Al llegar/);
});

test("responsive: two columns from 900px (1.2fr / 1fr, gap 40, map min 360), stacked on phones", () => {
  assert.match(LOCATION_CSS, /\.sb-loc \.sb-loc-grid\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(LOCATION_CSS, /@media \(min-width:900px\)\{[^@]*grid-template-columns:minmax\(0,1\.2fr\) minmax\(0,1fr\);gap:40px/);
  assert.match(LOCATION_CSS, /@media \(min-width:900px\)\{[^@]*\.sb-loc \.sb-loc-map\{aspect-ratio:auto;min-height:360px\}/);
  assert.match(LOCATION_CSS, /border-radius:18px/);
  assert.match(LOCATION_CSS, /\.sb-loc\[data-map-side="right"\] \.sb-loc-map\{order:2\}/);
});

test("the zone illustration is generated from the zone: stable, differs per zone, a street grid with the dashed zone and label", () => {
  const a1 = render("zone_only");
  assert.equal(a1, render("zone_only"));
  const other = renderToStaticMarkup(
    renderBuilderNodes([locNode()], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: { talentLocation: toPublicLocation(settings("zone_only", { zoneNeighbourhood: "Norte" }), "Oaxaca") },
    }),
  );
  const svg = (h: string) => h.match(/<svg[\s\S]*?<\/svg>/)![0];
  assert.notEqual(svg(a1), svg(other));
  assert.match(a1, /role="img"/);
  // Street grid: tinted ground, a green patch and white (surface) roads; the dashed circle; the zone label.
  assert.ok((svg(a1).match(/<path /g) ?? []).length >= 6, "a grid of roads");
  assert.match(svg(a1), /stroke-dasharray="6 6"/);
  assert.match(svg(a1), /<text[^>]*>Centro, M(é|&#xE9;)rida<\/text>/);
  assert.match(svg(a1), /MÉRIDA|M&#xC9;RIDA/);
  // Generic: no street or neighbourhood names that were not the talent's own, no fictional demo data.
  assert.doesNotMatch(svg(a1), /Paseo de Montejo|PASEO DE MONTEJO|Itzimn|Altabrisa|Garc(í|&#xED;)a Giner/);
  assert.doesNotMatch(svg(a1), /#[0-9a-fA-F]{3,8}\b/);
  // The tag chip names the zone and says it is not the address.
  assert.match(a1, /sb-loc-map-tag"><b>Centro, M(é|&#xE9;)rida<\/b>Approximate area, not the address/);
});

test("LIVE MAP slot: empty slot present; the View map button does not exist while the flag is off", () => {
  assert.equal(LOCATION_LIVE_MAP_ENABLED, false, "consent tooling has not shipped");
  const html = render("zone_only");
  assert.match(html, /data-location-map-slot/);
  assert.doesNotMatch(html, /data-location-map-open|Abrir mapa|Open interactive map/);
});

test("LIVE MAP slot: with the flag on the button shows (and follows the inspector switch)", () => {
  const loc = toPublicLocation(settings("zone_only"), "Mérida");
  const on = renderToStaticMarkup(
    renderLocationBlock({ node: locNode() as BuilderVisitNode, location: loc, facts: [], locale: "es", liveMapEnabled: true }) as ReactElement,
  );
  assert.match(on, /data-location-map-open/);
  assert.match(on, /Abrir mapa interactivo/);
  const off = renderToStaticMarkup(
    renderLocationBlock({
      node: locNode({ showMapButton: false }) as BuilderVisitNode,
      location: loc,
      facts: [],
      liveMapEnabled: true,
    }) as ReactElement,
  );
  assert.doesNotMatch(off, /data-location-map-open/);
});

test("map side and size are data attributes the CSS reads", () => {
  const html = render("zone_only", { node: locNode({ mapSide: "right", mapSize: "lg" }) });
  assert.match(html, /data-map-side="right"/);
  assert.match(html, /data-map-size="lg"/);
});

test("the map card's pill sits top-right and the tag bottom-left", () => {
  assert.match(LOCATION_CSS, /\.sb-loc-map-open\{position:absolute;right:10px;top:10px/);
  assert.match(LOCATION_CSS, /\.sb-loc-map-tag\{position:absolute;left:10px;bottom:10px/);
});

test("the facts and split layouts are untouched by the location data", () => {
  const node = createBuilderNode("visit");
  const html = renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {
        talentLocation: toPublicLocation(settings("public"), "Mérida"),
        talentVisitFacts: [{ label: "Where", value: "Mérida", icon: "place" }],
      },
    }),
  );
  assert.match(html, /sb-visit/);
  assert.doesNotMatch(html, /sb-loc/);
  assert.doesNotMatch(html, /Calle Privada/);
});
