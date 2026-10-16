/**
 * Posts v1 takedown (TUL-1011): platform-admin gate, fields, noindex, restore.
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/cms/posts-platform-admin.test.ts
 *
 * Related coverage (not repeated here): posts-writer.test.ts proves a tenant or
 * talent write naming taken_down_* is rejected (`forbidden_field`) and that a
 * taken-down post refuses publish and edits; posts-public.test.ts proves a
 * taken-down post is excluded from listPublicPosts and the sitemap.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeTakedownReason,
  restorePost,
  sanitizeSearchTerm,
  takedownPost,
  type PlatformAdminGate,
} from "./posts-platform-admin";

type Row = {
  id: string;
  noindex: boolean;
  status: string;
  taken_down_at: string | null;
  taken_down_by: string | null;
  taken_down_reason: string | null;
};

type Fake = { client: SupabaseClient; rows: Row[]; writes: Record<string, unknown>[] };

/** Just enough of the PostgREST builder for `select().eq().maybeSingle()` and `update().eq()`. */
function fakeAdmin(rows: Row[]): Fake {
  const writes: Record<string, unknown>[] = [];
  const from = (table: string) => {
    assert.equal(table, "cms_posts");
    return {
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            const hit = rows.find((r) => r.id === id);
            return { data: hit ? { id: hit.id, taken_down_at: hit.taken_down_at } : null, error: null };
          },
        }),
      }),
      update: (patch: Partial<Row>) => ({
        eq: async (_col: string, id: string) => {
          writes.push(patch);
          const hit = rows.find((r) => r.id === id);
          if (hit) Object.assign(hit, patch);
          return { error: null };
        },
      }),
    };
  };
  return { client: { from } as unknown as SupabaseClient, rows, writes };
}

const live = (over: Partial<Row> = {}): Row => ({
  id: "p1",
  noindex: false,
  status: "published",
  taken_down_at: null,
  taken_down_by: null,
  taken_down_reason: null,
  ...over,
});

const adminGate = (fake: Fake, userId = "admin-1"): PlatformAdminGate => async () => ({
  ok: true,
  userId,
  admin: fake.client,
});
const deniedGate: PlatformAdminGate = async () => ({ ok: false, error: "Platform admin access required." });

test("takedown is refused for a non-platform-admin and writes nothing", async () => {
  const fake = fakeAdmin([live()]);
  const res = await takedownPost(deniedGate, { postId: "p1", reason: "spam" });
  assert.equal(res.ok, false);
  assert.equal(fake.writes.length, 0);
  assert.equal(fake.rows[0]?.taken_down_at, null);
  const restored = await restorePost(deniedGate, { postId: "p1" });
  assert.equal(restored.ok, false);
});

test("takedown sets taken_down_at/by/reason and keeps the owner noindex", async () => {
  const fake = fakeAdmin([live()]);
  const res = await takedownPost(adminGate(fake), { postId: "p1", reason: "  Contenido\n engañoso  " });
  assert.deepEqual(res, { ok: true });
  const row = fake.rows[0]!;
  assert.ok(row.taken_down_at);
  assert.equal(row.taken_down_by, "admin-1");
  assert.equal(row.taken_down_reason, "Contenido engañoso");
  assert.equal(row.noindex, false, "public read hides it; owner SEO untouched");
  assert.equal(row.status, "published", "takedown does not rewrite the status");
});

test("takedown needs a reason and a real, not-yet-hidden post", async () => {
  const fake = fakeAdmin([live(), live({ id: "p2", taken_down_at: "2026-10-01T00:00:00Z" })]);
  const blank = await takedownPost(adminGate(fake), { postId: "p1", reason: "   " });
  assert.deepEqual(blank.ok ? null : blank.code, "reason_required");
  const missing = await takedownPost(adminGate(fake), { postId: "nope", reason: "x" });
  assert.deepEqual(missing.ok ? null : missing.code, "not_found");
  const again = await takedownPost(adminGate(fake), { postId: "p2", reason: "x" });
  assert.deepEqual(again.ok ? null : again.code, "already_taken_down");
  assert.equal(fake.writes.length, 0);
});

test("restore clears taken_down_* and leaves noindex for the owner to decide", async () => {
  const fake = fakeAdmin([
    live({ taken_down_at: "2026-10-01T00:00:00Z", taken_down_by: "admin-1", taken_down_reason: "spam", noindex: true }),
  ]);
  const res = await restorePost(adminGate(fake), { postId: "p1" });
  assert.deepEqual(res, { ok: true });
  const row = fake.rows[0]!;
  assert.equal(row.taken_down_at, null);
  assert.equal(row.taken_down_by, null);
  assert.equal(row.taken_down_reason, null);
  assert.equal(row.noindex, true);
  const notHidden = await restorePost(adminGate(fake), { postId: "p1" });
  assert.deepEqual(notHidden.ok ? null : notHidden.code, "not_taken_down");
});

test("reason and search inputs are normalised", () => {
  assert.equal(normalizeTakedownReason("a   b\n c"), "a b c");
  assert.equal(normalizeTakedownReason("x".repeat(900)).length, 500);
  assert.equal(sanitizeSearchTerm("a,b%(c)_ 'd'"), "a b c d");
});

test("static: the takedown actions verify platform admin on the server and the helper stays out of tenant code", () => {
  const actions = readFileSync(new URL("../../app/(workspace)/platform/admin/posts/actions.ts", import.meta.url), "utf8");
  assert.ok(/isPlatformAdmin\(session\.profile\)/.test(actions));
  assert.ok(/requireNotImpersonating\(\)/.test(actions));
  assert.ok(!/input\.(userId|actorId|adminId)/.test(actions), "the actor comes from the session, never from input");
  for (const rel of ["posts-writer.ts", "posts-writer-read.ts", "../server-actions/posts-writer-actions.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.ok(!/posts-platform-admin/.test(src), `${rel} must not import the platform-admin takedown helper`);
  }
});
