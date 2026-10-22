/**
 * Posts v1 writer + paid gate (TUL-1006 / TUL-1007).
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/cms/posts-writer.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { canPublishPosts, workspaceCanPublishPosts } from "@/lib/access/posts-capability";
import { PLAN_KEYS } from "@/lib/access/plan-catalog";
import {
  createPostDraft,
  publishPostNow,
  savePostDraft,
  updatePostSettings,
  unpublishPostNow,
  type PostScope,
  type PostWriterContext,
} from "./posts-writer";
import { resolvePostScope } from "./posts-scope";
import { runPostsScheduledSweep, type DuePostRow } from "./posts-scheduled-sweep";

// ---- typed in-memory fake --------------------------------------------------

type Row = Record<string, unknown>;
type Reply = { data: Row | Row[] | null; error: { message: string } | null };
type Filter = { col: string; op: "eq" | "neq" | "is"; val: unknown };
type FakeQuery = {
  select: (cols?: string) => FakeQuery;
  update: (patch: Row) => FakeQuery;
  insert: (row: Row | Row[]) => FakeQuery;
  delete: () => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  neq: (col: string, val: unknown) => FakeQuery;
  is: (col: string, val: unknown) => FakeQuery;
  maybeSingle: <T = Row>() => Promise<{ data: T | null; error: Reply["error"] }>;
  single: <T = Row>() => Promise<{ data: T | null; error: Reply["error"] }>;
  then: (resolve: (v: Reply) => unknown) => unknown;
};

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { cms_posts: [], cms_redirects: [], ...seed };
  const writes: { table: string; op: string; payload: Row | Row[] }[] = [];
  const client = {
    from(table: string): FakeQuery {
      let op: "select" | "update" | "insert" | "delete" = "select";
      let payload: Row | Row[] = {};
      const filters: Filter[] = [];
      const match = (r: Row) =>
        filters.every((f) =>
          f.op === "eq" ? r[f.col] === f.val : f.op === "neq" ? r[f.col] !== f.val : (r[f.col] ?? null) === f.val,
        );
      const exec = (): Reply => {
        const rows = (tables[table] ??= []);
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          const made = list.map((r) => ({ id: `new-${rows.length + 1}`, updated_at: "t-ins", ...r }));
          rows.push(...made);
          writes.push({ table, op, payload });
          return { data: made, error: null };
        }
        const hit = rows.filter(match);
        if (op === "update") {
          for (const r of hit) Object.assign(r, payload, { updated_at: `t-${writes.length + 1}` });
          writes.push({ table, op, payload });
        }
        return { data: hit, error: null };
      };
      const first = <T,>() => {
        const res = exec();
        const list = Array.isArray(res.data) ? res.data : [];
        return Promise.resolve({ data: (list[0] ?? null) as T | null, error: res.error });
      };
      const q: FakeQuery = {
        select: () => q,
        update: (p) => ((op = "update"), (payload = p), q),
        insert: (p) => ((op = "insert"), (payload = p), q),
        delete: () => ((op = "delete"), q),
        eq: (col, val) => (filters.push({ col, op: "eq", val }), q),
        neq: (col, val) => (filters.push({ col, op: "neq", val }), q),
        is: (col, val) => (filters.push({ col, op: "is", val }), q),
        maybeSingle: first,
        single: first,
        then: (resolve) => resolve(exec()),
      };
      return q;
    },
  };
  return { supabase: client as unknown as SupabaseClient, tables, writes };
}

const TALENT: PostScope = { kind: "talent", talentProfileId: "tp-1" };
const TENANT: PostScope = { kind: "tenant", tenantId: "ag-1" };

function post(over: Row = {}): Row {
  return {
    id: "p1",
    status: "draft",
    slug: "mi-post",
    locale: "es",
    published_at: null,
    scheduled_publish_at: null,
    updated_at: "t0",
    taken_down_at: null,
    taken_down_reason: null,
    title: "Hola",
    talent_profile_id: "tp-1",
    tenant_id: null,
    ...over,
  };
}

function ctx(db: ReturnType<typeof fakeDb>, over: Partial<PostWriterContext> = {}): PostWriterContext {
  return { supabase: db.supabase, scope: TALENT, actorKind: "talent", actorProfileId: "u-1", canPublish: true, uiLocale: "es", ...over };
}

const okBlocks = [{ id: "b1", type: "paragraph", text: "Hola mundo" }];

// ---- capability matrix -----------------------------------------------------

test("capability matrix: talent Web Office keys yes, talent free no; workspace free no, website..legacy yes", () => {
  for (const flag of [undefined, "true"]) {
    if (flag) process.env.TALENT_FREE_WEBSITE_ENABLED = flag;
    else delete process.env.TALENT_FREE_WEBSITE_ENABLED;
    assert.equal(canPublishPosts("talent_portfolio"), true);
    assert.equal(canPublishPosts("talent_pro"), true);
    assert.equal(canPublishPosts("talent_basic"), false);
    assert.equal(canPublishPosts(null), false);
  }
  delete process.env.TALENT_FREE_WEBSITE_ENABLED;
  const expected: Record<string, boolean> = {
    free: false, website: true, studio: true, agency: true, network: true, legacy: true,
  };
  for (const [plan, yes] of Object.entries(expected)) assert.equal(workspaceCanPublishPosts(plan), yes, plan);
  assert.equal(workspaceCanPublishPosts(null), false);
  assert.equal(workspaceCanPublishPosts("hub-network"), false);
  assert.ok(PLAN_KEYS.includes("talent_pro"));
});

// ---- scope resolver --------------------------------------------------------

test("resolvePostScope: an owned business workspace wins; otherwise the talent profile", async () => {
  const owns = await resolvePostScope(
    { userId: "u-1", talentProfileId: "tp-1" },
    { loadOwnedBusinessWorkspace: async () => ({ ownsBusinessWorkspace: true, tenantId: "ag-9" }) },
  );
  assert.deepEqual(owns, { kind: "tenant", tenantId: "ag-9" });
  const solo = await resolvePostScope(
    { userId: "u-1", talentProfileId: "tp-1" },
    { loadOwnedBusinessWorkspace: async () => ({ ownsBusinessWorkspace: false, tenantId: null }) },
  );
  assert.deepEqual(solo, { kind: "talent", talentProfileId: "tp-1" });
});

// ---- save path -------------------------------------------------------------

test("createPostDraft inserts a talent-scoped draft (tenant_id forced NULL)", async () => {
  const db = fakeDb({});
  const r = await createPostDraft(ctx(db), { locale: "es", title: "Nuevo", bodyBlocks: okBlocks });
  assert.ok(r.ok);
  const row = db.tables.cms_posts[0]!;
  assert.equal(row.talent_profile_id, "tp-1");
  assert.equal(row.tenant_id, null);
  assert.equal(row.status, "draft");
});

test("createPostDraft under a workspace scope forces tenant_id", async () => {
  const db = fakeDb({});
  const r = await createPostDraft(ctx(db, { scope: TENANT }), { locale: "en" });
  assert.ok(r.ok);
  assert.equal(db.tables.cms_posts[0]!.tenant_id, "ag-1");
});

test("TUL-1249: a blank createPostDraft reuses the owner's untouched draft instead of stacking another", async () => {
  const empty = post({ id: "e1", title: "Sin título", excerpt: "", body_blocks: [] });
  const db = fakeDb({ cms_posts: [empty] });
  const a = await createPostDraft(ctx(db), { locale: "es" });
  const b = await createPostDraft(ctx(db), { locale: "es" });
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && a.data.id, "e1");
  assert.equal(b.ok && b.data.id, "e1");
  assert.equal(db.tables.cms_posts.length, 1);
  assert.equal(db.writes.length, 0);
});

test("TUL-1249: reuse never picks a written, other-language or other-owner draft", async () => {
  const db = fakeDb({
    cms_posts: [
      post({ id: "w1", title: "Mi viaje", body_blocks: [] }),
      post({ id: "w2", title: "Sin título", body_blocks: okBlocks }),
      post({ id: "w3", title: "Sin título", body_blocks: [], locale: "en" }),
      post({ id: "w4", title: "Sin título", body_blocks: [], talent_profile_id: "tp-OTHER" }),
    ],
  });
  const r = await createPostDraft(ctx(db), { locale: "es" });
  assert.ok(r.ok);
  assert.ok(!["w1", "w2", "w3", "w4"].includes(r.ok ? r.data.id : ""));
  assert.equal(db.tables.cms_posts.length, 5);
});

test("TUL-1249: createPostDraft with content always inserts", async () => {
  const db = fakeDb({ cms_posts: [post({ id: "e1", title: "Sin título", body_blocks: [] })] });
  const r = await createPostDraft(ctx(db), { locale: "es", title: "Nuevo", bodyBlocks: okBlocks });
  assert.ok(r.ok);
  assert.notEqual(r.ok && r.data.id, "e1");
  assert.equal(db.tables.cms_posts.length, 2);
});

test("savePostDraft rejects invalid blocks and any taken_down_* field", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const bad = await savePostDraft(ctx(db), { id: "p1", bodyBlocks: [{ id: "x", type: "nope" }] });
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.code, "validation_failed");
  const sneaky = await updatePostSettings(ctx(db), {
    id: "p1",
    patch: { taken_down_at: null } as unknown as Parameters<typeof updatePostSettings>[1]["patch"],
  });
  assert.equal(!sneaky.ok && sneaky.code, "forbidden_field");
  assert.equal(db.writes.length, 0);
});

test("savePostDraft is idempotent last-write-wins", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const a = await savePostDraft(ctx(db), { id: "p1", title: "Uno", bodyBlocks: okBlocks });
  const b = await savePostDraft(ctx(db), { id: "p1", title: "Uno", bodyBlocks: okBlocks });
  assert.ok(a.ok && b.ok);
  assert.equal(db.tables.cms_posts[0]!.title, "Uno");
});

test("a talent post is not reachable through another talent's scope", async () => {
  const db = fakeDb({ cms_posts: [post({ talent_profile_id: "tp-OTHER" })] });
  const r = await savePostDraft(ctx(db), { id: "p1", title: "x" });
  assert.equal(!r.ok && r.code, "not_found");
});

// ---- paid gate -------------------------------------------------------------

test("upgrade_required on publish KEEPS the draft content", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const r = await publishPostNow(ctx(db, { canPublish: false }), {
    id: "p1",
    draft: { title: "Guardado", bodyBlocks: okBlocks },
  });
  assert.deepEqual(r.ok ? null : { code: r.code, draftSaved: r.draftSaved }, { code: "upgrade_required", draftSaved: true });
  const row = db.tables.cms_posts[0]!;
  assert.equal(row.title, "Guardado");
  assert.equal(row.status, "draft");
});

test("upgrade_required on settings status=published saves the other fields", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const r = await updatePostSettings(ctx(db, { canPublish: false }), {
    id: "p1",
    patch: { status: "published", meta_title: "SEO" },
  });
  assert.equal(!r.ok && r.code, "upgrade_required");
  assert.equal(db.tables.cms_posts[0]!.meta_title, "SEO");
  assert.equal(db.tables.cms_posts[0]!.status, "draft");
});

test("scheduling (scheduled_publish_at) without the capability is upgrade_required; with it, it is stored; null clears", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const r = await updatePostSettings(ctx(db, { canPublish: false }), { id: "p1", patch: { scheduled_publish_at: future } });
  assert.equal(!r.ok && r.code, "upgrade_required");
  assert.equal(db.tables.cms_posts[0]!.scheduled_publish_at, null);
  const ok = await updatePostSettings(ctx(db), { id: "p1", patch: { scheduled_publish_at: future } });
  assert.ok(ok.ok && ok.data.scheduledPublishAt === future && ok.data.status === "draft");
  const cleared = await updatePostSettings(ctx(db, { canPublish: false }), { id: "p1", patch: { scheduled_publish_at: null } });
  assert.ok(cleared.ok && cleared.data.scheduledPublishAt === null);
});

test("talent actor under their WORKSPACE scope without Web Office: live post is read-only", async () => {
  const db = fakeDb({
    cms_posts: [post({ status: "published", published_at: "2026-10-01T00:00:00Z", tenant_id: "ag-1", talent_profile_id: null })],
  });
  const c = ctx(db, { scope: TENANT, actorKind: "talent", canPublish: false });
  for (const r of [
    await savePostDraft(c, { id: "p1", title: "edit" }),
    await updatePostSettings(c, { id: "p1", patch: { meta_title: "x" } }),
    await publishPostNow(c, { id: "p1", draft: { title: "x" } }),
  ]) {
    assert.equal(!r.ok && r.code, "read_only_lapsed");
  }
  assert.equal(db.writes.length, 0);
});

test("talent-actor lapse: a live post stays live and is read-only (no write)", async () => {
  const db = fakeDb({ cms_posts: [post({ status: "published", published_at: "2026-10-01T00:00:00Z" })] });
  const c = ctx(db, { canPublish: false });
  for (const r of [
    await savePostDraft(c, { id: "p1", title: "edit" }),
    await updatePostSettings(c, { id: "p1", patch: { meta_title: "x" } }),
    await publishPostNow(c, { id: "p1" }),
  ]) {
    assert.equal(!r.ok && r.code, "read_only_lapsed");
  }
  assert.equal(db.writes.length, 0);
  assert.equal(db.tables.cms_posts[0]!.status, "published");
});

test("workspace-admin actor: editing an already-published post stays allowed on any plan (no regression)", async () => {
  const db = fakeDb({
    cms_posts: [post({ status: "published", published_at: "2026-10-01T00:00:00Z", tenant_id: "ag-1", talent_profile_id: null })],
  });
  const c = ctx(db, { scope: TENANT, actorKind: "workspace_admin", canPublish: false });
  assert.ok((await savePostDraft(c, { id: "p1", title: "editado" })).ok);
  assert.ok((await updatePostSettings(c, { id: "p1", patch: { meta_title: "SEO" } })).ok);
  assert.ok((await publishPostNow(c, { id: "p1", draft: { title: "otra vez" } })).ok);
  const row = db.tables.cms_posts[0]!;
  assert.deepEqual([row.title, row.meta_title, row.status], ["otra vez", "SEO", "published"]);
});

test("workspace scope: moving a draft INTO published still needs the capability", async () => {
  const db = fakeDb({ cms_posts: [post({ tenant_id: "ag-1", talent_profile_id: null })] });
  const r = await publishPostNow(ctx(db, { scope: TENANT, actorKind: "workspace_admin", canPublish: false, uiLocale: "en" }), { id: "p1" });
  assert.equal(!r.ok && r.code, "upgrade_required");
  assert.equal(db.tables.cms_posts[0]!.status, "draft");
});

test("lapsed drafts can still be edited (drafts are kept and editable)", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const r = await savePostDraft(ctx(db, { canPublish: false }), { id: "p1", title: "sigue" });
  assert.ok(r.ok);
});

test("takedown refuses publish and edits with the Tulala message (ES + EN)", async () => {
  const db = fakeDb({ cms_posts: [post({ taken_down_at: "2026-10-10T00:00:00Z", taken_down_reason: "spam" })] });
  const es = await publishPostNow(ctx(db), { id: "p1" });
  assert.deepEqual(es.ok ? null : [es.code, es.message], ["taken_down", "Oculto por Tulala: spam"]);
  const en = await savePostDraft(ctx(db, { uiLocale: "en" }), { id: "p1", title: "x" });
  assert.deepEqual(en.ok ? null : [en.code, en.message], ["taken_down", "Hidden by Tulala: spam"]);
  assert.equal(db.writes.length, 0);
});

test("publish with the capability stamps published_at; unpublish clears it", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const r = await publishPostNow(ctx(db), { id: "p1" });
  assert.ok(r.ok && r.data.status === "published" && r.data.publishedAt);
  const u = await unpublishPostNow(ctx(db, { canPublish: false }), { id: "p1" });
  assert.ok(u.ok && u.data.status === "draft" && u.data.publishedAt === null);
});

// ---- slug redirect ---------------------------------------------------------

test("slug change on a published post writes a scoped /blog redirect", async () => {
  const db = fakeDb({ cms_posts: [post({ status: "published", published_at: "2026-10-01T00:00:00Z" })] });
  const r = await updatePostSettings(ctx(db), { id: "p1", patch: { slug: "nuevo-slug" } });
  assert.ok(r.ok);
  const redirect = db.tables.cms_redirects[0]!;
  assert.equal(redirect.old_path, "/blog/mi-post");
  assert.equal(redirect.new_path, "/blog/nuevo-slug");
  assert.equal(redirect.talent_profile_id, "tp-1");
  assert.equal(redirect.tenant_id, null);
});

test("slug change on a workspace post scopes the redirect to the tenant; drafts write none", async () => {
  const db = fakeDb({
    cms_posts: [
      post({ status: "published", tenant_id: "ag-1", talent_profile_id: null }),
      post({ id: "p2", slug: "borrador", tenant_id: "ag-1", talent_profile_id: null }),
    ],
  });
  assert.ok((await updatePostSettings(ctx(db, { scope: TENANT }), { id: "p1", patch: { slug: "otro" } })).ok);
  assert.ok((await updatePostSettings(ctx(db, { scope: TENANT }), { id: "p2", patch: { slug: "draft-2" } })).ok);
  assert.equal(db.tables.cms_redirects.length, 1);
  assert.equal(db.tables.cms_redirects[0]!.tenant_id, "ag-1");
});

// ---- cron skip -------------------------------------------------------------

test("cron publishes due posts only for capable owners; lapsed owners are skipped, not mutated", async () => {
  const now = "2026-10-14T12:00:00Z";
  const base: DuePostRow = {
    id: "a", tenant_id: null, talent_profile_id: "tp-paid", status: "draft",
    published_at: null, scheduled_publish_at: "2026-10-14T11:00:00Z", taken_down_at: null, updated_by: null,
  };
  const rows: DuePostRow[] = [
    base,
    { ...base, id: "b", talent_profile_id: "tp-free" },
    { ...base, id: "c", talent_profile_id: null, tenant_id: "ag-free" },
    { ...base, id: "d", scheduled_publish_at: "2026-10-15T00:00:00Z" },
    // A live-tenant draft with a stale PAST published_at and no schedule: never published.
    { ...base, id: "e", published_at: "2026-01-01T00:00:00Z", scheduled_publish_at: null },
  ];
  const published: string[] = [];
  const report = await runPostsScheduledSweep({
    nowIso: now,
    rows,
    ownerCanPublish: async (s) => (s.kind === "talent" ? s.talentProfileId === "tp-paid" : false),
    publish: async (row) => (published.push(row.id), { ok: true }),
  });
  assert.deepEqual(published, ["a"]);
  assert.deepEqual(report.published, ["a"]);
  assert.deepEqual(
    report.skipped.map((s) => [s.postId, s.reason]),
    [["b", "owner_lacks_posts_capability"], ["c", "owner_lacks_posts_capability"], ["d", "not_due"], ["e", "not_due"]],
  );
});

test("a draft with a past published_at and NO scheduled_publish_at is not published by the cron", async () => {
  const stale: DuePostRow = {
    id: "old", tenant_id: "ag-1", talent_profile_id: null, status: "draft",
    published_at: "2025-01-01T00:00:00Z", scheduled_publish_at: null, taken_down_at: null, updated_by: null,
  };
  const published: string[] = [];
  const report = await runPostsScheduledSweep({
    nowIso: "2026-10-14T12:00:00Z",
    rows: [stale],
    ownerCanPublish: async () => true,
    publish: async (row) => (published.push(row.id), { ok: true }),
  });
  assert.deepEqual(published, []);
  assert.deepEqual(report.published, []);
});

test("cron publish: published_at = scheduled_publish_at, schedule cleared", async () => {
  const when = "2026-10-14T11:00:00Z";
  const db = fakeDb({ cms_posts: [post({ scheduled_publish_at: when })] });
  const r = await publishPostNow(ctx(db, { actorProfileId: null }), { id: "p1", fromSchedule: true });
  assert.ok(r.ok);
  const row = db.tables.cms_posts[0]!;
  assert.deepEqual([row.status, row.published_at, row.scheduled_publish_at], ["published", when, null]);
});

// ---- TUL-1399: excerpt, language and EN/ES link ----------------------------

test("settings: excerpt is saved trimmed", async () => {
  const db = fakeDb({ cms_posts: [post()] });
  const res = await updatePostSettings(ctx(db), { id: "p1", patch: { excerpt: "  Resumen corto  " } });
  assert.equal(res.ok, true);
  assert.equal(db.tables.cms_posts[0].excerpt, "Resumen corto");
});

test("settings: a draft can change language; category and old link are cleared", async () => {
  const db = fakeDb({ cms_posts: [post({ category_id: "c1", translation_of: "x" })] });
  const res = await updatePostSettings(ctx(db), { id: "p1", patch: { locale: "en" } });
  assert.equal(res.ok, true);
  assert.equal(db.tables.cms_posts[0].locale, "en");
  assert.equal(db.tables.cms_posts[0].category_id, null);
  assert.equal(db.tables.cms_posts[0].translation_of, null);
});

test("settings: a live post keeps its language", async () => {
  const db = fakeDb({ cms_posts: [post({ status: "published" })] });
  const res = await updatePostSettings(ctx(db), { id: "p1", patch: { locale: "en" } });
  assert.equal(res.ok, false);
  assert.equal(db.tables.cms_posts[0].locale, "es");
});

test("settings: changing language onto a taken slug reports slug_taken", async () => {
  const db = fakeDb({ cms_posts: [post(), post({ id: "p2", locale: "en" })] });
  const res = await updatePostSettings(ctx(db), { id: "p1", patch: { locale: "en" } });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.code, "slug_taken");
});

test("settings: translation link needs a post in the OTHER language and points at the group root", async () => {
  const sameLang = "33333333-3333-4333-8333-333333333333";
  const other = "44444444-4444-4444-8444-444444444444";
  const db = fakeDb({
    cms_posts: [
      post({ id: "p1", locale: "es" }),
      post({ id: other, locale: "en", slug: "my-post", translation_of: "55555555-5555-4555-8555-555555555555" }),
      post({ id: sameLang, locale: "es", slug: "otro" }),
    ],
  });
  const same = await updatePostSettings(ctx(db), { id: "p1", patch: { translation_of: sameLang } });
  assert.equal(same.ok, false);
  const missing = await updatePostSettings(ctx(db), { id: "p1", patch: { translation_of: "66666666-6666-4666-8666-666666666666" } });
  assert.equal(missing.ok, false);
  const ok = await updatePostSettings(ctx(db), { id: "p1", patch: { translation_of: other } });
  assert.equal(ok.ok, true);
  assert.equal(db.tables.cms_posts[0].translation_of, "55555555-5555-4555-8555-555555555555");
});

test("settings: language and link keys are known to the schema (not forbidden fields)", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  const db = fakeDb({
    cms_posts: [post({ id: "p1", locale: "es" }), post({ id: id, locale: "en", slug: "my-post", translation_of: null })],
  });
  const res = await updatePostSettings(ctx(db), { id: "p1", patch: { translation_of: id } });
  assert.equal(res.ok, true);
  assert.equal(db.tables.cms_posts[0].translation_of, id);
});
