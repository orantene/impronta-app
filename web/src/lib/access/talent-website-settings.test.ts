import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTalentWebsiteSettingsEnabled,
  readWebsiteSettingsAllowlist,
  readWebsiteSettingsMode,
} from "./talent-website-settings";

const allow = readWebsiteSettingsAllowlist(" qa-jor-id , qa-free-id ,");

test("mode parsing defaults to off", () => {
  assert.equal(readWebsiteSettingsMode(undefined), "off");
  assert.equal(readWebsiteSettingsMode("0"), "off");
  assert.equal(readWebsiteSettingsMode("nonsense"), "off");
  assert.equal(readWebsiteSettingsMode("Talents"), "talents");
  assert.equal(readWebsiteSettingsMode("true"), "all");
});

test("off beats the allow-list", () => {
  assert.equal(isTalentWebsiteSettingsEnabled("qa-jor-id", { mode: "off", allowlist: allow }), false);
});

test("talents mode opens only allow-listed ids", () => {
  assert.equal(isTalentWebsiteSettingsEnabled("qa-jor-id", { mode: "talents", allowlist: allow }), true);
  assert.equal(isTalentWebsiteSettingsEnabled("qa-free-id", { mode: "talents", allowlist: allow }), true);
  assert.equal(isTalentWebsiteSettingsEnabled("live-talent", { mode: "talents", allowlist: allow }), false);
  assert.equal(isTalentWebsiteSettingsEnabled(null, { mode: "talents", allowlist: allow }), false);
});

test("all mode opens everyone", () => {
  assert.equal(isTalentWebsiteSettingsEnabled(null, { mode: "all", allowlist: new Set() }), true);
});
