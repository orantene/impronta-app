import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPortalSessionParams, portalConfigurationId } from "./portal-params";

test("portal params carry configuration, locale and return_url", () => {
  const p = buildPortalSessionParams({
    customerId: "cus_1",
    returnUrl: "https://app.example/acme/admin/account",
    locale: "es",
    env: { STRIPE_PORTAL_CONFIGURATION_ID: "bpc_us" },
  });
  assert.equal(p.customer, "cus_1");
  assert.equal(p.return_url, "https://app.example/acme/admin/account");
  assert.equal(p.locale, "es-419");
  assert.equal((p as { configuration?: string }).configuration, "bpc_us");
});

test("MX account reads its own configuration id", () => {
  const env = { STRIPE_PORTAL_CONFIGURATION_ID: "bpc_us", STRIPE_MX_PORTAL_CONFIGURATION_ID: "bpc_mx" };
  assert.equal(portalConfigurationId("mx", env), "bpc_mx");
  assert.equal(portalConfigurationId("us", env), "bpc_us");
});

test("configuration is omitted when env is unset or blank", () => {
  const p = buildPortalSessionParams({ customerId: "cus_1", returnUrl: "https://x/y", env: { STRIPE_PORTAL_CONFIGURATION_ID: "  " } });
  assert.equal("configuration" in p, false);
});
