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

test("parser: unset/empty/whitespace → the default flags", () => {
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
  // T2.1 flipped directory_facets to `b`; T2.2 flipped public_sidebar to `b`;
  // T2.3 flipped dashboard_nav to `b`; T2.4 flipped directory_cards to `b`.
  // The one not-yet-repointed surface still defaults to `a`.
  assert.equal(DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS.directory_facets, "b");
  assert.equal(DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS.public_sidebar, "b");
  assert.equal(DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS.dashboard_nav, "b");
  assert.equal(DEFAULT_FIELD_ENGINE_READ_SOURCE_FLAGS.directory_cards, "b");
  for (const s of FIELD_ENGINE_READ_SURFACES) {
    if (s === "directory_facets" || s === "public_sidebar" || s === "dashboard_nav" || s === "directory_cards") continue;
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
  // `a` (or `A`) must revert every surface — the explicit rollback / kill switch.
  assert.deepEqual(parseFieldEngineReadSourceFlags("A"), {
    directory_facets: "a",
    public_sidebar: "a",
    dashboard_nav: "a",
    directory_cards: "a",
    ai_search_doc: "a",
  });
});

test("parser: per-surface tokens layer over the default (others keep their default)", () => {
  // Naming one surface leaves the rest at their default (directory_facets `b`
  // post-T2.1, public_sidebar `b` post-T2.2, dashboard_nav `b` post-T2.3,
  // directory_cards `b` post-T2.4, ai_search_doc `a`).
  assert.deepEqual(parseFieldEngineReadSourceFlags("ai_search_doc:b"), {
    directory_facets: "b",
    public_sidebar: "b",
    dashboard_nav: "b",
    directory_cards: "b",
    ai_search_doc: "b",
  });
  // Per-surface rollback (directory_cards kill switch): revert just that surface
  // to `a` while the rest keep their `b` default.
  assert.deepEqual(parseFieldEngineReadSourceFlags("directory_cards:a"), {
    directory_facets: "b",
    public_sidebar: "b",
    dashboard_nav: "b",
    directory_cards: "a",
    ai_search_doc: "a",
  });
  // Multiple surfaces flipped explicitly (public_sidebar + dashboard_nav keep `b` default).
  assert.deepEqual(
    parseFieldEngineReadSourceFlags("directory_facets:b,ai_search_doc:b"),
    {
      directory_facets: "b",
      public_sidebar: "b",
      dashboard_nav: "b",
      directory_cards: "b",
      ai_search_doc: "b",
    },
  );
  // Per-surface rollback (the dashboard_nav kill switch): revert just that
  // surface to `a` while the rest keep their default.
  assert.deepEqual(parseFieldEngineReadSourceFlags("dashboard_nav:a"), {
    directory_facets: "b",
    public_sidebar: "b",
    dashboard_nav: "a",
    directory_cards: "b",
    ai_search_doc: "a",
  });
});

test("parser: unknown surfaces/sources are ignored (keep default)", () => {
  assert.deepEqual(parseFieldEngineReadSourceFlags("bogus:b,dashboard_nav:weird"), {
    directory_facets: "b", // T2.1 default
    public_sidebar: "b", // T2.2 default
    dashboard_nav: "b", // weird source ignored → keeps T2.3 default (`b`)
    directory_cards: "b", // T2.4 default
    ai_search_doc: "a",
  });
  // Case-insensitive surface + source — explicit rollback of public_sidebar.
  assert.deepEqual(parseFieldEngineReadSourceFlags("PUBLIC_SIDEBAR:A"), {
    directory_facets: "b", // T2.1 default
    public_sidebar: "a",
    dashboard_nav: "b", // T2.3 default
    directory_cards: "b", // T2.4 default
    ai_search_doc: "a",
  });
});

// ── Pure source helpers ──────────────────────────────────────────────────────

test("readSourceForSurface + surfaceReadsCanonical reflect the flags", () => {
  const flags: FieldEngineReadSourceFlags = parseFieldEngineReadSourceFlags(
    "dashboard_nav:b",
  );
  assert.equal(readSourceForSurface(flags, "dashboard_nav"), "b");
  // directory_facets defaults to `b` post-T2.1; public_sidebar `b` post-T2.2;
  // directory_cards defaults to `b` post-T2.4; ai_search_doc still `a`.
  assert.equal(readSourceForSurface(flags, "directory_facets"), "b");
  assert.equal(readSourceForSurface(flags, "public_sidebar"), "b");
  assert.equal(readSourceForSurface(flags, "directory_cards"), "b");
  assert.equal(readSourceForSurface(flags, "ai_search_doc"), "a");
  assert.equal(surfaceReadsCanonical(flags, "dashboard_nav"), true);
  assert.equal(surfaceReadsCanonical(flags, "directory_facets"), true);
  assert.equal(surfaceReadsCanonical(flags, "public_sidebar"), true);
  assert.equal(surfaceReadsCanonical(flags, "directory_cards"), true);
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
  // dashboard_nav now defaults to `b` (T2.3 activation); unset flag → B.
  const out = await withFlag(undefined, () =>
    readFieldSurface("dashboard_nav", fakePair({}), "x"),
  );
  assert.deepEqual(out, { src: "b", arg: "x" });
  // The global kill switch forces dashboard_nav back to A.
  const out2 = await withFlag("a", () =>
    readFieldSurface("dashboard_nav", fakePair({}), "x"),
  );
  assert.deepEqual(out2, { src: "a", arg: "x" });
  // public_sidebar now defaults to `b` (T2.2 activation); unset flag → B.
  const out3 = await withFlag(undefined, () =>
    readFieldSurface("public_sidebar", fakePair({}), "x"),
  );
  assert.deepEqual(out3, { src: "b", arg: "x" });
  // The global kill switch forces public_sidebar back to A.
  const out4 = await withFlag("a", () =>
    readFieldSurface("public_sidebar", fakePair({}), "x"),
  );
  assert.deepEqual(out4, { src: "a", arg: "x" });
  // directory_cards now defaults to `b` (T2.4 activation); unset flag → B.
  const out5 = await withFlag(undefined, () =>
    readFieldSurface("directory_cards", fakePair({}), "x"),
  );
  assert.deepEqual(out5, { src: "b", arg: "x" });
  // The global kill switch forces directory_cards back to A.
  const out6 = await withFlag("a", () =>
    readFieldSurface("directory_cards", fakePair({}), "x"),
  );
  assert.deepEqual(out6, { src: "a", arg: "x" });
});

test("dispatch: surface flipped to `b` → reads B", async () => {
  // directory_cards defaults to `b` post-T2.4; ai_search_doc is still `a`.
  // Flip ai_search_doc to b explicitly.
  const out = await withFlag("ai_search_doc:b", () =>
    readFieldSurface("ai_search_doc", fakePair({}), "y"),
  );
  assert.deepEqual(out, { src: "b", arg: "y" });
  // Per-surface kill switch: dashboard_nav:a overrides the `b` default back to A.
  const out2 = await withFlag("dashboard_nav:a", () =>
    readFieldSurface("dashboard_nav", fakePair({}), "y"),
  );
  assert.deepEqual(out2, { src: "a", arg: "y" });
  // directory_cards kill switch: revert to A.
  const out3 = await withFlag("directory_cards:a", () =>
    readFieldSurface("directory_cards", fakePair({}), "y"),
  );
  assert.deepEqual(out3, { src: "a", arg: "y" });
});

test("dispatch: a DIFFERENT surface flipped does not affect this surface", async () => {
  // dashboard_nav:a (kill-switch for T2.3) must NOT flip directory_cards
  // (directory_cards defaults to `b` post-T2.4 — confirms isolation).
  const out = await withFlag("dashboard_nav:a", () =>
    readFieldSurface("directory_cards", fakePair({}), "z"),
  );
  assert.deepEqual(out, { src: "b", arg: "z" });
  // directory_cards:a kill-switch must NOT affect ai_search_doc (stays `a`).
  const out2 = await withFlag("directory_cards:a", () =>
    readFieldSurface("ai_search_doc", fakePair({}), "z"),
  );
  assert.deepEqual(out2, { src: "a", arg: "z" });
});

test("dispatch: B-read that throws safe-falls-back to A (never hardens broken B)", async () => {
  // public_sidebar defaults to `b`; a throwing B-read must degrade to A so the
  // live sidebar never hardens into a broken surface.
  const out = await withFlag(undefined, () =>
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
