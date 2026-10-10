import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTestServiceOffering,
  isTestServiceTitle,
} from "./qa-test-service";

test("night-QA leftovers are recognised", () => {
  for (const title of [
    "QA US E2E $100",
    "Soft Gel QA17 2004",
    "Soft gel extensions QA17 2004",
    "QA Fee Line 100 USD",
    "Manicure Gel QA",
    "Test service",
    "Product test, not posted",
    "test",
  ]) {
    assert.equal(isTestServiceTitle(title), true, title);
  }
});

test("real services are not flagged", () => {
  for (const title of [
    "Limpieza profunda",
    "Deep cleaning",
    "Haircut",
    "Quality cut",
    "Contest prep",
    "Latest trends",
    "Manicure gel",
    "Prueba de peinado de novia",
    "Clase de prueba",
    "Bridal makeup trial",
  ]) {
    assert.equal(isTestServiceTitle(title), false, title);
  }
});

test("i18n titles count as leftovers too", () => {
  assert.equal(
    isTestServiceOffering({ title: "Corte", titleI18n: { en: "QA cut" } }),
    true,
  );
  assert.equal(
    isTestServiceOffering({ title: "Corte", titleI18n: { en: "Haircut" } }),
    false,
  );
});
