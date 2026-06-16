/**
 * rollout.test.ts — WS-D D3 unit tests for the pure staged-rollout gate.
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test \
 *         src/lib/site-admin/builder-core/templates/rollout.test.ts
 *
 * Covers:
 *   1. null tenant ⇒ true (never hide from platform / Lab authors)
 *   2. denylist beats allowlist (and beats the bucket)
 *   3. allowlist ⇒ true (bypasses the % bucket)
 *   4. percentage bucketing is deterministic + the GOLDEN buckets are FROZEN
 *   5. 0% ⇒ only the allowlist sees it
 *   6. 100% (and null %) ⇒ everyone sees it (minus the denylist)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  templateRolloutAllowed,
  deterministicBucket,
  type TemplateRolloutFields,
} from "./rollout";
import {
  normalizeRolloutPatch,
  normalizeTenantIdList,
} from "./registry-rows";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const TENANT_CANARY = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function row(over: Partial<TemplateRolloutFields> = {}): TemplateRolloutFields {
  return {
    id: "tmpl-a",
    rollout_percentage: 100,
    tenant_allowlist: [],
    tenant_denylist: [],
    ...over,
  };
}

describe("templateRolloutAllowed", () => {
  it("null/undefined tenant ⇒ always visible (authors never hidden)", () => {
    // Even a 0% rollout with the tenant in the denylist is visible to a null
    // tenant — the author/platform context bypasses rollout entirely.
    const r = row({ rollout_percentage: 0, tenant_denylist: [TENANT_A] });
    assert.equal(templateRolloutAllowed(r, null), true);
    assert.equal(templateRolloutAllowed(r, undefined), true);
  });

  it("denylist wins over allowlist and over the bucket", () => {
    const r = row({
      rollout_percentage: 100,
      tenant_allowlist: [TENANT_A],
      tenant_denylist: [TENANT_A],
    });
    assert.equal(templateRolloutAllowed(r, TENANT_A), false);
  });

  it("allowlist ⇒ visible even at 0% (bypasses the bucket)", () => {
    const r = row({ rollout_percentage: 0, tenant_allowlist: [TENANT_CANARY] });
    assert.equal(templateRolloutAllowed(r, TENANT_CANARY), true);
    // A tenant NOT on the allowlist at 0% stays hidden.
    assert.equal(templateRolloutAllowed(r, TENANT_A), false);
  });

  it("100% ⇒ everyone sees it (minus the denylist)", () => {
    const r = row({ rollout_percentage: 100, tenant_denylist: [TENANT_B] });
    assert.equal(templateRolloutAllowed(r, TENANT_A), true);
    assert.equal(templateRolloutAllowed(r, TENANT_CANARY), true);
    assert.equal(templateRolloutAllowed(r, TENANT_B), false);
  });

  it("null/undefined percentage ⇒ treated as 100 (back-compat)", () => {
    assert.equal(
      templateRolloutAllowed(row({ rollout_percentage: undefined }), TENANT_A),
      true,
    );
    assert.equal(
      templateRolloutAllowed(row({ rollout_percentage: null }), TENANT_A),
      true,
    );
    // Missing allow/deny arrays are also tolerated.
    assert.equal(
      templateRolloutAllowed({ id: "tmpl-a" }, TENANT_A),
      true,
    );
  });

  it("percentage bucketing: a tenant below the ceiling is in, above is out", () => {
    // TENANT_A on row "tmpl-a" lands in bucket 52 (frozen below). So a 53%
    // rollout admits it; a 52% rollout does not (bucket < percentage).
    assert.equal(deterministicBucket(TENANT_A, "tmpl-a"), 52);
    assert.equal(
      templateRolloutAllowed(row({ id: "tmpl-a", rollout_percentage: 53 }), TENANT_A),
      true,
    );
    assert.equal(
      templateRolloutAllowed(row({ id: "tmpl-a", rollout_percentage: 52 }), TENANT_A),
      false,
    );
  });

  it("bucketing is deterministic across calls", () => {
    const a1 = deterministicBucket(TENANT_B, "tmpl-b");
    const a2 = deterministicBucket(TENANT_B, "tmpl-b");
    assert.equal(a1, a2);
  });
});

describe("deterministicBucket — FROZEN golden values", () => {
  // These pin the exact FNV-1a algorithm + ":" join + mod 100. If a refactor
  // changes the hash, these break — which is the point: a silent re-bucketing
  // would move live tenants in/out of in-flight canaries. NEVER edit these to
  // make a changed hash pass; fix the hash instead.
  const GOLDEN: ReadonlyArray<[tenantId: string, rowId: string, bucket: number]> = [
    ["11111111-1111-1111-1111-111111111111", "tmpl-a", 52],
    ["22222222-2222-2222-2222-222222222222", "tmpl-b", 97],
    ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "tmpl-canary", 13],
    ["tenant-x", "row-1", 4],
    ["tenant-y", "row-1", 87],
    ["tenant-x", "row-2", 61],
  ];

  for (const [tenantId, rowId, expected] of GOLDEN) {
    it(`bucket(${tenantId}, ${rowId}) === ${expected}`, () => {
      const b = deterministicBucket(tenantId, rowId);
      assert.equal(b, expected);
      assert.ok(b >= 0 && b < 100, "bucket must be in [0, 100)");
    });
  }
});

describe("normalizeTenantIdList", () => {
  it("trims, lowercases, dedupes, and drops non-UUIDs", () => {
    const out = normalizeTenantIdList([
      " 11111111-1111-1111-1111-111111111111 ",
      "11111111-1111-1111-1111-111111111111", // dup
      "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", // upper → lower
      "not-a-uuid",
      "",
    ]);
    assert.deepEqual(out, [
      "11111111-1111-1111-1111-111111111111",
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ]);
  });

  it("undefined ⇒ []", () => {
    assert.deepEqual(normalizeTenantIdList(undefined), []);
  });
});

describe("normalizeRolloutPatch", () => {
  it("omitted fields ⇒ untouched columns (empty patch)", () => {
    assert.deepEqual(normalizeRolloutPatch({}), {});
  });

  it("clamps + rounds the percentage", () => {
    assert.equal(normalizeRolloutPatch({ rollout_percentage: 150 }).rollout_percentage, 100);
    assert.equal(normalizeRolloutPatch({ rollout_percentage: -5 }).rollout_percentage, 0);
    assert.equal(normalizeRolloutPatch({ rollout_percentage: 33.7 }).rollout_percentage, 34);
  });

  it("deny wins: a tenant in both lists is dropped from the allowlist", () => {
    const shared = "11111111-1111-1111-1111-111111111111";
    const allowOnly = "22222222-2222-2222-2222-222222222222";
    const patch = normalizeRolloutPatch({
      tenant_allowlist: [shared, allowOnly],
      tenant_denylist: [shared],
    });
    assert.deepEqual(patch.tenant_allowlist, [allowOnly]);
    assert.deepEqual(patch.tenant_denylist, [shared]);
  });

  it("normalizes both lists (filter + dedupe) and keeps 0% explicit", () => {
    const patch = normalizeRolloutPatch({
      rollout_percentage: 0,
      tenant_allowlist: ["bad", "33333333-3333-3333-3333-333333333333"],
      tenant_denylist: [],
    });
    assert.equal(patch.rollout_percentage, 0);
    assert.deepEqual(patch.tenant_allowlist, [
      "33333333-3333-3333-3333-333333333333",
    ]);
    assert.deepEqual(patch.tenant_denylist, []);
  });
});
