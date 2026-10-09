import test from "node:test";
import assert from "node:assert/strict";

import { resolveEnvProdGatingFlags } from "./prod-gating-flags";

test("resolveEnvProdGatingFlags: prod-like ON matrix", () => {
  const flags = resolveEnvProdGatingFlags({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    TALENT_STUDIO_V2: "1",
    TALENT_AGENDA_V2: "all",
    TALENT_FREE_WEBSITE_ENABLED: "true",
    TALENT_THEME_GALLERY_ENABLED: "1",
    TALENT_WEBSITE_SETTINGS_ENABLED: "all",
    TALENT_SITE_SUBDOMAINS_ENABLED: "true",
    NEXT_PUBLIC_MESSAGES_V5: "1",
    TALENT_MAISON_THEME_ENABLED: "talents",
    TALENT_MAISON_THEME_TALENTS:
      "6d4e7d73-8577-42fb-b0d3-d2e55a64ca14,c99f8adb-8ebb-4aad-911a-897e73efd369",
    BUILDER_AUTO_THUMBNAIL_ENABLED: "1",
    BUILDER_ROLLOUT_CRON_ENABLED: "1",
    MEDIA_PRIVATE_ACCESS_ENABLED: "1",
    REAP_SUPPORT_REPLAYS_ENABLED: "true",
    COMMISSION_PROCESSING_PASS_THROUGH: "1",
    SUPPORT_DESK_ENABLED: "1",
  });
  const byKey = Object.fromEntries(flags.map((f) => [f.key, f]));

  assert.equal(byKey.TALENT_STUDIO_V2.resolved, true);
  assert.equal(byKey.TALENT_AGENDA_V2.resolved, "all");
  assert.equal(byKey.TALENT_FREE_WEBSITE_ENABLED.resolved, true);
  assert.equal(byKey.TALENT_THEME_GALLERY_ENABLED.resolved, true);
  assert.equal(byKey.TALENT_WEBSITE_SETTINGS_ENABLED.resolved, "all");
  assert.equal(byKey.TALENT_SITE_SUBDOMAINS_ENABLED.resolved, true);
  assert.equal(byKey.NEXT_PUBLIC_MESSAGES_V5.resolved, true);
  assert.equal(byKey.TALENT_MAISON_THEME_ENABLED.resolved, "talents");
  assert.deepEqual(byKey.TALENT_MAISON_THEME_TALENTS.resolved, [
    "6d4e7d73-8577-42fb-b0d3-d2e55a64ca14",
    "c99f8adb-8ebb-4aad-911a-897e73efd369",
  ]);
  assert.equal(byKey.BUILDER_AUTO_THUMBNAIL_ENABLED.resolved, true);
  assert.equal(byKey.BUILDER_ROLLOUT_CRON_ENABLED.resolved, true);
  assert.equal(byKey.REAP_SUPPORT_REPLAYS_ENABLED.resolved, true);
  assert.equal(byKey.COMMISSION_PROCESSING_PASS_THROUGH.resolved, true);
  assert.equal(byKey.CLIENT_WELCOME_EMAIL_ENABLED.resolved, false);
  assert.equal(byKey.CLIENT_WELCOME_EMAIL_ENABLED.env, null);
  assert.equal(byKey.TALENT_SITE_CONSENT_TOOLING_ENABLED.resolved, false);
  assert.equal(byKey.SUPPORT_DESK_ENABLED.resolved, true);
});

test("resolveEnvProdGatingFlags: unset desk/studio OFF (no NODE_ENV default)", () => {
  for (const nodeEnv of ["production", "development"] as const) {
    const flags = resolveEnvProdGatingFlags({
      NODE_ENV: nodeEnv,
      VERCEL_ENV: "production",
    });
    const byKey = Object.fromEntries(flags.map((f) => [f.key, f]));
    assert.equal(byKey.TALENT_STUDIO_V2.resolved, false, `studio under NODE_ENV=${nodeEnv}`);
    assert.equal(byKey.SUPPORT_DESK_ENABLED.resolved, false, `desk under NODE_ENV=${nodeEnv}`);
    assert.equal(byKey.TALENT_AGENDA_V2.resolved, "off");
  }
});

test("resolveEnvProdGatingFlags: catalog includes every FEATURES.md env + DB key", () => {
  const keys = new Set(
    resolveEnvProdGatingFlags({ NODE_ENV: "production" }).map((f) => f.key),
  );
  for (const k of [
    "TALENT_STUDIO_V2",
    "TALENT_AGENDA_V2",
    "TALENT_FREE_WEBSITE_ENABLED",
    "TALENT_THEME_GALLERY_ENABLED",
    "TALENT_WEBSITE_SETTINGS_ENABLED",
    "TALENT_SITE_SUBDOMAINS_ENABLED",
    "NEXT_PUBLIC_MESSAGES_V5",
    "TALENT_MAISON_THEME_ENABLED",
    "TALENT_MAISON_THEME_TALENTS",
    "BUILDER_AUTO_THUMBNAIL_ENABLED",
    "BUILDER_ROLLOUT_CRON_ENABLED",
    "MEDIA_PRIVATE_ACCESS_ENABLED",
    "REAP_SUPPORT_REPLAYS_ENABLED",
    "COMMISSION_PROCESSING_PASS_THROUGH",
    "CLIENT_WELCOME_EMAIL_ENABLED",
    "TALENT_SITE_CONSENT_TOOLING_ENABLED",
    "PUBLIC_STREET_AUTOCOMPLETE_ENABLED",
    "SUPPORT_DESK_ENABLED",
    "settings.ai_talent_translate_enabled",
    "settings.ai_master_enabled",
    "platform_settings.workspace_fab_enabled",
    "platform_settings.media_private_access_enabled",
    "platform_commission_config.processing_mode",
    "platform_commission_config.pass_through_take_bps",
  ]) {
    assert.ok(keys.has(k), `missing catalog key ${k}`);
  }
});
