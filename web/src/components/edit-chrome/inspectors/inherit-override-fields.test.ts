import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildFieldInheritRows,
  isInheritingValue,
  INHERIT_FIELDS_BY_KIND,
  STYLE_INHERIT_SENTINEL,
} from "./inherit-override-fields";
import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";
import type { BuilderNodeStyleValue } from "@/lib/site-admin/builder-node/types";

function rowByField(
  rows: ReturnType<typeof buildFieldInheritRows>,
  field: string,
) {
  const r = rows.find((x) => x.field === field);
  assert.ok(r, `expected a row for ${field}`);
  return r;
}

test("isInheritingValue: absent / null / sentinel inherit; a value overrides", () => {
  assert.equal(isInheritingValue(undefined), true);
  assert.equal(isInheritingValue(null), true);
  assert.equal(isInheritingValue(STYLE_INHERIT_SENTINEL), true);
  assert.equal(isInheritingValue("#e11d48"), false);
  assert.equal(isInheritingValue("token:color.ink"), false);
});

test("a kind with no themable surface (spacer/divider) → no rows", () => {
  assert.equal(buildFieldInheritRows("spacer", undefined, null).length, 0);
  assert.equal(buildFieldInheritRows("divider", { textColor: "#f00" }, null).length, 0);
});

test("heading surfaces text/font/size; all inherit when style is empty", () => {
  const rows = buildFieldInheritRows("heading", undefined, null);
  assert.deepEqual(
    rows.map((r) => r.field),
    INHERIT_FIELDS_BY_KIND.heading,
  );
  for (const r of rows) {
    assert.equal(r.state, "inherit", `${r.field} should inherit when unset`);
  }
});

test("a concrete value flips a field to override; sentinel stays inherit", () => {
  const style: BuilderNodeStyleValue = {
    textColor: "#e11d48",
    fontFamily: STYLE_INHERIT_SENTINEL,
  };
  const rows = buildFieldInheritRows("heading", style, null);
  assert.equal(rowByField(rows, "textColor").state, "override");
  assert.equal(rowByField(rows, "fontFamily").state, "inherit");
  assert.equal(rowByField(rows, "fontFamily").isSentinel, true);
});

test("source + seed: no component default → falls to the field's primary theme token", () => {
  const rows = buildFieldInheritRows("heading", undefined, null);
  const textColor = rowByField(rows, "textColor");
  // Primary color token seeds a token-ref + a "Theme: <label>" source.
  assert.ok(textColor.source.startsWith("Theme: "), textColor.source);
  assert.ok(textColor.seedValue.startsWith("token:color."), textColor.seedValue);
});

test("source + seed: a component default bound to a token wins as the source", () => {
  const defaults: ComponentStyleDefaults = {
    heading: { textColor: "token:color.ink" },
  };
  const rows = buildFieldInheritRows("heading", undefined, defaults);
  const textColor = rowByField(rows, "textColor");
  assert.equal(textColor.seedValue, "token:color.ink");
  assert.ok(textColor.source.startsWith("Theme: "), textColor.source);
});

test("source + seed: a RAW literal component default seeds verbatim with 'Default' source", () => {
  const defaults: ComponentStyleDefaults = {
    button: { backgroundColor: "#0b0b0d" },
  };
  const rows = buildFieldInheritRows("button", undefined, defaults);
  const fill = rowByField(rows, "backgroundColor");
  assert.equal(fill.seedValue, "#0b0b0d");
  assert.equal(fill.source, "Default");
});

test("every surfaced field for every kind has a non-empty override seed", () => {
  for (const kind of Object.keys(INHERIT_FIELDS_BY_KIND)) {
    const rows = buildFieldInheritRows(
      kind as keyof typeof INHERIT_FIELDS_BY_KIND,
      undefined,
      null,
    );
    for (const r of rows) {
      assert.notEqual(
        r.seedValue,
        "",
        `${kind}.${r.field} must seed a non-empty override value`,
      );
    }
  }
});
