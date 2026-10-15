/**
 * TUL-548 GRK-065/066: a Gridline home-visit service stored without `attributes.where` (older
 * demo rows, e.g. TAL-93030) still asks for the address: its only place hint was an optional
 * "Colonia" intake question. The address is required and the redundant question is dropped.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { serviceAddressRule } from "@/lib/scheduling/service-address";
import { homeVisitNeighbourhoodKeys, offeringWhereFromAttributes } from "./offering-request-detail";

const col = { key: "col", type: "text", label: "Colonia", placeholder: "Ej. Del Valle" };
const n = { key: "n", type: "text", label: "Número de piezas" };

test("no where plus a Colonia question reads as the client's place", () => {
  assert.deepEqual(offeringWhereFromAttributes({ intake: [col] }), ["client"]);
  assert.equal(serviceAddressRule(offeringWhereFromAttributes({ intake: [col, n] })), "required");
  assert.deepEqual(offeringWhereFromAttributes({ intake: [{ key: "area", type: "text", label: "Neighborhood or city" }] }), ["client"]);
});

test("explicit where and unrelated intake are untouched", () => {
  assert.deepEqual(offeringWhereFromAttributes({ where: ["studio"], intake: [col] }), ["studio"]);
  assert.deepEqual(offeringWhereFromAttributes({ where: ["agreed"], intake: [col] }), ["agreed"]);
  assert.deepEqual(offeringWhereFromAttributes({ intake: [n] }), []);
  assert.deepEqual(offeringWhereFromAttributes({}), []);
});

test("the neighbourhood question is identified so the sheet can drop it", () => {
  assert.deepEqual(homeVisitNeighbourhoodKeys([col, n]), ["col"]);
  assert.deepEqual(homeVisitNeighbourhoodKeys([n]), []);
});

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CatalogIntakeFields } from "@/components/public-booking/catalog-intake-fields";

test("the intake renders without Colonia when the address is asked, with it otherwise", () => {
  const props = { questions: [col, n] as never, answers: {}, locale: "es", onChange: () => {} };
  const on = renderToStaticMarkup(createElement(CatalogIntakeFields, { ...props, hideNeighbourhood: true }));
  const off = renderToStaticMarkup(createElement(CatalogIntakeFields, props));
  assert.ok(!on.includes("Colonia") && on.includes("Número de piezas"));
  assert.ok(off.includes("Colonia"));
});
