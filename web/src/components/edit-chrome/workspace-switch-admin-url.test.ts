import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { workspaceSwitchAdminUrl } from "./workspace-admin-base";

// TUL-1823: the switchers hard-coded the production app host, so a staging
// user was thrown onto app.tulala.digital/login.
const STAGING_APP = "https://app.staging.tulala.digital";
const PROD_APP = "https://app.tulala.digital";

test("staging app origin keeps the switch on staging", () => {
  assert.equal(
    workspaceSwitchAdminUrl("qa-grok-workspace", STAGING_APP, STAGING_APP),
    "https://app.staging.tulala.digital/qa-grok-workspace/admin",
  );
});

test("production app origin targets production", () => {
  assert.equal(
    workspaceSwitchAdminUrl("impronta", PROD_APP, PROD_APP),
    "https://app.tulala.digital/impronta/admin",
  );
});

test("a tenant host on staging still crosses to the configured staging app", () => {
  assert.equal(
    workspaceSwitchAdminUrl("acme", "https://acme.staging.tulala.digital", STAGING_APP),
    "https://app.staging.tulala.digital/acme/admin",
  );
});

test("trailing slash on the configured origin is tolerated", () => {
  assert.equal(
    workspaceSwitchAdminUrl("acme", STAGING_APP, `${STAGING_APP}/`),
    "https://app.staging.tulala.digital/acme/admin",
  );
});

test("unconfigured: an app. host is reused, anything else stays relative", () => {
  assert.equal(
    workspaceSwitchAdminUrl("acme", STAGING_APP, ""),
    "https://app.staging.tulala.digital/acme/admin",
  );
  assert.equal(workspaceSwitchAdminUrl("acme", "https://acme.example.com", ""), "/acme/admin");
});

test("local pages stay relative even with a remote configured origin", () => {
  assert.equal(
    workspaceSwitchAdminUrl("acme", "http://localhost:3000", PROD_APP),
    "/acme/admin",
  );
});

test("switcher components carry no production host literal", () => {
  for (const f of [
    "../admin/shell/internal/wave2.tsx",
    "../../app/(workspace)/platform/admin/platform-workspace-switcher.tsx",
  ]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/https:\/\/app\.tulala\.digital/.test(src), f);
  }
});
