import assert from "node:assert/strict";
import test from "node:test";

import { buildTranslationReport, isNonLinguisticValue } from "./translation-status";
import type { BuilderNode } from "./types";

/** Minimal node factory — the comparer only reads id/kind/props/children. */
function node(
  id: string,
  kind: string,
  props: Record<string, unknown> = {},
  children?: BuilderNode[],
): BuilderNode {
  return { id, kind, props, ...(children ? { children } : {}) } as unknown as BuilderNode;
}

test("id match: differing text is translated, equal text is identical", () => {
  const en = [node("h1", "heading", { text: "Faces that carry" })];
  const es = [node("h1", "heading", { text: "Rostros que llevan" })];
  const report = buildTranslationReport(en, es);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0]!.status, "translated");
  assert.equal(report.rows[0]!.matchedBy, "id");

  const same = buildTranslationReport(en, [node("h1", "heading", { text: "Faces that carry" })]);
  assert.equal(same.rows[0]!.status, "identical");
});

test("position+kind fallback matches rebuilt pages; kind mismatch does not", () => {
  const en = [node("a", "container", {}, [node("b", "heading", { text: "Hello" })])];
  // Same shape, entirely different ids → position match.
  const es = [node("x", "container", {}, [node("y", "heading", { text: "Hola" })])];
  const positioned = buildTranslationReport(en, es);
  assert.equal(positioned.rows[0]!.status, "translated");
  assert.equal(positioned.rows[0]!.matchedBy, "position");

  // Same position but a different KIND at the leaf → explicit no_counterpart,
  // never a guess.
  const wrongKind = [node("x", "container", {}, [node("y", "paragraph", { text: "Hola" })])];
  const refused = buildTranslationReport(en, wrongKind);
  assert.equal(refused.rows[0]!.status, "no_counterpart");
  assert.equal(refused.rows[0]!.matchedBy, null);
});

test("counterpart node with an empty prop is sibling_empty, not no_counterpart", () => {
  const en = [node("h1", "heading", { text: "Faces" })];
  const es = [node("h1", "heading", { text: "   " })];
  const report = buildTranslationReport(en, es);
  assert.equal(report.rows[0]!.status, "sibling_empty");
});

test("missing sibling page reports everything as no_counterpart", () => {
  const en = [
    node("h1", "heading", { text: "Faces" }),
    node("b1", "button", { label: "Book talent", href: "/x" }),
  ];
  const report = buildTranslationReport(en, null);
  assert.equal(report.total, 2);
  assert.equal(report.counts.no_counterpart, 2);
  assert.equal(report.siblingOnlyCount, 0);
});

test("multiple text props on one node are tracked independently", () => {
  const en = [node("i1", "image", { alt: "A model on the beach", title: "Beach" })];
  const es = [node("i1", "image", { alt: "Una modelo en la playa" })];
  const report = buildTranslationReport(en, es);
  const byProp = new Map(report.rows.map((r) => [r.prop, r.status]));
  assert.equal(byProp.get("alt"), "translated");
  // title exists on EN, the ES node exists but carries no title → sibling_empty.
  assert.equal(byProp.get("title"), "sibling_empty");
});

test("sibling-only content is counted, structural kinds are ignored", () => {
  const en = [node("c1", "container", {})];
  const es = [
    node("c1", "container", {}),
    node("p9", "paragraph", { text: "Solo en español" }),
  ];
  const report = buildTranslationReport(en, es);
  assert.equal(report.total, 0); // container carries no text props
  assert.equal(report.siblingOnlyCount, 1);
});

test("label prefers layerLabel and falls back to a tag-stripped excerpt", () => {
  const en = [
    node("r1", "rich_text", { text: "<p>Hello <strong>world</strong> of talent</p>" }),
    node("h2", "heading", { text: "Named", layerLabel: "Hero title" }),
  ];
  const report = buildTranslationReport(en, null);
  const rich = report.rows.find((r) => r.nodeId === "r1")!;
  assert.ok(!rich.label.includes("<"));
  assert.ok(rich.label.includes("Hello"));
  const named = report.rows.find((r) => r.nodeId === "h2")!;
  assert.equal(named.label, "Hero title");
});

test("non-linguistic values are classified apart from real identical words", () => {
  // Every one of these came from the FIRST live run on the Impronta homepage,
  // where they were reported as "identical" and drowned the one real finding.
  for (const noise of ["<24h", "100%", "27+", "5", "I.", "II.", "01", "02", "03", "04", "\u201c"]) {
    assert.equal(isNonLinguisticValue(noise), true, `${noise} should be non-linguistic`);
  }
  // The one real word from that run must still count as a finding.
  assert.equal(isNonLinguisticValue("Performers"), false);
  // Short real words must NOT be swallowed — the guard is conservative.
  for (const word of ["Go", "Ir", "Ok", "Sí", "No"]) {
    assert.equal(isNonLinguisticValue(word), false, `${word} is a real word`);
  }
});

test("identical numerals report not_translatable; identical words report identical", () => {
  const en = [
    node("s1", "heading", { text: "100%" }),
    node("s2", "heading", { text: "Performers" }),
  ];
  const es = [
    node("s1", "heading", { text: "100%" }),
    node("s2", "heading", { text: "Performers" }),
  ];
  const report = buildTranslationReport(en, es);
  const byId = new Map(report.rows.map((r) => [r.nodeId, r.status]));
  assert.equal(byId.get("s1"), "not_translatable");
  assert.equal(byId.get("s2"), "identical");
  assert.equal(report.counts.not_translatable, 1);
  assert.equal(report.counts.identical, 1);
});
