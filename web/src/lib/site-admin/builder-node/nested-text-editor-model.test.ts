import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { deriveNestedTextFields } from "./nested-text-editor-model";
import { translatableTextOf, isNestedProp } from "./translatable-text";
import type { BuilderNode } from "./types";

/**
 * REAL nodes, one per nested shape found across the whole Impronta site
 * (captured 2026-08-21). Fixtures rather than hand-written nodes because the
 * bug this feature fixes came from a hand-written idea of what a node looks
 * like: `props.config.requestCta.label` sits THREE levels down and a plausible
 * two-level fixture would have passed while the real page stayed broken.
 */
const SHAPES = JSON.parse(
  readFileSync(new URL("./__fixtures__/nested-text-shapes.json", import.meta.url), "utf8"),
) as Array<{ shape: string; page: string; node: BuilderNode }>;

test("every real nested shape on the site produces editable fields", () => {
  assert.ok(SHAPES.length >= 4, "fixtures must cover every shape found on the site");
  for (const { shape, page, node } of SHAPES) {
    const fields = deriveNestedTextFields(node, "en");
    assert.ok(
      fields.length > 0,
      `${shape} (/${page}) produced no fields — this component would still have no locale editor`,
    );
    // One field per nested string the shared definition finds: the editor and
    // the audit cannot disagree about what is translatable.
    const expected = translatableTextOf(node).filter((f) => isNestedProp(f.prop));
    assert.equal(fields.length, expected.length, `${shape}: field count must match`);
    assert.deepEqual(
      fields.map((f) => f.path),
      expected.map((e) => e.prop),
      `${shape}: paths must match the shared definition`,
    );
  }
});

test("the default tab shows the BASE prop, not the overlay", () => {
  const form = SHAPES.find((s) => s.shape.startsWith("form:"))!;
  const fields = deriveNestedTextFields(form.node, "en");
  const first = fields[0]!;
  assert.equal(
    first.valueFor("en"),
    (form.node as unknown as { props: { fields: Array<{ label: string }> } }).props.fields[0]!.label,
    "English tab must show the base value the page renders in English",
  );
  assert.ok(first.hasValueFor("en"));
});

test("a secondary tab shows that locale's OVERLAY value", () => {
  const form = SHAPES.find((s) => s.shape.startsWith("form:"))!;
  const overlay = (form.node as { i18n?: Record<string, Record<string, string>> }).i18n?.es ?? {};
  const fields = deriveNestedTextFields(form.node, "en");
  const translated = fields.filter((f) => typeof overlay[f.path] === "string");
  assert.ok(translated.length > 0, "fixture should carry Spanish overlays");
  for (const f of translated) {
    assert.equal(f.valueFor("es"), overlay[f.path], `${f.path}: ES tab shows the overlay`);
    assert.ok(f.hasValueFor("es"), `${f.path}: ES dot filled`);
  }
});

test("an untranslated path reports an empty secondary value and a hollow dot", () => {
  const node = {
    id: "n1",
    kind: "form",
    props: { fields: [{ label: "Name" }] },
  } as unknown as BuilderNode;
  const [field] = deriveNestedTextFields(node, "en");
  assert.equal(field!.valueFor("es"), "");
  assert.equal(field!.hasValueFor("es"), false);
  assert.equal(field!.hasValueFor("en"), true);
});

test("a node with no nested text produces nothing (panels stay unchanged)", () => {
  const heading = {
    id: "h1",
    kind: "heading",
    props: { text: "Hello", level: 2 },
  } as unknown as BuilderNode;
  assert.deepEqual(deriveNestedTextFields(heading, "en"), []);
});

test("row labels are operator-readable and 1-based", () => {
  const form = SHAPES.find((s) => s.shape.startsWith("form:"))!;
  const labels = deriveNestedTextFields(form.node, "en").map((f) => f.label);
  assert.ok(labels.every((l) => !l.includes(".")), `labels must not be raw paths: ${labels[0]}`);
  assert.match(labels[0]!, /1 · /);
});
