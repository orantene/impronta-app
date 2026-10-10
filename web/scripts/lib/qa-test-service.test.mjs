import assert from "node:assert/strict";
import { test } from "node:test";

import { assertTestServiceIsHidden, isPublicTestService, isTestServiceTitle } from "./qa-test-service.mjs";

test("the real leftovers from the night QA are recognised", () => {
  for (const title of ["QA US E2E $100", "Soft Gel QA17 2004", "Soft gel extensions QA17 2004", "QA Fee Line 100 USD", "Manicure Gel QA", "Test service", "Product test, not posted", "test"]) {
    assert.equal(isTestServiceTitle(title), true, title);
  }
});

test("real services are not flagged", () => {
  for (const title of ["Limpieza profunda", "Deep cleaning", "Haircut", "Quality cut", "Contest prep", "Latest trends", "Manicure gel", "Prueba de peinado de novia", "Clase de prueba", "Bridal makeup trial"]) {
    assert.equal(isTestServiceTitle(title), false, title);
  }
});

test("only a published + public test service is a leftover; a translation counts", () => {
  assert.equal(isPublicTestService({ title: "QA US E2E $100", status: "published", visibility: "public" }), true);
  assert.equal(isPublicTestService({ title: "Corte", title_i18n: { en: "QA cut" }, status: "published", visibility: "public" }), true);
  assert.equal(isPublicTestService({ title: "QA US E2E $100", status: "draft", visibility: "public" }), false);
  assert.equal(isPublicTestService({ title: "QA US E2E $100", status: "published", visibility: "hidden" }), false);
  assert.equal(isPublicTestService({ title: "Corte", status: "published", visibility: "public" }), false);
});

test("the creation guard refuses a published test service and accepts a hidden one", () => {
  assert.throws(() => assertTestServiceIsHidden({ title: "QA Fee Line 100 USD", status: "published", visibility: "public" }), /refusing to publish/);
  assert.doesNotThrow(() => assertTestServiceIsHidden({ title: "QA Fee Line 100 USD", status: "draft", visibility: "hidden" }));
});
