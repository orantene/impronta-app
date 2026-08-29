import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FORBIDDEN_SETTINGS_PREFIXES,
  pickWhitelistedPatch,
  SETTINGS_PATCH_KEYS,
  getDotted,
  setDotted,
} from "./kinds";

test("settings_patch whitelist is display/branding only", () => {
  for (const key of SETTINGS_PATCH_KEYS) {
    assert.match(key, /^branding\./);
  }
  const joined = SETTINGS_PATCH_KEYS.join(" ");
  for (const prefix of FORBIDDEN_SETTINGS_PREFIXES) {
    assert.equal(joined.includes(prefix), false, prefix);
  }
});

test("pickWhitelistedPatch rejects billing, domain, and security keys", () => {
  assert.equal(pickWhitelistedPatch({ "billing.plan": "agency" }).ok, false);
  assert.equal(pickWhitelistedPatch({ "domain.custom": "x.com" }).ok, false);
  assert.equal(pickWhitelistedPatch({ "security.sso": true }).ok, false);
  assert.equal(pickWhitelistedPatch({ unknown: "x" }).ok, false);
});

test("pickWhitelistedPatch keeps branding keys", () => {
  const r = pickWhitelistedPatch({ "branding.tagline": "Hello", "branding.primary_color": "#0F4F3E" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.patch["branding.tagline"], "Hello");
    assert.equal(r.patch["branding.primary_color"], "#0F4F3E");
  }
});

test("setDotted writes nested branding without clobbering siblings", () => {
  const settings: Record<string, unknown> = { branding: { tagline: "old", extra: 1 }, other: true };
  setDotted(settings, "branding.tagline", "new");
  const branding = settings.branding as Record<string, unknown>;
  assert.equal(branding.tagline, "new");
  assert.equal(branding.extra, 1);
  assert.equal(settings.other, true);
});

test("getDotted reads nested values and returns undefined for missing paths", () => {
  const settings = { branding: { tagline: "before" } } as Record<string, unknown>;
  assert.equal(getDotted(settings, "branding.tagline"), "before");
  assert.equal(getDotted(settings, "branding.logo_url"), undefined);
  assert.equal(getDotted(settings, "missing.deep.path"), undefined);
});
