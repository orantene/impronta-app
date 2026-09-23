import test from "node:test";
import assert from "node:assert/strict";

import {
  hashBuiltinPayload,
  planBuiltinSync,
  type BuiltinThemeEntry,
  type ExistingBuiltinRow,
} from "./sync-builtins.server";

function entry(kind: "design" | "look", slug: string): BuiltinThemeEntry {
  return {
    kind,
    slug,
    title: `Title ${slug}`,
    summary: "Summary",
    category: kind === "design" ? "classic" : null,
    tags: ["a", "b"],
    required_talent_tier: "talent_basic",
    sort_order: 10,
    is_new_until: null,
    preview: {},
    buildPayload: () => ({}) as never,
  } as BuiltinThemeEntry;
}

// ── hashBuiltinPayload ───────────────────────────────────────────────────────

test("hashBuiltinPayload is stable regardless of key order", () => {
  const a = hashBuiltinPayload({ shellTree: [1, 2], homeTree: [{ x: 1, y: 2 }] });
  const b = hashBuiltinPayload({ homeTree: [{ y: 2, x: 1 }], shellTree: [1, 2] });
  assert.equal(a, b);
});

test("hashBuiltinPayload differs when content differs", () => {
  const a = hashBuiltinPayload({ tokens: { "color.primary": "#111111" } });
  const b = hashBuiltinPayload({ tokens: { "color.primary": "#222222" } });
  assert.notEqual(a, b);
});

// ── planBuiltinSync ──────────────────────────────────────────────────────────

test("a brand-new built-in is created at version 1", () => {
  const plan = planBuiltinSync([{ entry: entry("design", "default"), payload: { v: 1 } }], []);
  assert.equal(plan.created, 1);
  assert.equal(plan.updated, 0);
  assert.equal(plan.unchanged, 0);
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0]!.version, 1);
  assert.equal(plan.upserts[0]!.source, "builtin");
  assert.equal(plan.upserts[0]!.status, "published");
});

test("an unchanged payload keeps the existing version (no spurious bump)", () => {
  const payload = { v: 1, tree: ["a", "b"] };
  const existing: ExistingBuiltinRow[] = [
    { kind: "design", slug: "default", version: 3, payload, source: "builtin" },
  ];
  const plan = planBuiltinSync([{ entry: entry("design", "default"), payload }], existing);
  assert.equal(plan.created, 0);
  assert.equal(plan.updated, 0);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.upserts[0]!.version, 3);
});

test("a changed payload bumps the version by exactly one", () => {
  const existing: ExistingBuiltinRow[] = [
    { kind: "design", slug: "default", version: 3, payload: { v: 1 }, source: "builtin" },
  ];
  const plan = planBuiltinSync(
    [{ entry: entry("design", "default"), payload: { v: 2 } }],
    existing,
  );
  assert.equal(plan.created, 0);
  assert.equal(plan.updated, 1);
  assert.equal(plan.unchanged, 0);
  assert.equal(plan.upserts[0]!.version, 4);
});

test("metadata (title/tags/tier) refreshes on every sync even when the payload is unchanged", () => {
  const payload = { v: 1 };
  const existing: ExistingBuiltinRow[] = [
    { kind: "look", slug: "modern", version: 1, payload, source: "builtin" },
  ];
  const stale = entry("look", "modern");
  const fresh = { ...stale, title: "Renamed" };
  const plan = planBuiltinSync([{ entry: fresh, payload }], existing);
  assert.equal(plan.upserts[0]!.title, "Renamed");
  assert.equal(plan.upserts[0]!.version, 1, "metadata-only changes must not bump version");
});

test("an authored row for the same (kind, slug) is never touched", () => {
  const existing: ExistingBuiltinRow[] = [
    { kind: "design", slug: "default", version: 5, payload: { custom: true }, source: "authored" },
  ];
  const plan = planBuiltinSync(
    [{ entry: entry("design", "default"), payload: { v: 1 } }],
    existing,
  );
  assert.equal(plan.upserts.length, 0);
  assert.deepEqual(plan.skippedAuthored, [{ kind: "design", slug: "default" }]);
});

test("other built-ins still sync when one (kind, slug) is shadowed by an authored row", () => {
  const existing: ExistingBuiltinRow[] = [
    { kind: "design", slug: "default", version: 5, payload: { custom: true }, source: "authored" },
  ];
  const plan = planBuiltinSync(
    [
      { entry: entry("design", "default"), payload: { v: 1 } },
      { entry: entry("design", "editorial"), payload: { v: 1 } },
    ],
    existing,
  );
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0]!.slug, "editorial");
  assert.deepEqual(plan.skippedAuthored, [{ kind: "design", slug: "default" }]);
});

test("running the plan twice in a row is idempotent (second run is all-unchanged)", () => {
  const built = [
    { entry: entry("design", "default"), payload: { v: 1 } },
    { entry: entry("look", "modern"), payload: { tokens: { "color.primary": "#111" } } },
  ];
  const first = planBuiltinSync(built, []);
  assert.equal(first.created, 2);

  const existingAfterFirst: ExistingBuiltinRow[] = first.upserts.map((row) => ({
    kind: row.kind,
    slug: row.slug,
    version: row.version,
    payload: row.payload,
    source: "builtin",
  }));
  const second = planBuiltinSync(built, existingAfterFirst);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 2);
  for (const row of second.upserts) {
    const before = first.upserts.find((r) => r.kind === row.kind && r.slug === row.slug)!;
    assert.equal(row.version, before.version);
  }
});

test("(kind, slug) is the identity — a design and a look may share a slug", () => {
  const existing: ExistingBuiltinRow[] = [
    { kind: "look", slug: "editorial", version: 2, payload: { look: true }, source: "builtin" },
  ];
  const plan = planBuiltinSync(
    [{ entry: entry("design", "editorial"), payload: { design: true } }],
    existing,
  );
  // The existing LOOK row named "editorial" must not be mistaken for the
  // DESIGN's own (kind, slug) row.
  assert.equal(plan.created, 1);
  assert.equal(plan.upserts[0]!.kind, "design");
  assert.equal(plan.upserts[0]!.version, 1);
});
