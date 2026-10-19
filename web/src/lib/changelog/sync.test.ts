import { test } from "node:test";
import assert from "node:assert/strict";

import { syncChangelog } from "./sync";

type Row = Record<string, unknown>;

/** Minimal in-memory stand-ins for supabase-js (table + storage) and Notion. */
function fakeAdmin(initial: Row[]) {
  const rows = new Map<string, Row>(initial.map((r) => [String(r.notion_page_id), r]));
  const files = new Map<string, number>();
  const admin = {
    from: () => ({
      select: async () => ({ data: [...rows.values()], error: null }),
      upsert: async (row: Row) => {
        rows.set(String(row.notion_page_id), row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, id: string) => {
          rows.delete(id);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          files.set(path, bytes.byteLength);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/changelog/${path}` } }),
        list: async (folder: string) => ({
          data: [...files.keys()].filter((p) => p.startsWith(`${folder}/`)).map((p) => ({ name: p.slice(folder.length + 1) })),
        }),
        remove: async (paths: string[]) => {
          for (const p of paths) files.delete(p);
          return { error: null };
        },
      }),
    },
  };
  return { admin: admin as never, rows, files };
}

const rt = (content: string) => ({ plain_text: content });
const published = (id: string, edited: string, title = "Hello") => ({
  id,
  last_edited_time: edited,
  properties: {
    Status: { status: { name: "Published" } },
    "Title EN": { rich_text: [rt(title)] },
    "Cover image": { files: [{ file: { url: "https://notion-files.test/cover.png" } }] },
  },
});
const blocks = [
  { id: "b1", type: "paragraph", paragraph: { rich_text: [rt("body")] } },
  { id: "b2", type: "image", image: { type: "file", file: { url: "https://notion-files.test/inline.png" }, caption: [] } },
];

function fakeFetch(pages: unknown[]) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/query")) {
      return Response.json({ results: pages, has_more: false, next_cursor: null });
    }
    if (url.includes("/children")) {
      return Response.json({ results: blocks, has_more: false, next_cursor: null });
    }
    if (url.startsWith("https://notion-files.test/")) {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

const base = { apiKey: "k", databaseId: "db" };

test("publishes new entries, re-hosts images, renders only our copies", async () => {
  const { admin, rows, files } = fakeAdmin([]);
  const { impl } = fakeFetch([published("page-1", "2026-10-21T15:00:00.000Z")]);
  const result = await syncChangelog({ ...base, admin, fetchImpl: impl });
  assert.deepEqual({ ...result, errors: result.errors.length }, { synced: 1, unchanged: 0, removed: 0, deferred: 0, errors: 0 });
  const row = rows.get("page-1") as Row;
  assert.equal(row.cover_image_url, "https://cdn.test/changelog/page-1/cover.png");
  assert.match(String(row.body_en_html), /cdn\.test\/changelog\/page-1\/b2\.png/);
  assert.equal(String(row.body_en_html).includes("notion-files.test"), false);
  assert.deepEqual([...files.keys()].sort(), ["page-1/b2.png", "page-1/cover.png"]);
});

test("unchanged entries are skipped, edited ones re-sync, force re-renders", async () => {
  const same = fakeAdmin([{ notion_page_id: "page-1", notion_last_edited_at: "2026-10-21T15:00:00+00:00" }]);
  const a = await syncChangelog({ ...base, admin: same.admin, fetchImpl: fakeFetch([published("page-1", "2026-10-21T15:00:00.000Z")]).impl });
  assert.equal(a.unchanged, 1);
  assert.equal(a.synced, 0);

  const edited = fakeAdmin([{ notion_page_id: "page-1", notion_last_edited_at: "2026-10-21T10:00:00.000Z" }]);
  const b = await syncChangelog({ ...base, admin: edited.admin, fetchImpl: fakeFetch([published("page-1", "2026-10-21T15:00:00.000Z", "New title")]).impl });
  assert.equal(b.synced, 1);
  assert.equal((edited.rows.get("page-1") as Row).title_en, "New title");

  const forced = fakeAdmin([{ notion_page_id: "page-1", notion_last_edited_at: "2026-10-21T15:00:00.000Z" }]);
  const c = await syncChangelog({ ...base, admin: forced.admin, force: true, fetchImpl: fakeFetch([published("page-1", "2026-10-21T15:00:00.000Z")]).impl });
  assert.equal(c.synced, 1);
});

test("an entry that left Published is deleted with its images", async () => {
  const { admin, rows, files } = fakeAdmin([{ notion_page_id: "gone", notion_last_edited_at: null }]);
  files.set("gone/cover.png", 3);
  const result = await syncChangelog({ ...base, admin, fetchImpl: fakeFetch([]).impl });
  assert.equal(result.removed, 1);
  assert.equal(rows.has("gone"), false);
  assert.equal(files.size, 0);
});

test("one bad entry is reported and does not stop the others", async () => {
  const { admin, rows } = fakeAdmin([]);
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/query")) {
      return Response.json({ results: [published("bad", "2026-10-21T15:00:00.000Z"), published("good", "2026-10-21T15:00:00.000Z")], has_more: false, next_cursor: null });
    }
    if (url.includes("/blocks/bad/")) return new Response("boom", { status: 400 });
    if (url.includes("/children")) return Response.json({ results: [], has_more: false, next_cursor: null });
    return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
  }) as typeof fetch;
  const result = await syncChangelog({ ...base, admin, fetchImpl: impl });
  assert.equal(result.synced, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(rows.has("good"), true);
  assert.equal(rows.has("bad"), false);
});

test("stops starting new entries when the time budget is spent", async () => {
  const { admin } = fakeAdmin([]);
  let t = 0;
  const result = await syncChangelog({
    ...base,
    admin,
    now: () => (t += 30_000),
    fetchImpl: fakeFetch([published("p1", "2026-10-21T15:00:00.000Z"), published("p2", "2026-10-21T15:00:00.000Z"), published("p3", "2026-10-21T15:00:00.000Z")]).impl,
  });
  assert.equal(result.synced + result.deferred, 3);
  assert.ok(result.deferred >= 1);
});
