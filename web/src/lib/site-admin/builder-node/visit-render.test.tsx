/**
 * Shared `visit`: live service-area facts; hidden when empty.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { VISIT_CSS, mergeVisitFacts } from "./visit-block";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { TalentVisitFact } from "./visit-types";
import type { BuilderNode } from "./types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }),
  );
}

function fact(partial: Partial<TalentVisitFact> & Pick<TalentVisitFact, "label" | "value">): TalentVisitFact {
  return {
    icon: "place",
    ...partial,
  };
}

test("visit CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(VISIT_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("visit hides when there are no facts", () => {
  const node = createBuilderNode("visit");
  const html = render([node], { talentVisitFacts: [] });
  assert.match(html, /data-visit-empty="1"/);
  assert.match(html, /hidden/);
});

test("visit renders facts layout with labels", () => {
  const node = createBuilderNode("visit");
  (node.props as { layout?: string }).layout = "facts";
  const html = render([node], {
    talentVisitFacts: [
      fact({ label: "Where", value: "Polanco", icon: "place" }),
      fact({ label: "Languages", value: "Spanish · English", icon: "languages" }),
    ],
  });
  assert.match(html, /data-visit-layout="facts"/);
  assert.match(html, /Polanco/);
  assert.match(html, /Languages/);
  assert.match(html, /data-visit-empty="0"/);
  assert.doesNotMatch(html, /\shidden(?:[=/\s>]|$)/);
});

test("visit split shows map only when URL set", () => {
  const node = createBuilderNode("visit");
  Object.assign(node.props, {
    layout: "split",
    showMap: true,
    mapImageUrl: "https://example.com/map.png",
    mapCaption: "Polanco",
  });
  const html = render([node], {
    talentVisitFacts: [fact({ label: "Where", value: "Polanco" })],
  });
  assert.match(html, /data-visit-layout="split"/);
  assert.match(html, /data-visit-has-map="1"/);
  assert.match(html, /map\.png/);
  assert.match(html, /Polanco/);
});

test("authored facts: same label replaces the live fact; the rest go before Changes", () => {
  const live: TalentVisitFact[] = [
    { label: "Dónde", value: "Mérida", icon: "place" },
    { label: "Cambios", value: "Hasta 24 h antes", icon: "changes" },
  ];
  const out = mergeVisitFacts(live, [
    { label: "Anticipo", value: "Solo en pestañas", icon: "note" },
    { label: "dónde", value: "García Ginerés, Mérida", icon: "note" },
  ]);
  assert.deepEqual(
    out.map((f) => [f.label, f.value, f.icon]),
    [
      ["dónde", "García Ginerés, Mérida", "place"],
      ["Anticipo", "Solo en pestañas", "note"],
      ["Cambios", "Hasta 24 h antes", "changes"],
    ],
  );
});
