import assert from "node:assert/strict";
import { test } from "node:test";
import { guideCategory, guideTitle, guidePurpose } from "./guide-i18n";

test("guide titles localize and fall back to the registry copy", () => {
  assert.equal(guideTitle("inquiry-workspace", "Inquiry workspace", "es"), "Espacio de la consulta");
  assert.equal(guideTitle("inquiry-workspace", "Inquiry workspace", "en"), "Inquiry workspace");
  assert.equal(guideTitle("no-such-node", "Fallback", "es"), "Fallback");
});
test("guide purposes and categories localize", () => {
  assert.match(guidePurpose("inquiry-workspace", "x", "es"), /Una sola hoja/);
  assert.equal(guideCategory("Money", "es"), "Dinero");
  assert.equal(guideCategory("Unknown area", "es"), "Unknown area");
});
