import test from "node:test";
import assert from "node:assert/strict";

import {
  connectionNeedsAttention,
  summarizeTalentConnections,
} from "./proof-health";
import type { TalentIntegrationRow } from "./repository";

function row(overrides: Partial<TalentIntegrationRow>): TalentIntegrationRow {
  return {
    id: "t1",
    talent_profile_id: "tp1",
    provider_key: "youtube",
    provider_account_id: null,
    provider_account_label: null,
    connection_method: "oauth",
    status: "connected",
    scopes: [],
    consent_version: "talent-connections-v1",
    public_badge_enabled: false,
    agency_visible: true,
    public_profile_enabled: false,
    personal_site_enabled: false,
    auto_refresh_enabled: false,
    calendar_availability_enabled: false,
    calendar_write_enabled: false,
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

const NOW = Date.parse("2026-06-04T00:00:00Z");

// ── connectionNeedsAttention ────────────────────────────────────────────────

test("needs_reauth status → needs attention", () => {
  assert.equal(
    connectionNeedsAttention({ status: "needs_reauth", metadata_cache: {} }, NOW),
    true,
  );
});

test("error status → needs attention", () => {
  assert.equal(
    connectionNeedsAttention({ status: "error", metadata_cache: {} }, NOW),
    true,
  );
});

test("expired token in metadata → needs attention", () => {
  assert.equal(
    connectionNeedsAttention(
      { status: "connected", metadata_cache: { token_expires_at: "2026-06-01T00:00:00Z" } },
      NOW,
    ),
    true,
  );
});

test("future token expiry → healthy", () => {
  assert.equal(
    connectionNeedsAttention(
      { status: "connected", metadata_cache: { token_expires_at: "2026-12-01T00:00:00Z" } },
      NOW,
    ),
    false,
  );
});

test("connected with no expiry → healthy", () => {
  assert.equal(
    connectionNeedsAttention({ status: "connected", metadata_cache: {} }, NOW),
    false,
  );
});

// ── summarizeTalentConnections ──────────────────────────────────────────────

test("counts verified + visible, and excludes agency-hidden rows", () => {
  const out = summarizeTalentConnections(
    [
      row({ provider_key: "youtube" }), // verified, visible
      row({ provider_key: "spotify", metadata_cache: {} }), // visible, not verified
      row({ provider_key: "tiktok", agency_visible: false }), // hidden → excluded
    ],
    3,
    true,
    NOW,
  );
  assert.equal(out.visibleConnectionCount, 2);
  assert.equal(out.verifiedConnectionCount, 1);
  assert.equal(out.selectedPublicMediaCount, 3);
  assert.equal(out.hasClientTrustProof, true);
  assert.equal(out.connections.length, 2);
});

test("tallies needs-attention connections", () => {
  const out = summarizeTalentConnections(
    [
      row({ provider_key: "youtube", status: "needs_reauth" }),
      row({
        provider_key: "spotify",
        metadata_cache: { token_expires_at: "2026-01-01T00:00:00Z" },
      }),
      row({ provider_key: "vimeo" }), // healthy
    ],
    0,
    false,
    NOW,
  );
  assert.equal(out.needsAttentionCount, 2);
  assert.equal(out.hasClientTrustProof, false);
});

test("connection rollup never includes secret fields", () => {
  const out = summarizeTalentConnections([row({})], 0, false, NOW);
  assert.deepEqual(Object.keys(out.connections[0]).sort(), [
    "agencyVisible",
    "needsAttention",
    "provider",
    "status",
    "verified",
  ]);
});
