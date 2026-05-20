// canonical-shadow.test.ts
//
// Tests for the Phase 6 P5-ζ shadow-read primitive. Verifies the
// behavior-neutral contract (legacy always returned, canonical never
// changes the result) and the mismatch-logging behavior.
//
// Run: npx tsx --test src/lib/field-engine/canonical-shadow.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  isCanonicalReadShadowEnabled,
  withCanonicalShadow,
} from "@/lib/field-engine/canonical-shadow";

// Helper to run a test with a specific env-flag value. Cleans up after.
function withEnvFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.ENGINE_CANONICAL_READ_SHADOW;
  if (value === undefined) {
    delete process.env.ENGINE_CANONICAL_READ_SHADOW;
  } else {
    process.env.ENGINE_CANONICAL_READ_SHADOW = value;
  }
  return fn().finally(() => {
    if (prev === undefined) {
      delete process.env.ENGINE_CANONICAL_READ_SHADOW;
    } else {
      process.env.ENGINE_CANONICAL_READ_SHADOW = prev;
    }
  });
}

// ─── isCanonicalReadShadowEnabled ────────────────────────────────────────────

test("isCanonicalReadShadowEnabled: unset → false", async () => {
  await withEnvFlag(undefined, async () => {
    assert.equal(isCanonicalReadShadowEnabled(), false);
  });
});

test("isCanonicalReadShadowEnabled: '0' → false", async () => {
  await withEnvFlag("0", async () => {
    assert.equal(isCanonicalReadShadowEnabled(), false);
  });
});

test("isCanonicalReadShadowEnabled: 'false' → false", async () => {
  await withEnvFlag("false", async () => {
    assert.equal(isCanonicalReadShadowEnabled(), false);
  });
});

test("isCanonicalReadShadowEnabled: 'no' → false (only '1'/'true' enable)", async () => {
  await withEnvFlag("no", async () => {
    assert.equal(isCanonicalReadShadowEnabled(), false);
  });
});

test("isCanonicalReadShadowEnabled: '1' → true", async () => {
  await withEnvFlag("1", async () => {
    assert.equal(isCanonicalReadShadowEnabled(), true);
  });
});

test("isCanonicalReadShadowEnabled: 'true' → true", async () => {
  await withEnvFlag("true", async () => {
    assert.equal(isCanonicalReadShadowEnabled(), true);
  });
});

// ─── withCanonicalShadow: shadow OFF (default) ───────────────────────────────

test("withCanonicalShadow: flag unset → legacy ran, canonical SKIPPED, matched=null", async () => {
  await withEnvFlag(undefined, async () => {
    let canonicalCalled = false;
    const r = await withCanonicalShadow({
      readerSite: "test-1",
      legacy: async () => ({ value: 42 }),
      canonical: async () => {
        canonicalCalled = true;
        return { value: 999 };
      },
    });
    assert.deepEqual(r.result, { value: 42 });
    assert.equal(r.canonical, null);
    assert.equal(r.matched, null);
    assert.equal(canonicalCalled, false, "canonical fn should not be called when flag is off");
  });
});

test("withCanonicalShadow: flag off + no canonical fn → still returns legacy", async () => {
  await withEnvFlag(undefined, async () => {
    const r = await withCanonicalShadow({
      readerSite: "test-no-canonical",
      legacy: async () => "legacy-value",
      // canonical: undefined — early adoption pattern
    });
    assert.equal(r.result, "legacy-value");
    assert.equal(r.canonical, null);
    assert.equal(r.matched, null);
  });
});

// ─── withCanonicalShadow: shadow ON, results MATCH ───────────────────────────

test("withCanonicalShadow: flag on + match → result is legacy, matched=true", async () => {
  await withEnvFlag("1", async () => {
    const r = await withCanonicalShadow({
      readerSite: "test-match",
      legacy: async () => ({ id: "a", value: 1 }),
      canonical: async () => ({ id: "a", value: 1 }),
    });
    assert.deepEqual(r.result, { id: "a", value: 1 });
    assert.deepEqual(r.canonical, { id: "a", value: 1 });
    assert.equal(r.matched, true);
  });
});

