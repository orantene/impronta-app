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
  assert.match(html, /Only the area is shown/);
  assert.doesNotMatch(html, /Get directions|C(ó|&#xF3;)mo llegar/);
  assert.match(html, /google\.com\/maps\/search\/\?api=1&amp;query=Centro/);
  assert.ok(!html.includes(SECRET) && !html.includes("Privada") && !html.includes("Calle%20Privada"));
});

test("exact address after booking: says so, shows no address", () => {
  const html = render("after_booking");
  assert.match(html, /comes with your booking confirmation/);
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

test("title follows the studio kind, EN and ES; an authored title wins", () => {
  assert.match(render("zone_only", { kind: "studio" }), /Where to find me/);
  assert.match(render("zone_only", { kind: "home_visits" }), /I come to you/);
  assert.match(render("zone_only", { kind: "both" }), /Where I work/);
  assert.match(render("zone_only", { kind: "studio", locale: "es" }), /D(ó|&#xF3;)nde encontrarme/);
  assert.match(render("zone_only", { kind: "home_visits", locale: "es" }), /Voy a donde est(é|&#xE9;)s/);
  assert.match(render("zone_only", { kind: "both", locale: "es" }), /D(ó|&#xF3;)nde trabajo/);
  assert.match(render("zone_only", { node: locNode({ title: "Find the studio" }) }), /Find the studio/);
});

test("rows: hours link (from the live facts), address line, arrival note and photo", () => {
  const html = render("zone_only", {
    facts: [{ label: "Hours", value: "Mon to Fri", icon: "hours", note: "9:00 to 18:00, by appointment" }],
  });
  assert.match(html, /Mon to Fri/);
  assert.match(html, /href="#services"/);
  assert.match(html, /Puerta verde/);
  assert.match(html, /src="https:\/\/photos\.test\/door\.jpg"/);
});

test("actions: Escribir opens Messages on the page", () => {
  assert.match(render("zone_only", { locale: "es" }), /href="#talent-ask"[^>]*>Escribir</);
  assert.match(render("zone_only"), /href="#talent-ask"[^>]*>Message</);
  assert.match(render("public", { locale: "es" }), /C(ó|&#xF3;)mo llegar/);
});

test("the zone map placeholder is generated from the zone: stable, and different per zone", () => {
  const a1 = render("zone_only");
  const a2 = render("zone_only");
  assert.equal(a1, a2);
  const other = renderToStaticMarkup(
    renderBuilderNodes([locNode()], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: { talentLocation: toPublicLocation(settings("zone_only", { zoneNeighbourhood: "Norte" }), "Oaxaca") },
    }),
  );
  const path = (h: string) => h.match(/<svg[\s\S]*?<\/svg>/)![0];
  assert.notEqual(path(a1), path(other));
  assert.match(a1, /role="img"/);
  assert.doesNotMatch(a1, /M(é|&#xE9;)rida Centro Historico|Paseo de Montejo/);
});

test("LIVE MAP slot: empty slot present; the View map button does not exist while the flag is off", () => {
  assert.equal(LOCATION_LIVE_MAP_ENABLED, false, "consent tooling has not shipped");
  const html = render("zone_only");
  assert.match(html, /data-location-map-slot/);
  assert.doesNotMatch(html, /data-location-map-open|Ver mapa|View map/);
});

test("LIVE MAP slot: with the flag on the button shows (and follows the inspector switch)", () => {
  const loc = toPublicLocation(settings("zone_only"), "Mérida");
  const on = renderToStaticMarkup(
    renderLocationBlock({ node: locNode() as BuilderVisitNode, location: loc, facts: [], locale: "es", liveMapEnabled: true }) as ReactElement,
  );
  assert.match(on, /data-location-map-open/);
  assert.match(on, /Ver mapa/);
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
