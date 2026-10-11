/**
 * Talent Settings Instagram card: which state it shows, and how the OAuth
 * return is read.
 *
 * Run: node_modules/.bin/tsx --test src/lib/talent-integrations/instagram-card-state.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveTalentInstagramCardState,
  readTalentInstagramReturnNotice,
  talentInstagramConnectHref,
  type TalentInstagramRowFacts,
} from "./instagram-card-state";

const OAUTH_ROW: TalentInstagramRowFacts = {
  status: "connected",
  connection_method: "oauth",
  provider_account_label: "jorg.beauty",
  settings_json: {},
  last_sync_at: "2026-10-10T12:00:00.000Z",
  last_verified_at: "2026-10-09T12:00:00.000Z",
};

test("free plan always shows the upsell, and keeps the handle so a downgraded talent can disconnect", () => {
  assert.deepEqual(
    deriveTalentInstagramCardState({ row: null, paid: false, configured: true }),
    { kind: "upsell", connectedHandle: null },
  );
  assert.deepEqual(
    deriveTalentInstagramCardState({ row: OAUTH_ROW, paid: false, configured: true }),
    { kind: "upsell", connectedHandle: "jorg.beauty" },
  );
});

test("paid with no row offers Connect, or says unavailable when OAuth is not configured", () => {
  assert.deepEqual(
    deriveTalentInstagramCardState({ row: null, paid: true, configured: true }),
    { kind: "connect" },
  );
  assert.deepEqual(
    deriveTalentInstagramCardState({ row: null, paid: true, configured: false }),
    { kind: "unavailable" },
  );
});

test("a manual link or a disconnected row is not a connection", () => {
  for (const row of [
    { ...OAUTH_ROW, connection_method: "manual" },
    { ...OAUTH_ROW, status: "disabled" },
    { ...OAUTH_ROW, status: "not_connected" },
  ]) {
    assert.deepEqual(
      deriveTalentInstagramCardState({ row, paid: true, configured: true }),
      { kind: "connect" },
    );
  }
});

test("connected shows the handle and the last sync, falling back to the last verification", () => {
  assert.deepEqual(
    deriveTalentInstagramCardState({ row: OAUTH_ROW, paid: true, configured: true }),
    { kind: "connected", handle: "jorg.beauty", lastSyncAt: "2026-10-10T12:00:00.000Z" },
  );
  assert.deepEqual(
    deriveTalentInstagramCardState({
      row: { ...OAUTH_ROW, last_sync_at: null },
      paid: true,
      configured: true,
    }),
    { kind: "connected", handle: "jorg.beauty", lastSyncAt: "2026-10-09T12:00:00.000Z" },
  );
});

test("a live connection still shows even if OAuth was unconfigured later", () => {
  const state = deriveTalentInstagramCardState({ row: OAUTH_ROW, paid: true, configured: false });
  assert.equal(state.kind, "connected");
});

test("expired or failing tokens ask for a reconnect", () => {
  assert.deepEqual(
    deriveTalentInstagramCardState({
      row: { ...OAUTH_ROW, status: "needs_reauth" },
      paid: true,
      configured: true,
    }),
    { kind: "reconnect", handle: "jorg.beauty", reason: "expired" },
  );
  assert.deepEqual(
    deriveTalentInstagramCardState({
      row: { ...OAUTH_ROW, status: "error", settings_json: { needs_reconnect: true } },
      paid: true,
      configured: true,
    }),
    { kind: "reconnect", handle: "jorg.beauty", reason: "expired" },
  );
  assert.deepEqual(
    deriveTalentInstagramCardState({
      row: { ...OAUTH_ROW, status: "error" },
      paid: true,
      configured: true,
    }),
    { kind: "reconnect", handle: "jorg.beauty", reason: "error" },
  );
});

test("connect href starts a talent Instagram flow and marks the return", () => {
  const href = talentInstagramConnectHref("/talent/settings?connection_error=x&tab=1");
  const url = new URL(href, "https://app.tulala.digital");
  assert.equal(url.pathname, "/api/connections/oauth/start");
  assert.equal(url.searchParams.get("owner"), "talent");
  assert.equal(url.searchParams.get("provider"), "instagram");
  assert.equal(url.searchParams.get("returnTo"), "/talent/settings?tab=1&connect=instagram");
});

test("return notice: success is provider-specific, errors need this card's marker", () => {
  assert.deepEqual(
    readTalentInstagramReturnNotice(
      new URLSearchParams("connection_success=instagram&connection_account=jorg.beauty"),
    ),
    { tone: "ok", key: "connected", handle: "jorg.beauty" },
  );
  assert.equal(
    readTalentInstagramReturnNotice(new URLSearchParams("connection_success=youtube")),
    null,
  );
  assert.equal(
    readTalentInstagramReturnNotice(new URLSearchParams("connection_error=connect_failed")),
    null,
  );
  const cases: Array<[string, string]> = [
    ["access_denied", "cancelled"],
    ["connect_failed", "not_business"],
    ["invalid_state", "not_authorized"],
    ["oauth_setup", "unavailable"],
    ["save_failed", "generic"],
  ];
  for (const [code, key] of cases) {
    assert.deepEqual(
      readTalentInstagramReturnNotice(
        new URLSearchParams(`connect=instagram&connection_error=${code}`),
      ),
      { tone: "error", key },
    );
  }
});
