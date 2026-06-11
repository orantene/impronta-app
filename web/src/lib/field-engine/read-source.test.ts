// read-source.test.ts
// Unit tests for the Phase 2 field-engine read-source flag parser + the
// dispatch seam. Pure functions only (no DB, no env mutation of the live
// readers). Run:
//   npx tsx --test src/lib/field-engine/read-source.test.ts
//
// Wired into `npm run test:fields` (and thus `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldEngineReadSourceFlags,
  readSourceForSurface,
  surfaceReadsCanonical,
  DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  FIELD_ENGINE_READ_SURFACES,
  type FieldEngineReadSourceFlags,
} from "@/lib/field-engine/read-source-types";
import {
  readFieldSurface,
  readFieldSurfaceBoth,
  type FieldSurfaceReaderPair,
} from "@/lib/field-engine/read-source";

// ── Flag parser ──────────────────────────────────────────────────────────────

test("parser: unset/empty/whitespace → all `a` (behaviour-neutral default)", () => {
  assert.deepEqual(
    parseFieldEngineReadSourceFlags(undefined),
    DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineReadSourceFlags(""),
    DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineReadSourceFlags("   "),
    DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  );
  // Every surface defaults to `a` — the whole scaffold is behaviour-neutral.
  for (const s of FIELD_ENGINE_READ_SURFACES) {
    assert.equal(DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS[s], "a");
  }
});

test("parser: `b` flips every surface; `a` is the global kill switch (all a)", () => {
  assert.deepEqual(parseFieldEngineReadSourceFlags("b"), {
    directory_facets: "b",
    public_sidebar: "b",
    dashboard_nav: "b",
    directory_cards: "b",
    ai_search_doc: "b",
  });
  // `a` (or `A`) must revert every surface — the explicit rollback.
  assert.deepEqual(parseFieldEngineReadSourceFlags("A"), {
    directory_facets: "a",
    public_sidebar: "a",
    dashboard_nav: "a",
    directory_cards: "a",
    ai_search_doc: "a",
  });
});

test("parser: per-surface tokens layer over the default (others keep `a`)", () => {
  // Naming one surface leaves the rest at their default (`a`).
  assert.deepEqual(parseFieldEngineReadSourceFlags("public_sidebar:b"), {
    directory_facets: "a",
    public_sidebar: "b",
    dashboard_nav: "a",
    directory_cards: "a",
    ai_search_doc: "a",
  });
  // Multiple surfaces flipped explicitly.
  assert.deepEqual(
    parseFieldEngineReadSourceFlags("directory_facets:b,ai_search_doc:b"),
    {
      directory_facets: "b",
      public_sidebar: "a",
      dashboard_nav: "a",
      directory_cards: "a",
      ai_search_doc: "b",
    },
  );
  // Per-surface rollback: revert just one surface back to `a` while others stay.
  assert.deepEqual(
    parseFieldEngineReadSourceFlags("directory_facets:b,directory_facets:a"),
    DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS,
  );
});

test("parser: unknown surfaces/sources are ignored (keep default)", () => {
  assert.deepEqual(parseFieldEngineReadSourceFlags("bogus:b,public_sidebar:weird"), {
    directory_facets: "a",
    public_sidebar: "a", // weird source ignored → keeps default
    dashboard_nav: "a",
    directory_cards: "a",
    ai_search_doc: "a",
  });
  // Case-insensitive surface + source.
  assert.deepEqual(parseFieldEngineReadSourceFlags("PUBLIC_SIDEBAR:B"), {
    directory_facets: "a",
    public_sidebar: "b",
    dashboard_nav: "a",
    directory_cards: "a",
    ai_search_doc: "a",
  });
});

// ── Pure source helpers ──────────────────────────────────────────────────────

test("readSourceForSurface + surfaceReadsCanonical reflect the flags", () => {
  const flags: FieldEngineReadSourceFlags = parseFieldEngineReadSourceFlags(
    "public_sidebar:b",
  );
  assert.equal(readSourceForSurface(flags, "public_sidebar"), "b");
  assert.equal(readSourceForSurface(flags, "directory_facets"), "a");
  assert.equal(surfaceReadsCanonical(flags, "public_sidebar"), true);
  assert.equal(surfaceReadsCanonical(flags, "directory_facets"), false);
});

// ── Dispatch seam ─────────────────────────────────────────────────────────────
//
// readFieldSurface reads the LIVE env flag, so we drive it by setting
// process.env.FIELD_ENGINE_READ_SOURCE around each call. The pair is an
// in-memory fake (no DB) — the test asserts the DISPATCH + FALLBACK contract,
// not DB parity (that is the harness's job).

function fakePair(opts: {
  bThrows?: boolean;
}): FieldSurfaceReaderPair<[string], { src: "a" | "b"; arg: string }> {
  return {
    readA: async (arg: string) => ({ src: "a", arg }),
    readB: async (arg: string) => {
      if (opts.bThrows) throw new Error("b-read boom");
      return { src: "b", arg };
    },
  };
}

async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.FIELD_ENGINE_READ_SOURCE;
  if (value === undefined) delete process.env.FIELD_ENGINE_READ_SOURCE;
  else process.env.FIELD_ENGINE_READ_SOURCE = value;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.FIELD_ENGINE_READ_SOURCE;
    else process.env.FIELD_ENGINE_READ_SOURCE = prev;
  }
}

test("dispatch: default/`a` → reads A (byte-identical to today)", async () => {
  const out = await withFlag(undefined, () =>
    readFieldSurface("public_sidebar", fakePair({}), "x"),
  );
  assert.deepEqual(out, { src: "a", arg: "x" });
  const out2 = await withFlag("a", () =>
    readFieldSurface("public_sidebar", fakePair({}), "x"),
  );
  assert.deepEqual(out2, { src: "a", arg: "x" });
});

test("dispatch: surface flipped to `b` → reads B", async () => {
  const out = await withFlag("public_sidebar:b", () =>
    readFieldSurface("public_sidebar", fakePair({}), "y"),
  );
  assert.deepEqual(out, { src: "b", arg: "y" });
});

test("dispatch: a DIFFERENT surface flipped does not affect this surface", async () => {
  // directory_facets:b must NOT flip public_sidebar.
  const out = await withFlag("directory_facets:b", () =>
    readFieldSurface("public_sidebar", fakePair({}), "z"),
  );
  assert.deepEqual(out, { src: "a", arg: "z" });
});

test("dispatch: B-read that throws safe-falls-back to A (never hardens broken B)", async () => {
  const out = await withFlag("public_sidebar:b", () =>
    readFieldSurface("public_sidebar", fakePair({ bThrows: true }), "q"),
  );
  // Flag said b, but b threw → A result, surface stays up.
  assert.deepEqual(out, { src: "a", arg: "q" });
});

test("readFieldSurfaceBoth runs both readers regardless of the flag (proof helper)", async () => {
  const both = await withFlag("a", () => readFieldSurfaceBoth(fakePair({}), "p"));
  assert.deepEqual(both.a, { src: "a", arg: "p" });
  assert.deepEqual(both.b, { src: "b", arg: "p" });
});
