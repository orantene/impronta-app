/**
 * TUL-495 — public Max-site mounts only the active type-system sheets.
 * Order matches main's typeSystemSheetsForTokens (motion first).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  TypeSystemStyle,
  typeSystemSheetsForTokens,
} from "./design-type-system-style";

test("typeSystemSheetsForTokens: Gridline utility + highlight + motion", () => {
  const sheets = typeSystemSheetsForTokens({
    "type.system": "utility",
    "type.accent-style": "highlight",
  });
  assert.deepEqual(sheets, ["motion", "utility", "utility-booking", "highlight"]);
});

test("typeSystemSheetsForTokens: editorial default when unset", () => {
  assert.deepEqual(typeSystemSheetsForTokens({}), ["motion", "editorial"]);
});

test("TypeSystemStyle with systems mounts only those sheets", () => {
  const html = renderToStaticMarkup(
    React.createElement(TypeSystemStyle, {
      systems: ["utility", "motion"],
    }),
  );
  assert.match(html, /data-type-system-style="utility"/);
  assert.match(html, /data-type-system-style="motion"/);
  assert.doesNotMatch(html, /data-type-system-style="editorial"/);
  assert.doesNotMatch(html, /data-type-system-style="magazine"/);
});

test("TypeSystemStyle with no systems keeps the full mount (editor back-compat)", () => {
  const html = renderToStaticMarkup(React.createElement(TypeSystemStyle));
  assert.match(html, /data-type-system-style="editorial"/);
  assert.match(html, /data-type-system-style="magazine"/);
  assert.match(html, /data-type-system-style="utility"/);
  assert.match(html, /data-type-system-style="motion"/);
});
