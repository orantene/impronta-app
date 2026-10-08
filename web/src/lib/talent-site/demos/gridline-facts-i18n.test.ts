/**
 * TUL-207: a Spanish-primary Gridline demo's spec cells carry an English
 * overlay on the stats node (`items.N.label` / `items.N.value`), and a demo
 * without one is written exactly as before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyDemoSiteCopy, factsOverlay, specTableOverlay } from "./site-copy";

const FACTS = [
  { label: "Respuesta", value: "En 2 dias" },
  { label: "Visita", value: "$400" },
];
const FACTS_EN = [
  { label: "Response", value: "Within 2 days" },
  { label: "Visit", value: "$400" },
];

function heroWithStats() {
  return [
    {
      id: "hero",
      kind: "container",
      props: { anchorId: "hero" },
      children: [{ id: "st", kind: "stats", props: { variant: "spec", items: [] } }],
    },
  ];
}

function statsProps(home: ReturnType<typeof heroWithStats>): Record<string, unknown> {
  const out = applyDemoSiteCopy([], home, { gridline: { hero: { facts: FACTS, factsI18n: { en: FACTS_EN } } } }, () => null, () => "x");
  const container = out.home[0] as { children?: Array<{ props?: Record<string, unknown> }> };
  return container.children?.[0]?.props ?? {};
}

test("factsOverlay keys every non-empty cell by index and language", () => {
  assert.deepEqual(factsOverlay({ en: FACTS_EN }), {
    i18n: { en: { "items.0.label": "Response", "items.0.value": "Within 2 days", "items.1.label": "Visit", "items.1.value": "$400" } },
  });
  assert.deepEqual(factsOverlay(undefined), {});
  assert.deepEqual(factsOverlay({ en: [{ label: "", value: " " }] }), {});
});

test("the demo site copy writes the cells and their English overlay on the stats node", () => {
  const props = statsProps(heroWithStats());
  assert.deepEqual(props.items, FACTS);
  const i18n = props.i18n as Record<string, Record<string, string>>;
  assert.equal(i18n.en["items.0.label"], "Response");
  assert.equal(i18n.en["items.1.value"], "$400");
});

test("without factsI18n the stats node gets no overlay (as before)", () => {
  const out = applyDemoSiteCopy([], heroWithStats(), { gridline: { hero: { facts: FACTS } } }, () => null, () => "x");
  const container = out.home[0] as { children?: Array<{ props?: Record<string, unknown> }> };
  assert.equal(container.children?.[0]?.props?.i18n, undefined);
});

const SPEC_ROWS = [
  { label: "Garantia", value: "6 meses" },
  { label: "Precio", value: "Antes de empezar" },
];

function specHome() {
  return [{ id: "sp", kind: "spec_table", props: { rows: [] } }];
}

test("specTableOverlay keys the parts by language and skips empty ones", () => {
  assert.deepEqual(
    specTableOverlay({ en: { title: "Specifications", rows: [{ label: "Warranty", value: "" }, { label: "Price", value: "Before I start" }] } }),
    { i18n: { en: { title: "Specifications", "rows.0.label": "Warranty", "rows.1.label": "Price", "rows.1.value": "Before I start" } } },
  );
  assert.deepEqual(specTableOverlay(undefined), {});
  assert.deepEqual(specTableOverlay({ en: { eyebrow: " " } }), {});
});

test("the spec table keeps its Spanish rows and gains an English overlay when the demo gives one", () => {
  const withEn = applyDemoSiteCopy([], specHome(), { gridline: { specTable: { title: "Especificaciones", rows: SPEC_ROWS, i18n: { en: { title: "Specifications", rows: [{ label: "Warranty", value: "6 months" }] } } } } }, () => null, () => "x");
  const props = (withEn.home[0] as { props: Record<string, unknown> }).props;
  assert.deepEqual(props.rows, SPEC_ROWS);
  assert.equal(props.title, "Especificaciones");
  assert.deepEqual(props.i18n, { en: { title: "Specifications", "rows.0.label": "Warranty", "rows.0.value": "6 months" } });
  const without = applyDemoSiteCopy([], specHome(), { gridline: { specTable: { title: "Especificaciones", rows: SPEC_ROWS } } }, () => null, () => "x");
  assert.equal((without.home[0] as { props: Record<string, unknown> }).props.i18n, undefined);
});
