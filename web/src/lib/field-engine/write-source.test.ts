// write-source.test.ts
// Unit tests for the Phase 2.5c field-engine WRITE-source flag parser + the
// per-surface dispatch helpers. Pure functions only (no DB; the env-reading
// helpers are exercised by mutating process.env around each call). Run:
//   npx tsx --test src/lib/field-engine/write-source.test.ts
//
// Wired into `npm run test:fields` (and thus `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldEngineWriteSourceFlags,
  writeSourceForSurface,
  surfaceWritesCanonical,
  DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS,
  FIELD_ENGINE_WRITE_SURFACES,
} from "@/lib/field-engine/write-source-types";
import { activeWriteSource } from "@/lib/field-engine/write-source";

// ── Flag parser ──────────────────────────────────────────────────────────────

test("parser: unset/empty/whitespace → the default flags (shell `b`)", () => {
  assert.deepEqual(
    parseFieldEngineWriteSourceFlags(undefined),
    DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineWriteSourceFlags(""),
    DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineWriteSourceFlags("   "),
    DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS,
  );
  // T2.6 activation: shell now defaults to B-first.
  assert.equal(DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS.shell, "b");
});

test("parser: `b` flips every surface; `a` is the global kill switch (all a)", () => {
  assert.deepEqual(parseFieldEngineWriteSourceFlags("b"), { shell: "b" });
  // `a` (or `A`) reverts every surface — the explicit rollback / kill switch.
  assert.deepEqual(parseFieldEngineWriteSourceFlags("A"), { shell: "a" });
});

test("parser: per-surface token flips just that surface", () => {
  assert.deepEqual(parseFieldEngineWriteSourceFlags("shell:b"), { shell: "b" });
  // Per-surface kill switch back to A-first.
  assert.deepEqual(parseFieldEngineWriteSourceFlags("shell:a"), { shell: "a" });
  // Case-insensitive surface + source.
  assert.deepEqual(parseFieldEngineWriteSourceFlags("SHELL:B"), { shell: "b" });
});

test("parser: unknown surfaces/sources are ignored (keep default)", () => {
  assert.deepEqual(parseFieldEngineWriteSourceFlags("bogus:b,shell:weird"), {
    shell: "b", // weird source ignored → keeps default (now `b` post-T2.6)
  });
  assert.deepEqual(parseFieldEngineWriteSourceFlags("unknown:b"), { shell: "b" });
});

test("FIELD_ENGINE_WRITE_SURFACES lists exactly the keys of the default flags", () => {
  assert.deepEqual(
    [...FIELD_ENGINE_WRITE_SURFACES].sort(),
    Object.keys(DEFAULT_FIELD_ENGINE_WRITE_SOURCE_FLAGS).sort(),
  );
});

// ── Pure source helpers ──────────────────────────────────────────────────────

test("writeSourceForSurface + surfaceWritesCanonical reflect the flags", () => {
  const aFlags = parseFieldEngineWriteSourceFlags("shell:a");
  assert.equal(writeSourceForSurface(aFlags, "shell"), "a");
  assert.equal(surfaceWritesCanonical(aFlags, "shell"), false);

  const bFlags = parseFieldEngineWriteSourceFlags("shell:b");
  assert.equal(writeSourceForSurface(bFlags, "shell"), "b");
  assert.equal(surfaceWritesCanonical(bFlags, "shell"), true);
});

// ── Server-only env reader ────────────────────────────────────────────────────
//
// activeWriteSource reads the LIVE env flag, so we drive it by setting
// process.env.FIELD_ENGINE_WRITE_SOURCE around each call.

async function withFlag<T>(
  value: string | undefined,
  fn: () => T,
): Promise<T> {
  const prev = process.env.FIELD_ENGINE_WRITE_SOURCE;
  if (value === undefined) delete process.env.FIELD_ENGINE_WRITE_SOURCE;
  else process.env.FIELD_ENGINE_WRITE_SOURCE = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.FIELD_ENGINE_WRITE_SOURCE;
    else process.env.FIELD_ENGINE_WRITE_SOURCE = prev;
  }
}

test("activeWriteSource: default/unset → `b` (B-first, T2.6 activation)", async () => {
  const src = await withFlag(undefined, () => activeWriteSource("shell"));
  assert.equal(src, "b");
});

test("activeWriteSource: `shell:b` (and `b`) flips the shell to B-first", async () => {
  assert.equal(await withFlag("shell:b", () => activeWriteSource("shell")), "b");
  assert.equal(await withFlag("b", () => activeWriteSource("shell")), "b");
});

test("activeWriteSource: `a` kill switch forces shell back to A-first", async () => {
  assert.equal(await withFlag("a", () => activeWriteSource("shell")), "a");
  assert.equal(await withFlag("shell:a", () => activeWriteSource("shell")), "a");
});
