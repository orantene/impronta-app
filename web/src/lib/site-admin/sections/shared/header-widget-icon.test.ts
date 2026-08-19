import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { headerWidgetSchemaV1 } from "./header-widget";

const WIDGETS = [
  "header_search",
  "header_favorites",
  "header_inquiry",
  "header_account",
  "header_language",
] as const;

test("the icon override is additive within v1 — no migration needed", () => {
  // The schema is all-optional and passthrough, so an existing stored config
  // (including `{}`) must keep parsing untouched.
  assert.equal(headerWidgetSchemaV1.safeParse({}).success, true);
  assert.equal(
    headerWidgetSchemaV1.safeParse({ label: "Search" }).success,
    true,
    "a pre-existing config must not become invalid",
  );
  const withIcon = headerWidgetSchemaV1.safeParse({ icon: "search" });
  assert.equal(withIcon.success, true);
  assert.equal(
    headerWidgetSchemaV1.safeParse({ icon: "not_a_real_glyph" }).success,
    false,
    "an unknown glyph name must be rejected, not stored and drawn as nothing",
  );
});

test("every header widget honours the override", () => {
  // Each widget shipped ONE hardcoded glyph. Missing one leaves that widget
  // silently unchangeable while its four siblings are editable.
  for (const widget of WIDGETS) {
    const src = readFileSync(
      new URL(`../${widget}/Component.tsx`, import.meta.url),
      "utf8",
    );
    assert.match(
      src,
      /icon=\{props\.icon\}/,
      `${widget} ignores the operator's icon choice`,
    );
  }
});

test("an absent override still draws the widget's own glyph", () => {
  const shared = readFileSync(new URL("./header-widget.tsx", import.meta.url), "utf8");
  assert.match(
    shared,
    /\{icon \? <BuilderIconSvg name=\{icon\} \/> : glyph\}/,
    "the fallback must be the widget's original glyph, not a generic one",
  );
});
