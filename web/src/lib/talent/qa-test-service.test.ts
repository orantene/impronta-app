import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_TEST_SERVICE_SCOPE,
  hideTestServiceOnPublicSite,
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

test("TUL-557: public strip hides QA-named rows on demo / fixture sites only", () => {
  const scope = { ...EMPTY_TEST_SERVICE_SCOPE, fixtureProfileIds: new Set(["demo"]) };
  const row = (title: string, talent: string | null, tenant: string | null = null) => ({
    title,
    talent_profile_id: talent,
    tenant_id: tenant,
  });
  assert.equal(hideTestServiceOnPublicSite(row("QA US E2E $100", "demo"), scope), true);
  // A real talent's site keeps every service, QA-named or not.
  assert.equal(hideTestServiceOnPublicSite(row("Corte QA", "real"), scope), false);
  // Demos sell real services with the word "test" in them.
  assert.equal(hideTestServiceOnPublicSite(row("Test image", "demo"), scope), false);
  assert.equal(hideTestServiceOnPublicSite(row("Product test, not posted", "demo"), scope), false);
  // House services: only on the journeys fixture workspaces.
  const journeys = "33333333-3333-4333-8333-333333333333";
  assert.equal(hideTestServiceOnPublicSite(row("QA gala ticket", null, journeys), scope), true);
  assert.equal(hideTestServiceOnPublicSite(row("QA gala ticket", null, "other-tenant"), scope), false);
  assert.equal(hideTestServiceOnPublicSite(row("Garlic bread", null, journeys), scope), false);
});
