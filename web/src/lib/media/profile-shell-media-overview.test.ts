/**
 * TUL-277: runtime test of the profile shell media loader against an injected
 * fake Supabase client. Asserts which table / columns / filters / limits it
 * uses, that no select is unbounded, and that an error fails closed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadProfileShellAlbumPage,
  loadProfileShellMediaOverview,
} from "./profile-shell-media-overview.server";

type Call = { method: string; args: unknown[] };
type Recorded = { table: string; calls: Call[] };
type Reply = { data: unknown; error: { message: string } | null; count?: number };

const PROFILE = "11111111-1111-1111-1111-111111111111";

function fakeClient(reply: (q: Recorded) => Reply): { client: SupabaseClient; queries: Recorded[] } {
  const queries: Recorded[] = [];
  const client = {
    from(table: string) {
      const q: Recorded = { table, calls: [] };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "or", "order", "range", "limit"]) {
        builder[m] = (...args: unknown[]) => {
          q.calls.push({ method: m, args });
          return builder;
        };
      }
      builder.then = (resolve: (r: Reply) => unknown) => resolve(reply(q));
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, queries };
}

const has = (q: Recorded, method: string) => q.calls.filter((c) => c.method === method);
const bounded = (q: Recorded) => has(q, "range").length > 0 || has(q, "limit").length > 0;
const selectArg = (q: Recorded) => String(has(q, "select")[0]?.args[0]);

function mediaRow(id: string, variant: string, albumId?: string, sort = 0) {
  return {
    id,
    bucket_id: "media-public",
    storage_path: `${PROFILE}/${id}.jpg`,
    variant_kind: variant,
    sort_order: sort,
    metadata: albumId ? { albumId } : {},
    source_media_asset_id: null,
  };
}

/** A library of `n` gallery rows split across albums a / b, plus two polaroids. */
function library(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `g${String(i).padStart(5, "0")}`,
    albumId: i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : null,
  }));
  return rows;
}

function replyFor(rows: { id: string; albumId: string | null }[]) {
  return (q: Recorded): Reply => {
    const sel = selectArg(q);
    if (sel.includes("albumId:metadata->>albumId")) {
      const [from, to] = has(q, "range")[0].args as [number, number];
      return { data: rows.slice(from, to + 1), error: null };
    }
    if (has(q, "in").some((c) => c.args[0] === "variant_kind")) {
      return {
        data: [mediaRow("hero1", "hero"), mediaRow("pol1", "polaroid")].map((r) =>
          r.variant_kind === "polaroid" ? { ...r, metadata: { polaroidSlot: "p-front" } } : r,
        ),
        error: null,
      };
    }
    if (has(q, "in").some((c) => c.args[0] === "id")) {
      const ids = has(q, "in")[0].args[1] as string[];
      return { data: ids.map((id) => mediaRow(id, "gallery")), error: null };
    }
    // gallery page of the bundle
    const [from, to] = has(q, "range")[0].args as [number, number];
    return { data: rows.slice(from, to + 1).map((r) => mediaRow(r.id, "gallery", r.albumId ?? undefined)), error: null, count: rows.length };
  };
}

test("overview: tables, columns, filters, and every select is bounded", async () => {
  const { client, queries } = fakeClient(replyFor(library(2500)));
  const o = await loadProfileShellMediaOverview(client, PROFILE);
  assert.equal(o.degraded, false);
  assert.ok(queries.length > 0);
  for (const q of queries) {
    assert.equal(q.table, "media_assets");
    assert.ok(bounded(q), `unbounded select: ${selectArg(q)}`);
  }
  const scans = queries.filter((q) => selectArg(q) === "id, albumId:metadata->>albumId");
  assert.equal(scans.length, 3, "2500 rows = 3 chunks of 1000");
  for (const s of scans) {
    assert.deepEqual(has(s, "eq").map((c) => c.args), [[
      "owner_talent_profile_id", PROFILE], ["variant_kind", "gallery"]]);
    assert.deepEqual(has(s, "is")[0].args, ["deleted_at", null]);
    assert.deepEqual(has(s, "order").map((c) => c.args[0]), ["sort_order", "id"]);
  }
  assert.deepEqual(has(scans[1], "range")[0].args, [1000, 1999]);
  const covers = queries.find((q) => has(q, "in").some((c) => c.args[0] === "id"));
  assert.ok(covers, "covers are hydrated by id");
  assert.equal(has(covers!, "limit")[0].args[0], (has(covers!, "in")[0].args[1] as string[]).length);
});

