import test from "node:test";
import assert from "node:assert/strict";

import { localizableListSpecsForKind } from "./builder-i18n-list-props";

// Catches: the visit block's extra facts being read raw, so an English overlay never applied on /en.
test("visit extraFacts label, value and note are localisable list fields", () => {
  const spec = localizableListSpecsForKind("visit").find((s) => s.list === "extraFacts");
  assert.deepEqual(spec?.fields, ["label", "value", "note"]);
});
