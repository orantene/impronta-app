import test from "node:test";
import assert from "node:assert/strict";

import {
  hashBuiltinPayload,
  planBuiltinSync,
  type BuiltinThemeEntry,
  type ExistingBuiltinRow,
} from "./sync-builtins.server";

// F102: versioning while the catalog row lags behind the snapshots.

function entry(slug: string): BuiltinThemeEntry {
  return {
    kind: "design",
    slug,
    title: `Title ${slug}`,
    summary: "Summary",
    category: "classic",
    tags: [],
    required_talent_tier: "talent_basic",
    sort_order: 10,
    is_new_until: null,
    preview: {},
    buildPayload: () => ({}) as never,
  } as BuiltinThemeEntry;
}

test("hash ignores undefined-valued keys (jsonb round trip) and key order", () => {
  const built = { a: 1, b: undefined, c: [undefined, { y: 1, x: 2 }] };
  const stored = JSON.parse(JSON.stringify(built));
  assert.equal(hashBuiltinPayload(built), hashBuiltinPayload(stored));
  assert.equal(hashBuiltinPayload({ y: 1, x: 2 }), hashBuiltinPayload({ x: 2, y: 1 }));
});

test("every built-in design hashes the same across rebuilds and a jsonb round trip (no spurious bumps)", async () => {
  const { BUILTIN_DESIGNS } = await import("./builtins");
  const { MAISON_BUILTIN_DESIGN } = await import("./maison/builtins");
  const { COLLECTION_DESIGNS } = await import("./collection/designs");
  for (const d of [...BUILTIN_DESIGNS, MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS]) {
    const a = d.buildPayload();
    const b = d.buildPayload();
    assert.equal(hashBuiltinPayload(a), hashBuiltinPayload(b), `${d.slug} not deterministic`);
    assert.equal(
      hashBuiltinPayload(a),
      hashBuiltinPayload(JSON.parse(JSON.stringify(a))),
      `${d.slug} differs after round trip`,
    );
  }
});

const P14 = { v: 14 };
const P15 = { v: 15 };
const P16 = { v: 16 };
const hist = (snaps: Array<[number, unknown]>, rel: number[]) =>
  new Map([["d", { snapshots: snaps.map(([version, payload]) => ({ version, payload })), releaseToVersions: rel }]]);
const row14: ExistingBuiltinRow = { kind: "design", slug: "d", version: 14, payload: P14, source: "builtin" };

test("next version = max(catalog, snapshots, releases) + 1; release runs from the latest snapshot", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: P16 }], [row14], null, hist([[14, P14], [15, P15]], [15]));
  assert.equal(plan.upserts[0]!.version, 16);
  assert.deepEqual(plan.designChanges, [{ slug: "d", fromVersion: 15, toVersion: 16, basePayload: P15 }]);
  assert.equal(plan.updated, 1);
  const p2 = planBuiltinSync([{ entry: entry("d"), payload: P16 }], [row14], null, hist([], [17]));
  assert.equal(p2.upserts[0]!.version, 18);
});

test("payload equal to the latest snapshot: no bump, no release, no write", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: { v: 15 } }], [row14], null, hist([[14, P14], [15, P15]], [15]));
  assert.equal(plan.upserts.length, 0);
  assert.equal(plan.designChanges.length, 0);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.updated, 0);
});

test("payload equal to the catalog row with no newer snapshot: metadata refresh only", () => {
  const plan = planBuiltinSync([{ entry: entry("d"), payload: P14 }], [row14], null, hist([[14, P14]], []));
  assert.equal(plan.upserts[0]!.version, 14);
  assert.equal(plan.designChanges.length, 0);
});

test("sync after 14->15 is already synced: a new payload writes v16 snapshot + 15->16 release, catalog stays", async () => {
  const { syncBuiltinTalentThemes } = await import("./sync-builtins.server");
  const v15 = { shellTree: [], homeTree: [{ id: "old" }], tokenDefaults: {} };
  const ops: Array<{ table: string; arg: unknown }> = [];
  const tables: Record<string, unknown[]> = {
    talent_theme_catalog: [
      { kind: "design", slug: "maison-v2", version: 14, payload: { shellTree: [], homeTree: [], tokenDefaults: {} }, source: "builtin" },
    ],
    talent_theme_versions: [
      { design: "maison-v2", version: 14, payload: {} },
      { design: "maison-v2", version: 15, payload: v15 },
    ],
    talent_theme_releases: [{ design_slug: "maison-v2", to_version: 15 }],
  };
  const admin = {
    from(table: string) {
      const q = {
        select: () => q,
        in: () => Promise.resolve({ data: tables[table] ?? [], error: null }),
        upsert: (arg: unknown) => {
          ops.push({ table, arg });
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
  const res = await syncBuiltinTalentThemes(admin as never, null);
  assert.equal(res.ok, true);
  assert.ok((res as { heldBack?: string[] }).heldBack?.includes("maison-v2@16"));
  const rel = ops.find((o) => o.table === "talent_theme_releases")!.arg as {
    from_version: number;
    to_version: number;
    base_payload: unknown;
  };
  assert.equal(rel.from_version, 15);
  assert.equal(rel.to_version, 16);
  assert.deepEqual(rel.base_payload, v15);
  const snaps = ops.filter((o) => o.table === "talent_theme_versions").flatMap((o) => o.arg as Array<{ version: number }>);
  assert.ok(snaps.some((s) => s.version === 16));
  assert.ok(
    !ops.some((o) => o.table === "talent_theme_catalog" && (o.arg as Array<{ slug: string }>).some((r) => r.slug === "maison-v2")),
  );
});