test("withCanonicalShadow: arrays compared by JSON equality", async () => {
  await withEnvFlag("1", async () => {
    const r = await withCanonicalShadow({
      readerSite: "test-array",
      legacy: async () => [1, 2, 3],
      canonical: async () => [1, 2, 3],
    });
    assert.equal(r.matched, true);
  });
});

// ─── withCanonicalShadow: shadow ON, results MISMATCH ────────────────────────

test("withCanonicalShadow: flag on + mismatch → result is still LEGACY, matched=false", async () => {
  await withEnvFlag("1", async () => {
    const r = await withCanonicalShadow({
      readerSite: "test-mismatch",
      legacy: async () => ({ value: "legacy-data" }),
      canonical: async () => ({ value: "canonical-drifted" }),
    });
    // CRITICAL CONTRACT: legacy is always returned, even on mismatch.
    assert.deepEqual(r.result, { value: "legacy-data" });
    assert.deepEqual(r.canonical, { value: "canonical-drifted" });
    assert.equal(r.matched, false);
  });
});

// ─── withCanonicalShadow: canonical THROWS ───────────────────────────────────

test("withCanonicalShadow: canonical throws → legacy still returned, matched=false", async () => {
  await withEnvFlag("1", async () => {
    const r = await withCanonicalShadow({
      readerSite: "test-throws",
      legacy: async () => "legacy-ok",
      canonical: async () => {
        throw new Error("canonical exploded");
      },
    });
    // Same critical contract — caller never sees the canonical failure.
    assert.equal(r.result, "legacy-ok");
    assert.equal(r.canonical, null);
    assert.equal(r.matched, false);
  });
});

// ─── withCanonicalShadow: custom compare ─────────────────────────────────────

test("withCanonicalShadow: custom compare → row-order-insensitive match", async () => {
  await withEnvFlag("1", async () => {
    // Set ordering differs but both contain the same elements.
    const r = await withCanonicalShadow({
      readerSite: "test-set-compare",
      legacy: async () => [3, 1, 2],
      canonical: async () => [1, 2, 3],
      compare: (a, b) => {
        // Treat as set
        const aSorted = [...a].sort();
        const bSorted = [...b].sort();
        return JSON.stringify(aSorted) === JSON.stringify(bSorted);
      },
    });
    assert.equal(r.matched, true);
  });
});

test("withCanonicalShadow: custom compare rejects difference default would accept (e.g. timestamp ignore)", async () => {
  await withEnvFlag("1", async () => {
    const legacy = { id: "a", value: 5, updated_at: "2026-05-20T01:00:00Z" };
    const canonical = { id: "a", value: 5, updated_at: "2026-05-20T02:00:00Z" };
    // Default compare would flag mismatch on updated_at; custom skips it.
    const r = await withCanonicalShadow({
      readerSite: "test-ignore-ts",
      legacy: async () => legacy,
      canonical: async () => canonical,
      compare: (a, b) => a.id === b.id && a.value === b.value,
    });
    assert.equal(r.matched, true);
  });
});

// ─── Parallelism — canonical does not block legacy ──────────────────────────

test("withCanonicalShadow: legacy and canonical run in parallel (not serial)", async () => {
  await withEnvFlag("1", async () => {
    const t0 = Date.now();
    let legacyStartedAt = 0;
    let canonicalStartedAt = 0;
    await withCanonicalShadow({
      readerSite: "test-parallel",
      legacy: async () => {
        legacyStartedAt = Date.now();
        await new Promise((res) => setTimeout(res, 50));
        return "L";
      },
      canonical: async () => {
        canonicalStartedAt = Date.now();
        await new Promise((res) => setTimeout(res, 50));
        return "L";
      },
    });
    const totalMs = Date.now() - t0;
    // Both started within ~20ms of each other (parallel), not 50ms+ apart (serial).
    assert.ok(
      Math.abs(legacyStartedAt - canonicalStartedAt) < 20,
      `legacy and canonical should start within ~20ms; observed ${Math.abs(legacyStartedAt - canonicalStartedAt)}ms apart`,
    );
    // Total wall-clock should be ~50ms (one delay), not ~100ms (serial sum).
    assert.ok(totalMs < 100, `parallel total should be < 100ms; observed ${totalMs}ms`);
  });
});
