import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatOfferingWhereLabel,
  offeringWhereFromAttributes,
} from "./offering-request-detail";

test("offeringWhereFromAttributes keeps known delivery keys only", () => {
  assert.deepEqual(
    offeringWhereFromAttributes({ where: ["studio", "remote", "warp", 3] }),
    ["studio", "remote"],
  );
  assert.deepEqual(offeringWhereFromAttributes({}), []);
  assert.deepEqual(offeringWhereFromAttributes(null), []);
  assert.deepEqual(offeringWhereFromAttributes({ where: "studio" }), []);
});

test("formatOfferingWhereLabel joins localized delivery labels", () => {
  assert.equal(formatOfferingWhereLabel(["studio", "client"], "en"), "At studio · At client");
  assert.equal(formatOfferingWhereLabel(["studio", "client"], "es"), "En el estudio · A domicilio");
  assert.equal(formatOfferingWhereLabel([], "en"), "");
});
