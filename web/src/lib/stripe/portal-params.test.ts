import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPortalSessionParams, portalConfigurationId, withoutPortalConfiguration } from "./portal-params";

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

test("a configuration id that is not a bpc_ id is ignored (TUL-834)", () => {
  assert.equal(portalConfigurationId("us", { STRIPE_PORTAL_CONFIGURATION_ID: "price_123" }), undefined);
});

test("withoutPortalConfiguration drops only the configuration (TUL-834)", () => {
  const p = buildPortalSessionParams({ customerId: "cus_1", returnUrl: "https://x/y", env: { STRIPE_PORTAL_CONFIGURATION_ID: "bpc_a" } });
  const q = withoutPortalConfiguration(p);
  assert.equal("configuration" in q, false);
  assert.equal(q.customer, "cus_1");
});

test("audience configuration wins over the account-wide id, which stays the fallback (P2)", () => {
  const env = {
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_all",
    STRIPE_TALENT_PORTAL_CONFIGURATION_ID: "bpc_talent",
    STRIPE_WORKSPACE_PORTAL_CONFIGURATION_ID: "bpc_ws",
    STRIPE_MX_TALENT_PORTAL_CONFIGURATION_ID: "bpc_mx_talent",
  };
  assert.equal(portalConfigurationId("us", env, "talent"), "bpc_talent");
  assert.equal(portalConfigurationId("us", env, "workspace"), "bpc_ws");
  assert.equal(portalConfigurationId("mx", env, "talent"), "bpc_mx_talent");
  assert.equal(portalConfigurationId("mx", env, "workspace"), undefined);
  assert.equal(portalConfigurationId("us", { STRIPE_PORTAL_CONFIGURATION_ID: "bpc_all" }, "talent"), "bpc_all");
  assert.equal(portalConfigurationId("us", { STRIPE_TALENT_PORTAL_CONFIGURATION_ID: "nope" }, "talent"), undefined);
});

test("force-test mode reads the _TEST sibling of the audience id (P2)", () => {
  const env = {
    STRIPE_FORCE_TEST_MODE: "1",
    STRIPE_TALENT_PORTAL_CONFIGURATION_ID: "bpc_live_talent",
    STRIPE_TALENT_PORTAL_CONFIGURATION_ID_TEST: "bpc_test_talent",
  };
  assert.equal(portalConfigurationId("us", env, "talent"), "bpc_test_talent");
  const p = buildPortalSessionParams({ customerId: "cus_1", returnUrl: "https://x/y", audience: "talent", env });
  assert.equal((p as { configuration?: string }).configuration, "bpc_test_talent");
});
