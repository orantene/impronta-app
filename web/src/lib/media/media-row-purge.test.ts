import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { planMediaRowPurge, removalKey, type RowPurgeInput } from "./media-row-purge";
import { MEDIA_ROW_BLOCKER_REFERENCES, runMediaRowPurge } from "./media-row-purge-io";
import { DEFAULT_GRACE_DAYS, type MediaAssetRow, type StorageObject } from "./reap-orphaned-media";
import { reapOptionsFromEnv } from "./reap-orphaned-media-scan";

const NOW = new Date("2026-10-07T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function row(id: string, over: Partial<MediaAssetRow> = {}): MediaAssetRow {
  return {
    id,
    bucketId: "media-public",
    storagePath: `t1/gallery/${id}.jpg`,
    deletedAt: daysAgo(31),
    sourceMediaAssetId: null,
    variantKind: "gallery",
    ...over,
  };
}

function obj(r: MediaAssetRow): StorageObject {
  return { bucketId: r.bucketId, name: r.storagePath, sizeBytes: 10, createdAt: daysAgo(400) };
}

function input(over: Partial<RowPurgeInput> = {}): RowPurgeInput {
  return {
    rows: [],
    objects: [],
    externalReferences: [],
    now: NOW,
    graceDays: DEFAULT_GRACE_DAYS,
    maxRows: 500,
    ...over,
  };
}

describe("planMediaRowPurge", () => {
  it("is not purgeable at 29 days, purgeable at 31 (file already gone)", () => {
    const young = row("a", { deletedAt: daysAgo(29) });
    const old = row("b", { deletedAt: daysAgo(31) });
    const plan = planMediaRowPurge(input({ rows: [young, old] }));
    assert.deepEqual(plan.purgeable, ["b"]);
    assert.equal(plan.keptByReason.within_grace_period, 1);
  });

  it("never touches live rows", () => {
    const plan = planMediaRowPurge(input({ rows: [row("a", { deletedAt: null })] }));
    assert.deepEqual(plan.purgeable, []);
    assert.equal(plan.softDeletedCount, 0);
  });

  it("keeps a row whose file still exists (storage delete failed / not reaped)", () => {
    const r = row("a");
    const plan = planMediaRowPurge(input({ rows: [r], objects: [obj(r)] }));
    assert.deepEqual(plan.purgeable, []);
    assert.equal(plan.keptByReason.storage_not_confirmed_gone, 1);
  });

  it("purges once the reaper removed the file in this pass", () => {
    const r = row("a");
    const plan = planMediaRowPurge(
      input({ rows: [r], objects: [obj(r)], removedKeys: new Set([removalKey(r.bucketId, r.storagePath)]) }),
    );
    assert.deepEqual(plan.purgeable, ["a"]);
  });

  it("keeps a row whose path survives in another bucket (removal was for one bucket only)", () => {
    const r = row("a");
    const other: StorageObject = { ...obj(r), bucketId: "media-originals" };
    const plan = planMediaRowPurge(
      input({ rows: [r], objects: [obj(r), other], removedKeys: new Set([removalKey("media-public", r.storagePath)]) }),
    );
    assert.deepEqual(plan.purgeable, []);
  });

  it("keeps rows in buckets the reaper does not manage", () => {
    const plan = planMediaRowPurge(input({ rows: [row("a", { bucketId: "inquiry-files" })] }));
    assert.deepEqual(plan.purgeable, []);
    assert.equal(plan.keptByReason.bucket_not_managed, 1);
  });

  it("keeps a row sharing its path with a live row", () => {
    const a = row("a", { storagePath: "t1/x.jpg" });
    const b = row("b", { storagePath: "t1/x.jpg", deletedAt: null });
    assert.deepEqual(planMediaRowPurge(input({ rows: [a, b] })).purgeable, []);
  });

  it("keeps a row an external reference names", () => {
    const a = row("a");
    const plan = planMediaRowPurge(
      input({
        rows: [a],
        externalReferences: [{ bucketId: "media-public", storagePath: a.storagePath, source: "cms_pages" }],
      }),
    );
    assert.deepEqual(plan.purgeable, []);
    assert.equal(plan.keptByReason.external_reference, 1);
  });

  it("keeps a row a non-child table references", () => {
    const plan = planMediaRowPurge(input({ rows: [row("a"), row("b")], blockedIds: new Set(["a"]) }));
    assert.deepEqual(plan.purgeable, ["b"]);
    assert.equal(plan.keptByReason.referenced_by_non_child, 1);
  });

  it("keeps a parent while a derivative survives, purges both when both qualify", () => {
    const parent = row("p");
    const kidKept = row("k", { sourceMediaAssetId: "p", deletedAt: daysAgo(5) });
    assert.deepEqual(planMediaRowPurge(input({ rows: [parent, kidKept] })).purgeable, []);
    const kidOk = row("k2", { sourceMediaAssetId: "p" });
    assert.deepEqual(planMediaRowPurge(input({ rows: [parent, kidOk] })).purgeable, ["k2", "p"]);
  });

  it("respects the cap", () => {
    const rows = ["a", "b", "c", "d"].map((id) => row(id));
    const plan = planMediaRowPurge(input({ rows, maxRows: 2 }));
    assert.deepEqual(plan.purgeable, ["a", "b"]);
    assert.equal(plan.eligibleCount, 4);
    assert.equal(plan.cappedByLimit, true);
    assert.equal(plan.keptByReason.over_purge_cap, 2);
  });

  it("keeps a row with an unparsable deleted_at", () => {
    const plan = planMediaRowPurge(input({ rows: [row("a", { deletedAt: "not a date" })] }));
    assert.deepEqual(plan.purgeable, []);
  });
});

