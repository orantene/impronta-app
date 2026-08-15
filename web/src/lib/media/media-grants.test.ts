/**
 * media-grants.test.ts — phase 3 invariants for the release rail.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *      node_modules/.bin/tsx --test src/lib/media/media-grants.test.ts
 *
 * These pin the two things that are easy to break silently:
 *   1. the scope round-trip — `requested_scopes` is a flat TEXT[] with the
 *      asset ids AND the target hub encoded into it, so encode/decode drifting
 *      apart would quietly release the wrong photos to the wrong hub;
 *   2. the cache-bust key set — a missed tag is a photo that stays visible
 *      after a revoke, which is the phase 3 risk the plan calls out by name.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bustKeysFor,
  buildReleaseScopes,
  isMediaReleaseRequest,
  parseReleaseScopes,
} from "@/lib/site-admin/server/media-grants";

const ASSET_1 = "11111111-1111-1111-1111-111111111111";
const ASSET_2 = "22222222-2222-2222-2222-222222222222";
const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TARGET = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TALENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

// ─── 1. scope encoding round-trips ──────────────────────────────────────────

test("a targeted release round-trips through requested_scopes", () => {
  const scopes = buildReleaseScopes([ASSET_1, ASSET_2], TARGET);
  const parsed = parseReleaseScopes(scopes);
  assert.deepEqual(parsed.assetIds, [ASSET_1, ASSET_2]);
  assert.equal(parsed.targetTenantId, TARGET);
});

test("an 'anywhere' release round-trips as a null target", () => {
  const parsed = parseReleaseScopes(buildReleaseScopes([ASSET_1], null));
  assert.deepEqual(parsed.assetIds, [ASSET_1]);
  assert.equal(parsed.targetTenantId, null, "null means all_hubs, never a tenant id");
});

test("a target entry is never mistaken for an asset id", () => {
  const parsed = parseReleaseScopes(buildReleaseScopes([ASSET_1], TARGET));
  assert.ok(!parsed.assetIds.includes(TARGET), "the target hub must not leak into the asset list");
});

test("unrelated scopes are ignored, not parsed as assets", () => {
  // The same table carries identity/rates/etc. consent requests. A media
  // decision must never act on one of those.
  const parsed = parseReleaseScopes(["identity", "rates", `media.release:${ASSET_1}`]);
  assert.deepEqual(parsed.assetIds, [ASSET_1]);
});

test("isMediaReleaseRequest separates media asks from the other consent flows", () => {
  assert.equal(isMediaReleaseRequest(["identity", "rates"]), false);
  assert.equal(isMediaReleaseRequest(null), false);
  assert.equal(isMediaReleaseRequest([]), false);
  assert.equal(isMediaReleaseRequest(buildReleaseScopes([ASSET_1], null)), true);
});

test("empty scopes decode to an empty ask rather than throwing", () => {
  const parsed = parseReleaseScopes(null);
  assert.deepEqual(parsed.assetIds, []);
  assert.equal(parsed.targetTenantId, null);
});

// ─── 2. cache busting ───────────────────────────────────────────────────────

test("a targeted grant busts BOTH the owner and the target hub", () => {
  const keys = bustKeysFor(TALENT, OWNER, TARGET);
  const tenantIds = keys.map((k) => k.tenantId).sort();
  assert.deepEqual(tenantIds, [OWNER, TARGET].sort());
  assert.ok(keys.every((k) => k.talentProfileId === TALENT));
});

test("an 'anywhere' grant still busts the owner hub", () => {
  const keys = bustKeysFor(TALENT, OWNER, null);
  assert.deepEqual(keys, [{ tenantId: OWNER, talentProfileId: TALENT }]);
});

test("owner === target does not produce a duplicate bust", () => {
  assert.equal(bustKeysFor(TALENT, OWNER, OWNER).length, 1);
});
