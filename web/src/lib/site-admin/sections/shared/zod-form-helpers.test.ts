/**
 * Unit tests for the ZodSchemaForm pure helpers (no React / no browser).
 *
 * These lock the logic-bearing extraction behind the 2026-05-29 drawer
 * unification: field classification, collapsed-row summary derivation, the
 * enum humanizer, and the AI sibling-context picker. Run via `tsx --test`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveItemSummary,
  humanizeEnumValue,
  isGroupKind,
  pickStringSiblings,
  ADVANCED_GROUP_NAMES,
  GROUP_LABEL_OVERRIDES,
} from "./zod-form-helpers";
import type { IntrospectedField } from "./zod-introspect";

function field(
  name: string,
  kind: IntrospectedField["kind"],
): IntrospectedField {
  return { name, kind, optional: false, label: name };
}

test("isGroupKind: only object + array_of_objects are groups", () => {
  assert.equal(isGroupKind(field("hero", "object")), true);
  assert.equal(isGroupKind(field("cards", "array_of_objects")), true);
  assert.equal(isGroupKind(field("headline", "text")), false);
  assert.equal(isGroupKind(field("tags", "array_of_strings")), false);
  assert.equal(isGroupKind(field("count", "number")), false);
  assert.equal(isGroupKind(field("on", "boolean")), false);
});

test("deriveItemSummary: prefers title/label over document order", () => {
  const children = [
    field("category", "text"),
    field("title", "text"),
    field("excerpt", "textarea"),
  ];
  const summary = deriveItemSummary(
    children,
    { category: "Craft", title: "Headlining post", excerpt: "Lead story." },
    0,
  );
  assert.equal(summary, "Headlining post");
});

test("deriveItemSummary: falls back to first non-empty text field", () => {
  const children = [field("category", "text"), field("excerpt", "textarea")];
  const summary = deriveItemSummary(
    children,
    { category: "", excerpt: "Supporting story." },
    2,
  );
  assert.equal(summary, "Supporting story.");
});

test("deriveItemSummary: falls back to positional label when empty", () => {
  const children = [field("title", "text"), field("excerpt", "textarea")];
  assert.equal(deriveItemSummary(children, {}, 0), "Item 1");
  assert.equal(deriveItemSummary(children, { title: "   " }, 3), "Item 4");
});

test("deriveItemSummary: ignores non-string (i18n object) values", () => {
  const children = [field("title", "text")];
  const summary = deriveItemSummary(
    children,
    { title: { default: "x", en: "x" } as unknown as string },
    1,
  );
  assert.equal(summary, "Item 2");
});

test("deriveItemSummary: truncates long summaries with an ellipsis", () => {
  const children = [field("title", "text")];
  const long = "a".repeat(80);
  const summary = deriveItemSummary(children, { title: long }, 0);
  assert.ok(summary.endsWith("…"));
  assert.ok(summary.length <= 44);
});

test("humanizeEnumValue: dash/underscore → spaced + capitalized", () => {
  assert.equal(humanizeEnumValue("fade-up"), "Fade up");
  assert.equal(humanizeEnumValue("edge_to_edge"), "Edge to edge");
  assert.equal(humanizeEnumValue("5/6"), "5/6");
  assert.equal(humanizeEnumValue("left"), "Left");
});

test("pickStringSiblings: keeps non-empty strings, drops self + non-strings", () => {
  const ctx = pickStringSiblings(
    {
      headline: "Hello",
      eyebrow: "  ",
      count: 3,
      self: "skip me",
      nested: { a: 1 },
    },
    "self",
  );
  assert.deepEqual(ctx, { headline: "Hello" });
});

test("advanced-group config: nodePresentation is advanced + relabeled", () => {
  assert.ok(ADVANCED_GROUP_NAMES.has("nodePresentation"));
  assert.ok(ADVANCED_GROUP_NAMES.has("seo"));
  assert.equal(ADVANCED_GROUP_NAMES.has("hero"), false);
  assert.equal(GROUP_LABEL_OVERRIDES.nodePresentation, "Type & color overrides");
});
