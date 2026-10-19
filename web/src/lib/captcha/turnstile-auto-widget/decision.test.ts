import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decideCreateOrReuse,
  decideOnDomainActive,
  decideOnDomainDetach,
  hasOwnUserKeys,
  isAutoWidgetFlagOn,
  managedCaptchaAppliesToHost,
  MAX_WIDGET_CREATIONS_PER_RUN,
  readAutoWidgetEnv,
  widgetDomainsFor,
  widgetNameFor,
} from "./decision";

const FULL_ENV = {
  CAPTCHA_AUTO_WIDGET: "1",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_TURNSTILE_API_TOKEN: "tok",
};

const managed = (domain: string, extra: Record<string, unknown> = {}) => ({
  provider: "turnstile",
  site_key: "0xMANAGED",
  managed_by: "tulala-auto",
  managed_domain: domain,
  managed_widget_name: `tulala:${domain}`,
  ...extra,
});

test("flag is on only for exactly '1'", () => {
  assert.equal(isAutoWidgetFlagOn({ CAPTCHA_AUTO_WIDGET: "1" }), true);
  for (const v of [undefined, "", "0", "true", "yes", " 1"]) {
    assert.equal(isAutoWidgetFlagOn({ CAPTCHA_AUTO_WIDGET: v }), false, String(v));
  }
});

test("readAutoWidgetEnv needs the flag AND both credentials", () => {
  assert.deepEqual(readAutoWidgetEnv(FULL_ENV), { accountId: "acct", apiToken: "tok" });
  assert.equal(readAutoWidgetEnv({ ...FULL_ENV, CAPTCHA_AUTO_WIDGET: "0" }), null);
  assert.equal(readAutoWidgetEnv({ ...FULL_ENV, CLOUDFLARE_ACCOUNT_ID: "" }), null);
  assert.equal(readAutoWidgetEnv({ ...FULL_ENV, CLOUDFLARE_TURNSTILE_API_TOKEN: "  " }), null);
});

test("widget name and domains", () => {
  assert.equal(widgetNameFor("maria-nails.com"), "tulala:maria-nails.com");
  assert.deepEqual(widgetDomainsFor("maria-nails.com"), ["maria-nails.com", "www.maria-nails.com"]);
  assert.deepEqual(widgetDomainsFor("www.maria-nails.com"), ["maria-nails.com", "www.maria-nails.com"]);
});

test("decideOnDomainActive: decision table", () => {
  const rows: Array<[string, Parameters<typeof decideOnDomainActive>[0], ReturnType<typeof decideOnDomainActive>]> = [
    ["no row", { hostname: "Maria-Nails.com", config: null }, { action: "proceed", domain: "maria-nails.com" }],
    ["empty config", { hostname: "maria-nails.com", config: {} }, { action: "proceed", domain: "maria-nails.com" }],
    ["provider without site key", { hostname: "maria-nails.com", config: { provider: "turnstile" } }, { action: "proceed", domain: "maria-nails.com" }],
    ["own turnstile keys", { hostname: "maria-nails.com", config: { provider: "turnstile", site_key: "0xOWN" } }, { action: "skip", reason: "own_keys" }],
    ["own hcaptcha keys", { hostname: "maria-nails.com", config: { provider: "hcaptcha", site_key: "abc" } }, { action: "skip", reason: "own_keys" }],
    ["already managed for this domain", { hostname: "maria-nails.com", config: managed("maria-nails.com") }, { action: "skip", reason: "already_managed" }],
    ["managed for another domain", { hostname: "second.com", config: managed("maria-nails.com") }, { action: "skip", reason: "managed_for_other_domain" }],
    ["platform host", { hostname: "maria.tulala.digital", config: null }, { action: "skip", reason: "platform_host" }],
    ["invalid hostname", { hostname: "not a host", config: null }, { action: "skip", reason: "invalid_domain" }],
    ["single label", { hostname: "intranet", config: null }, { action: "skip", reason: "invalid_domain" }],
  ];
  for (const [label, input, expected] of rows) {
    assert.deepEqual(decideOnDomainActive(input), expected, label);
  }
});

