import assert from "node:assert/strict";
import test from "node:test";

import {
  SSO_HANDOFF_TTL_MS,
  atomicHandoffClaimWins,
  mintHandoffExpiresAt,
  normalizeHandoffHost,
  validateHandoffRow,
  type HandoffTokenRow,
} from "./sso-handoff-pure";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");

function row(over: Partial<HandoffTokenRow> = {}): HandoffTokenRow {
  return {
    user_id: "user-1",
    target_host: "studio.example.com",
    expires_at: mintHandoffExpiresAt(NOW),
    used_at: null,
    ...over,
  };
}

test("mint expiry is now + TTL (120s)", () => {
  assert.equal(SSO_HANDOFF_TTL_MS, 120_000);
  assert.equal(
    mintHandoffExpiresAt(NOW),
    new Date(NOW + 120_000).toISOString(),
  );
});

test("normalizeHandoffHost strips port and lowercases", () => {
  assert.equal(normalizeHandoffHost("Studio.Example.COM:443"), "studio.example.com");
});

test("redeem validate: happy path", () => {
  const result = validateHandoffRow(row(), "studio.example.com", NOW);
  assert.deepEqual(result, { ok: true });
});

test("redeem validate: missing row", () => {
  assert.deepEqual(validateHandoffRow(null, "studio.example.com", NOW), {
    ok: false,
    reason: "missing",
  });
});

test("redeem validate: already used (replay after claim)", () => {
  const used = row({ used_at: new Date(NOW - 1_000).toISOString() });
  assert.deepEqual(validateHandoffRow(used, "studio.example.com", NOW), {
    ok: false,
    reason: "used",
  });
});

test("redeem validate: expired", () => {
  const expired = row({
    expires_at: new Date(NOW - 1).toISOString(),
  });
  assert.deepEqual(validateHandoffRow(expired, "studio.example.com", NOW), {
    ok: false,
    reason: "expired",
  });
});

test("redeem validate: host mismatch", () => {
  assert.deepEqual(validateHandoffRow(row(), "other.example.com", NOW), {
    ok: false,
    reason: "host_mismatch",
  });
});

test("atomic claim: first wins, second loses (replay)", () => {
  assert.equal(atomicHandoffClaimWins(null), true);
  assert.equal(atomicHandoffClaimWins(undefined), true);
  // After first claim stamped used_at, a second redeem cannot claim.
  assert.equal(atomicHandoffClaimWins(new Date(NOW).toISOString()), false);
});

test("mint then redeem within TTL, reject after expiry", () => {
  const expiresAt = mintHandoffExpiresAt(NOW);
  const fresh = row({ expires_at: expiresAt });
  assert.deepEqual(
    validateHandoffRow(fresh, "studio.example.com", NOW + 60_000),
    { ok: true },
  );
  assert.deepEqual(
    validateHandoffRow(fresh, "studio.example.com", NOW + SSO_HANDOFF_TTL_MS + 1),
    { ok: false, reason: "expired" },
  );
});