test("overview: counts are exact for a library bigger than one page; covers capped", async () => {
  const rows = library(2500);
  const { client } = fakeClient(replyFor(rows));
  const o = await loadProfileShellMediaOverview(client, PROFILE);
  const a = o.albums.find((x) => x.albumId === "a")!;
  const b = o.albums.find((x) => x.albumId === "b")!;
  assert.equal(a.count, rows.filter((r) => r.albumId === "a").length);
  assert.equal(b.count, rows.filter((r) => r.albumId === "b").length);
  assert.equal(o.unassigned.count, rows.filter((r) => r.albumId === null).length);
  assert.equal(a.count + b.count + o.unassigned.count, 2500);
  assert.equal(o.totalPhotos, 2500);
  assert.ok(a.covers.length <= 4 && a.covers.length === 4);
  assert.deepEqual(a.covers.map((c) => c.id), rows.filter((r) => r.albumId === "a").slice(0, 4).map((r) => r.id));
  // first page of the gallery + polaroid slot come from the reused bundle
  assert.equal(o.bundle.gallery.length, 60);
  assert.equal(o.bundle.galleryNextOffset, 60);
  assert.ok(o.bundle.polaroids["p-front"]);
  assert.ok(o.bundle.hero);
});

test("overview: a read error returns the empty result, never throws", async () => {
  const { client } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
  const o = await loadProfileShellMediaOverview(client, PROFILE);
  assert.equal(o.degraded, true);
  assert.equal(o.totalPhotos, 0);
  assert.deepEqual(o.albums, []);
  assert.equal(o.bundle.gallery.length, 0);
});

test("overview: a failing scan alone also fails closed", async () => {
  const good = replyFor(library(10));
  const { client } = fakeClient((q) =>
    selectArg(q).includes("albumId:metadata") ? { data: null, error: { message: "denied" } } : good(q),
  );
  const o = await loadProfileShellMediaOverview(client, PROFILE);
  assert.equal(o.degraded, true);
});

test("overview: an empty library is a valid, non-degraded result", async () => {
  const { client } = fakeClient(replyFor([]));
  const o = await loadProfileShellMediaOverview(client, PROFILE);
  assert.equal(o.degraded, false);
  assert.equal(o.totalPhotos, 0);
  assert.deepEqual(o.albums, []);
});

test("album page: filters by album id, pages with range and returns the cursor", async () => {
  const { client, queries } = fakeClient(() => ({
    data: Array.from({ length: 60 }, (_, i) => mediaRow(`x${i}`, "gallery", "a")),
    error: null,
    count: 130,
  }));
  const page = await loadProfileShellAlbumPage(client, PROFILE, { albumId: "a", includeUnassigned: false, offset: 4 });
  const q = queries[0];
  assert.deepEqual(has(q, "or")[0].args, ['metadata->>albumId.eq."a"']);
  assert.deepEqual(has(q, "range")[0].args, [4, 63]);
  assert.deepEqual(has(q, "select")[0].args[1], { count: "exact" });
  assert.ok(bounded(q));
  assert.equal(page!.items.length, 60);
  assert.equal(page!.total, 130);
  assert.equal(page!.nextOffset, 64);
});

test("album page: the unassigned-owning album also matches null and empty ids; last page has no cursor", async () => {
  const { client, queries } = fakeClient(() => ({
    data: [mediaRow("y1", "gallery")],
    error: null,
    count: 61,
  }));
  const page = await loadProfileShellAlbumPage(client, PROFILE, { albumId: "main", includeUnassigned: true, offset: 60 });
  assert.equal(
    has(queries[0], "or")[0].args[0],
    'metadata->>albumId.is.null,metadata->>albumId.eq."",metadata->>albumId.eq."main"',
  );
  assert.equal(page!.nextOffset, null);
});

test("album page: an error returns null", async () => {
  const { client } = fakeClient(() => ({ data: null, error: { message: "nope" } }));
  assert.equal(await loadProfileShellAlbumPage(client, PROFILE, { albumId: "a", includeUnassigned: false }), null);
});
