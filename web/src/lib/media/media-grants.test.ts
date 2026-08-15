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
  mergeAffectedHubIds,
  parseReleaseScopes,
  selectGrantsToRevoke,
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

// ─── 3. Batch A / A5 — the all_hubs bust set ────────────────────────────────
//
// `scope='all_hubs'` carries tenant_id NULL by check constraint, so the old
// `bustKeysFor(talent, owner, grant.tenant_id)` busted the owner and NOBODY
// else. Every third hub that had been showing the photo kept serving it until
// its own cache expired, while the revoke reported success.

const HUB_C = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const HUB_D = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

test("an all_hubs bust reaches every resolved hub, not just the owner", () => {
  const affected = mergeAffectedHubIds([HUB_C], [HUB_D]);
  const keys = bustKeysFor(TALENT, OWNER, null, affected);
  assert.deepEqual(
    keys.map((k) => k.tenantId).sort(),
    [OWNER, HUB_C, HUB_D].sort(),
    "roster hubs AND curating hubs must both be busted",
  );
});

test("the affected-hub union de-duplicates and drops empties", () => {
  // A hub that both rosters the talent and curates the asset appears once; a
  // null tenant_id from a partial row never becomes a bogus cache tag.
  assert.deepEqual(mergeAffectedHubIds([HUB_C, null], [HUB_C, undefined, ""]), [HUB_C]);
});

test("an all_hubs bust with no resolved hubs still busts the owner", () => {
  assert.deepEqual(bustKeysFor(TALENT, OWNER, null, []), [
    { tenantId: OWNER, talentProfileId: TALENT },
  ]);
});

test("extra hubs never displace a named target", () => {
  const keys = bustKeysFor(TALENT, OWNER, TARGET, [HUB_C]);
  assert.deepEqual(keys.map((k) => k.tenantId).sort(), [OWNER, TARGET, HUB_C].sort());
});

// ─── 4. Batch A / A6 + D-6 — revoke is per target ───────────────────────────
//
// The UI card names one hub. The UPDATE carried no tenant filter, so ending a
// release to B also killed the live releases to C and D, silently.

const grant = (id: string, tenant_id: string | null, grant_kind = "owner") => ({
  id,
  grant_kind,
  tenant_id,
});

test("revoking a named hub leaves the other hubs' releases alone", () => {
  const live = [grant("g-b", TARGET), grant("g-c", HUB_C), grant("g-d", HUB_D)];
  const picked = selectGrantsToRevoke(live, TARGET);
  assert.deepEqual(picked.map((g) => g.id), ["g-b"]);
});

test("revoking everywhere (null target) ends every owner grant", () => {
  const live = [grant("g-b", TARGET), grant("g-all", null), grant("g-c", HUB_C)];
  const picked = selectGrantsToRevoke(live, null);
  assert.deepEqual(picked.map((g) => g.id).sort(), ["g-all", "g-b", "g-c"]);
});

test("a per-target revoke does not silently narrow an all_hubs grant", () => {
  // "Anywhere except B" is not a state media_grants can hold. Ending the
  // all_hubs row here would take the photo off C and D too — the A6 bug in the
  // other direction — so it is left alone and the caller reports nothing ended.
  const picked = selectGrantsToRevoke([grant("g-all", null)], TARGET);
  assert.deepEqual(picked, []);
});

test("the subject's own consent key is never revoked by the owner", () => {
  const live = [grant("g-owner", TARGET), grant("g-subject", TARGET, "subject")];
  assert.deepEqual(
    selectGrantsToRevoke(live, TARGET).map((g) => g.id),
    ["g-owner"],
    "a workspace revoking its release must not withdraw the talent's consent",
  );
  assert.deepEqual(
    selectGrantsToRevoke(live, null).map((g) => g.id),
    ["g-owner"],
  );
});
