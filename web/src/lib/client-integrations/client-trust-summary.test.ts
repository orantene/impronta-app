import test from "node:test";
import assert from "node:assert/strict";

import { selectVisibleVerifiedAccounts } from "./client-trust-summary";
import type { ClientIntegrationRow } from "./repository";

// ─────────────────────────────────────────────────────────────────────────────
// selectVisibleVerifiedAccounts — the privacy contract for the client trust
// summary shown to staff/talent on inquiry + booking surfaces.
//
// Principle: only REAL OAuth-verified ownership counts (no fake badges), and
// only what the client allowed the audience to see. Manual links never count.
// ─────────────────────────────────────────────────────────────────────────────

function row(overrides: Partial<ClientIntegrationRow>): ClientIntegrationRow {
  return {
    id: "r1",
    user_id: "u1",
    provider_key: "instagram",
    provider_account_id: "acct",
    provider_account_label: "@studio",
    connection_method: "oauth",
    status: "connected",
    scopes: [],
    consent_version: "client-connections-v1",
    trust_signal_enabled: true,
    agency_visible: true,
    talent_visible: true,
    public_profile_enabled: false,
    auto_refresh_enabled: false,
    settings_json: {},
    metadata_cache: { verification_status: "oauth_verified" },
    last_sync_at: null,
    last_verified_at: null,
    last_error: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

test("includes a verified, agency-visible OAuth signal for staff", () => {
  const out = selectVisibleVerifiedAccounts([row({})], "staff");
  assert.equal(out.length, 1);
  assert.equal(out[0].provider, "instagram");
  assert.equal(out[0].label, "Instagram");
  assert.equal(out[0].accountLabel, "@studio");
});

test("excludes a manual (unverified) link even if trust_signal_enabled", () => {
  const out = selectVisibleVerifiedAccounts(
    [row({ connection_method: "manual", metadata_cache: {} })],
    "staff",
  );
  assert.deepEqual(out, []);
});

test("excludes a connected account whose trust signal is OFF", () => {
  const out = selectVisibleVerifiedAccounts(
    [row({ trust_signal_enabled: false })],
    "staff",
  );
  assert.deepEqual(out, []);
});

test("excludes a verified account not marked oauth_verified", () => {
  const out = selectVisibleVerifiedAccounts(
    [row({ metadata_cache: { verification_status: "manual_unverified" } })],
    "staff",
  );
  assert.deepEqual(out, []);
});

test("respects agency_visible=false for the staff audience", () => {
  const out = selectVisibleVerifiedAccounts([row({ agency_visible: false })], "staff");
  assert.deepEqual(out, []);
});

test("respects talent_visible=false for the talent audience", () => {
  // Hidden from talent but still visible to staff.
  const r = row({ talent_visible: false, agency_visible: true });
  assert.deepEqual(selectVisibleVerifiedAccounts([r], "talent"), []);
  assert.equal(selectVisibleVerifiedAccounts([r], "staff").length, 1);
});

test("never leaks private fields — only provider/label/accountLabel", () => {
  const out = selectVisibleVerifiedAccounts([row({})], "staff");
  assert.deepEqual(Object.keys(out[0]).sort(), [
    "accountLabel",
    "label",
    "provider",
  ]);
});

test("null account label projects to null (no fabrication)", () => {
  const out = selectVisibleVerifiedAccounts(
    [row({ provider_account_label: null })],
    "staff",
  );
  assert.equal(out[0].accountLabel, null);
});