test("decideCreateOrReuse: create, reuse without secret, already configured, cap", () => {
  const base = { domain: "maria-nails.com", storedSiteKey: null, storedSecretPresent: false, createdSoFar: 0 };
  assert.deepEqual(decideCreateOrReuse({ ...base, widgets: [{ sitekey: "x", name: "tulala:other.com" }] }), {
    action: "create",
    name: "tulala:maria-nails.com",
    domains: ["maria-nails.com", "www.maria-nails.com"],
  });
  const listed = [{ sitekey: "0xEXIST", name: "tulala:maria-nails.com" }];
  assert.deepEqual(decideCreateOrReuse({ ...base, widgets: listed }), { action: "skip_reuse_no_secret", sitekey: "0xEXIST" });
  assert.deepEqual(
    decideCreateOrReuse({ ...base, widgets: listed, storedSiteKey: "0xEXIST", storedSecretPresent: false }),
    { action: "skip_reuse_no_secret", sitekey: "0xEXIST" },
  );
  assert.deepEqual(
    decideCreateOrReuse({ ...base, widgets: listed, storedSiteKey: "0xEXIST", storedSecretPresent: true }),
    { action: "already_configured", sitekey: "0xEXIST" },
  );
  assert.deepEqual(decideCreateOrReuse({ ...base, widgets: [], createdSoFar: MAX_WIDGET_CREATIONS_PER_RUN }), {
    action: "skip_cap_reached",
  });
  assert.deepEqual(decideCreateOrReuse({ ...base, widgets: [], createdSoFar: 1, cap: 1 }), { action: "skip_cap_reached" });
});

test("decideOnDomainDetach deletes only tulala-auto keys for exactly that domain", () => {
  assert.deepEqual(decideOnDomainDetach({ hostname: "maria-nails.com", config: managed("maria-nails.com") }), {
    action: "delete",
    sitekey: "0xMANAGED",
  });
  const rows: Array<[string, Parameters<typeof decideOnDomainDetach>[0], string]> = [
    ["own keys", { hostname: "maria-nails.com", config: { provider: "turnstile", site_key: "0xOWN" } }, "not_managed"],
    ["no row", { hostname: "maria-nails.com", config: null }, "not_managed"],
    ["other managed_by", { hostname: "maria-nails.com", config: managed("maria-nails.com", { managed_by: "someone" }) }, "not_managed"],
    ["other domain", { hostname: "second.com", config: managed("maria-nails.com") }, "other_domain"],
    ["name without prefix", { hostname: "maria-nails.com", config: managed("maria-nails.com", { managed_widget_name: "maria-nails.com" }) }, "name_mismatch"],
    ["name for another domain", { hostname: "maria-nails.com", config: managed("maria-nails.com", { managed_widget_name: "tulala:x.com" }) }, "name_mismatch"],
    ["no site key", { hostname: "maria-nails.com", config: managed("maria-nails.com", { site_key: "" }) }, "no_site_key"],
    ["invalid host", { hostname: "", config: managed("maria-nails.com") }, "invalid_domain"],
  ];
  for (const [label, input, reason] of rows) {
    assert.deepEqual(decideOnDomainDetach(input), { action: "skip", reason }, label);
  }
});

test("hasOwnUserKeys ignores managed keys", () => {
  assert.equal(hasOwnUserKeys({ provider: "turnstile", site_key: "0xOWN" }), true);
  assert.equal(hasOwnUserKeys(managed("maria-nails.com")), false);
  assert.equal(hasOwnUserKeys(null), false);
});

test("managed keys apply only on their own domain (+ www); own keys apply everywhere", () => {
  const cfg = managed("maria-nails.com");
  assert.equal(managedCaptchaAppliesToHost(cfg, "maria-nails.com"), true);
  assert.equal(managedCaptchaAppliesToHost(cfg, "www.maria-nails.com"), true);
  assert.equal(managedCaptchaAppliesToHost(cfg, "MARIA-NAILS.com:443"), true);
  assert.equal(managedCaptchaAppliesToHost(cfg, "maria.tulala.digital"), false);
  assert.equal(managedCaptchaAppliesToHost(cfg, "other.com"), false);
  assert.equal(managedCaptchaAppliesToHost(cfg, null), false);
  assert.equal(managedCaptchaAppliesToHost({ provider: "turnstile", site_key: "0xOWN" }, "maria.tulala.digital"), true);
  assert.equal(managedCaptchaAppliesToHost(null, null), true);
});
