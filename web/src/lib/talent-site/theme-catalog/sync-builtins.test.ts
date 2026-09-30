import test from "node:test";
import assert from "node:assert/strict";

import {
  hashBuiltinPayload,
  planBuiltinSync,
  splitGatedUpserts,
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

// ── gated sync: a version bump does not touch the catalog row ────────────────

test("splitGatedUpserts holds back only design version bumps", () => {
  const ups = [
    { kind: "design" as const, slug: "maison-v2", version: 15 }, // bump
    { kind: "design" as const, slug: "same", version: 3 }, // metadata refresh
    { kind: "design" as const, slug: "fresh", version: 1 }, // new row
    { kind: "look" as const, slug: "rose", version: 4 }, // look bump: not gated
  ];
  const prior = new Map<string, number>([
    ["design:maison-v2", 14],
    ["design:same", 3],
    ["look:rose", 3],
  ]);
  const gated = splitGatedUpserts(ups, prior, false);
  assert.deepEqual(gated.held.map((u) => u.slug), ["maison-v2"]);
  assert.deepEqual(gated.catalogUpserts.map((u) => u.slug), ["same", "fresh", "rose"]);
  const flipped = splitGatedUpserts(ups, prior, true);
  assert.equal(flipped.held.length, 0);
  assert.equal(flipped.catalogUpserts.length, 4);
});

interface Op {
  table: string;
  op: string;
  arg: unknown;
}

/** Recording stand-in for the service-role client; `existing` = catalog rows. */
function fakeAdmin(existing: unknown[]): { admin: never; ops: Op[] } {
  const ops: Op[] = [];
  const admin = {
    from(table: string) {
      const q = {
        select: () => q,
        in: () => Promise.resolve({ data: table === "talent_theme_catalog" ? existing : [], error: null }),
        upsert: (arg: unknown) => {
          ops.push({ table, op: "upsert", arg });
          const r = Promise.resolve({ data: [{ id: "x" }], error: null }) as Promise<unknown> & {
            select: () => Promise<unknown>;
          };
          r.select = () => Promise.resolve({ data: [{ id: "x" }], error: null });
          return r;
        },
      };
      return q;
    },
  };
  return { admin: admin as never, ops };
}

async function runSync(flipCatalog: boolean) {
  const { syncBuiltinTalentThemes } = await import("./sync-builtins.server");
  const { buildMaisonV2Payload } = await import("./collection/designs");
  const prior = { shellTree: [], homeTree: [], tokenDefaults: {} };
  const existing = [{ kind: "design", slug: "maison-v2", version: 14, payload: prior, source: "builtin" }];
  const fake = fakeAdmin(existing);
  const res = await syncBuiltinTalentThemes(fake.admin, null, { flipCatalog });
  const catalogRows = fake.ops
    .filter((o) => o.table === "talent_theme_catalog")
    .flatMap((o) => o.arg as Array<{ kind: string; slug: string; version: number; payload: unknown }>);
  return { res, ops: fake.ops, catalogRows, prior, next: buildMaisonV2Payload() };
}

test("sync without --flip-catalog leaves the catalog row untouched but writes snapshot + draft release", async () => {
  const { res, ops, catalogRows, prior } = await runSync(false);
  assert.equal(res.ok, true);
  assert.ok(!catalogRows.some((r) => r.kind === "design" && r.slug === "maison-v2"), "maison-v2 row must not be upserted");
  assert.deepEqual((res as { heldBack?: string[] }).heldBack, ["maison-v2@15"]);
  const snaps = ops.filter((o) => o.table === "talent_theme_versions").flatMap((o) => o.arg as Array<{ design: string; version: number; payload: unknown }>);
  const mv2 = snaps.filter((s) => s.design === "maison-v2").map((s) => s.version).sort();
  assert.deepEqual(mv2, [14, 15]);
  assert.deepEqual(snaps.find((s) => s.version === 14)!.payload, prior);
  const rel = ops.find((o) => o.table === "talent_theme_releases")!.arg as { design_slug: string; from_version: number; to_version: number; items: unknown[]; base_payload: unknown };
  assert.equal(rel.design_slug, "maison-v2");
  assert.equal(rel.to_version, 15);
  assert.equal(rel.from_version, 14);
  assert.deepEqual(rel.base_payload, prior);
  assert.ok(rel.items.length > 0);
});

test("sync with --flip-catalog keeps the old behaviour (row moves to the new version)", async () => {
  const { res, catalogRows } = await runSync(true);
  assert.equal(res.ok, true);
  assert.equal((res as { heldBack?: string[] }).heldBack, undefined);
  const row = catalogRows.find((r) => r.kind === "design" && r.slug === "maison-v2");
  assert.equal(row?.version, 15);
});
