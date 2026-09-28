/**
 * Shared `comp_card`: measure strip from profile fields; hidden when empty.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { COMP_CARD_CSS, resolveCompCardDisplay } from "./comp-card-block";
import { COMP_CARD_DEFAULT_PROPS, cloneCompCardDefaultProps } from "./comp-card-defaults";
import type { TalentCompFieldRow } from "./comp-card-types";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderCompCardNode, BuilderNode } from "./types";

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources = {},
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }),
  );
}

function rows(partial: Partial<TalentCompFieldRow>[]): TalentCompFieldRow[] {
  return partial.map((r, i) => ({
    fieldKey: r.fieldKey ?? `field.${i}`,
    label: r.label ?? `Label ${i}`,
    value: r.value ?? String(i),
    group: r.group ?? "Physical",
    unit: r.unit ?? null,
  }));
}

const SAMPLE_ROWS = rows([
  { fieldKey: "physical.height_cm", label: "Height (cm)", value: "172 cm", group: "Physical" },
  { fieldKey: "physical.bust_cm", label: "Bust", value: "84 cm", group: "Physical" },
  { fieldKey: "physical.waist_cm", label: "Waist", value: "62 cm", group: "Physical" },
  { fieldKey: "physical.hips_cm", label: "Hips", value: "90 cm", group: "Physical" },
  { fieldKey: "physical.hair_color", label: "Hair color", value: "Brown", group: "Physical" },
  { fieldKey: "physical.eye_color", label: "Eye color", value: "Hazel", group: "Physical" },
  { fieldKey: "experience.years", label: "Years", value: "8", group: "Experience" },
]);

test("comp card CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(COMP_CARD_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("comp card hides when there are no public rows", () => {
  const node = createBuilderNode("comp_card");
  const html = render([node], { talentCompCard: { rows: [] } });
  assert.match(html, /data-comp-empty="1"/);
  assert.match(html, /data-builder-kind="comp_card"/);
});

test("comp card renders enabled measures with short labels and units", () => {
  const node = createBuilderNode("comp_card") as BuilderCompCardNode;
  const html = render([node], { talentCompCard: { rows: SAMPLE_ROWS } });
  assert.match(html, /data-comp-empty="0"/);
  assert.match(html, /data-comp-strip="1"/);
  assert.match(html, /Height/);
  assert.match(html, /172/);
  assert.match(html, /<small>cm<\/small>/);
  assert.match(html, /Bust/);
  assert.match(html, /Hair/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(html, /\u2014/);
});

test("comp card omits disabled measures even when source has values", () => {
  const node = createBuilderNode("comp_card") as BuilderCompCardNode;
  node.props.measures = (cloneCompCardDefaultProps().measures ?? []).map((m) =>
    m.fieldKey === "physical.bust_cm" ? { ...m, enabled: false } : m,
  );
  const html = render([node], { talentCompCard: { rows: SAMPLE_ROWS } });
  assert.doesNotMatch(html, />Bust</);
  assert.match(html, /Height/);
});

test("comp card below minMeasures hides strip but keeps details", () => {
  const node = createBuilderNode("comp_card") as BuilderCompCardNode;
  node.props.minMeasures = 8;
  node.props.showFullDetails = true;
  const few = rows([
    { fieldKey: "physical.height_cm", value: "170 cm", group: "Physical" },
    { fieldKey: "physical.bust_cm", value: "80 cm", group: "Physical" },
  ]);
  const html = render([node], { talentCompCard: { rows: few } });
  assert.match(html, /data-comp-strip="0"/);
  assert.match(html, /Full comp card/);
  assert.match(html, /170 cm/);
});

test("comp card showFullDetails false skips disclosure", () => {
  const node = createBuilderNode("comp_card") as BuilderCompCardNode;
  node.props.showFullDetails = false;
  node.props.layout = "strip";
  const html = render([node], { talentCompCard: { rows: SAMPLE_ROWS } });
  assert.doesNotMatch(html, /class="sb-comp-details"/);
  assert.match(html, /data-comp-strip="1"/);
});

test("resolveCompCardDisplay respects label overrides and locale", () => {
  const node = createBuilderNode("comp_card") as BuilderCompCardNode;
  node.props.measures = [
    {
      fieldKey: "physical.height_cm",
      enabled: true,
      labelEn: "Ht",
      labelEs: "Alt",
    },
  ];
  node.props.minMeasures = 1;
  const en = resolveCompCardDisplay({
    node,
    rows: SAMPLE_ROWS,
    locale: "en",
  });
  assert.equal(en.strip[0]?.label, "Ht");
  const es = resolveCompCardDisplay({
    node,
    rows: SAMPLE_ROWS,
    locale: "es",
  });
  assert.equal(es.strip[0]?.label, "Alt");
});

test("comp card defaults clone measures", () => {
  const a = cloneCompCardDefaultProps();
  const b = cloneCompCardDefaultProps();
  a.measures![0]!.enabled = false;
  assert.equal(b.measures![0]!.enabled, true);
  assert.equal(COMP_CARD_DEFAULT_PROPS.measures![0]!.enabled, true);
});