// --- fake client ------------------------------------------------------------
type DeleteCall = { id: string };
function fakeAdmin(opts: { failDeleteFor?: string[]; failLookup?: boolean; blocked?: Record<string, string[]> } = {}) {
  const deletes: DeleteCall[] = [];
  const lookups: string[] = [];
  const client = {
    from(table: string) {
      return {
        select(column: string) {
          return {
            in(_col: string, ids: string[]) {
              lookups.push(`${table}.${column}`);
              if (opts.failLookup) return Promise.resolve({ data: null, error: { message: "boom" } });
              const hit = (opts.blocked?.[`${table}.${column}`] ?? []).filter((x) => ids.includes(x));
              return Promise.resolve({ data: hit.map((v) => ({ [column]: v })), error: null });
            },
          };
        },
        delete() {
          let id = "";
          const chain = {
            eq(_c: string, v: string) {
              id = v;
              return chain;
            },
            not() {
              return chain;
            },
            lt() {
              return chain;
            },
            select() {
              deletes.push({ id });
              if (opts.failDeleteFor?.includes(id)) {
                return Promise.resolve({ data: null, error: { message: `fk ${id}` } });
              }
              return Promise.resolve({ data: [{ id }], error: null });
            },
          };
          return chain;
        },
      };
    },
  };
  return { admin: client as unknown as SupabaseClient, deletes, lookups };
}

function run(admin: SupabaseClient, over: Partial<Parameters<typeof runMediaRowPurge>[0]> = {}) {
  return runMediaRowPurge({
    admin,
    rows: [row("a"), row("b"), row("c")],
    objects: [],
    removed: [],
    externalReferences: [],
    now: NOW,
    graceDays: DEFAULT_GRACE_DAYS,
    maxRows: 500,
    enforce: false,
    ...over,
  });
}

describe("runMediaRowPurge", () => {
  it("dry run counts but performs NO delete call", async () => {
    const f = fakeAdmin();
    const report = await run(f.admin);
    assert.equal(report.enforce, false);
    assert.equal(report.wouldPurgeCount, 3);
    assert.equal(report.purgedCount, 0);
    assert.equal(f.deletes.length, 0);
  });

  it("enforce deletes only eligible rows and respects the cap", async () => {
    const f = fakeAdmin({ blocked: { "agency_branding.logo_media_asset_id": ["a"] } });
    const report = await run(f.admin, { enforce: true, maxRows: 1 });
    assert.deepEqual(f.deletes.map((d) => d.id), ["b"]);
    assert.equal(report.purgedCount, 1);
    assert.equal(report.cappedByLimit, true);
    assert.equal(report.keptByReason.referenced_by_non_child, 1);
  });

  it("one failing row does not stop the batch", async () => {
    const f = fakeAdmin({ failDeleteFor: ["a"] });
    const report = await run(f.admin, { enforce: true });
    assert.deepEqual(f.deletes.map((d) => d.id), ["a", "b", "c"]);
    assert.equal(report.purgedCount, 2);
    assert.equal(report.errorCount, 1);
    assert.match(report.sampleErrors[0], /fk a/);
  });

  it("a failed FK lookup deletes nothing, even when enforcing", async () => {
    const f = fakeAdmin({ failLookup: true });
    const report = await run(f.admin, { enforce: true });
    assert.equal(report.ok, false);
    assert.equal(f.deletes.length, 0);
  });

  it("looks up every blocker reference", async () => {
    const f = fakeAdmin();
    await run(f.admin);
    assert.equal(new Set(f.lookups).size, MEDIA_ROW_BLOCKER_REFERENCES.length);
  });
});

describe("flag", () => {
  it("MEDIA_ROW_PURGE_ENFORCE defaults off and only the exact string true enables it", () => {
    assert.equal(reapOptionsFromEnv({}).purgeRows, false);
    assert.equal(reapOptionsFromEnv({ MEDIA_ROW_PURGE_ENFORCE: "1" }).purgeRows, false);
    assert.equal(reapOptionsFromEnv({ MEDIA_ROW_PURGE_ENFORCE: "true" }).purgeRows, true);
    assert.equal(reapOptionsFromEnv({ MEDIA_ROW_PURGE_ENFORCE: "true" }).execute, false);
  });
});
