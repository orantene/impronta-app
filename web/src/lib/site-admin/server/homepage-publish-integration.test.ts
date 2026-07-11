/**
 * Phase 5 / M5 — homepage PUBLISH + RESTORE + CAS integration coverage (W4-F6).
 *
 * The highest-blast-radius UNtested path in `./homepage.ts` was the publish
 * pipeline: `publishHomepage` (draft → live snapshot + status + revision +
 * version CAS) and `restoreHomepageRevision` (rollback → new draft revision).
 * M5's unit suite (`site-admin-m5.test.ts`) covers only the Zod + capability
 * surface and defers DB-coupled behavior to "the env-gated integration suite",
 * which did not exist for the homepage composer until this file. This ADDS a
 * safety net over the real production functions (no refactor) so the parallel
 * god-file decomposition of `homepage.ts` has a regression backstop.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Two tiers (mirrors `site-admin-m3-integration.test.ts`):
 *
 *   TIER 1 — REAL `publishHomepage` over a recording Supabase mock. ALWAYS
 *            runs (no env, no DB), so it is the CI backstop the decomposition
 *            leans on. It invokes the ACTUAL production function and asserts
 *            the real query chain it emits.
 *
 *            Why a recording mock and not `mock.module` or a real DB:
 *              - `publishHomepage` ends with `scheduleAuditEvent` (Next
 *                `after()`) + `bustHomepageTags` (`revalidateTag`). Both throw
 *                "outside a request scope" under `tsx --test`. They fire only
 *                AFTER every core DB write (page UPDATE, section resync,
 *                revision INSERT), so the test calls the real function, lets the
 *                trailing request-scope call throw, and asserts on the writes
 *                that already landed on the recording mock. Audit + cache-bust
 *                are best-effort side effects, not publish logic.
 *              - The capability gate is skipped via `bypassCapabilityCheck`
 *                (the cron escape hatch already in the production signature) —
 *                no auth/session context is needed.
 *              - `mock.module` is unusable here: under tsx, registering ANY
 *                module mock corrupts the named-export bindings of every
 *                subsequently dynamic-imported module (documented in
 *                `copy-published-to-draft.test.ts`; re-verified for this lane —
 *                `restoreHomepageRevision` came back `undefined`).
 *
 *   TIER 2 — real-Postgres optimistic-CAS + revision-append invariants, the
 *            DB contract the publish/restore pipeline depends on. ENV-GATED and
 *            SKIPS cleanly (exactly like m3) when the Supabase test env is
 *            absent. It uses a DISPOSABLE, prefix-slugged NON-system page row so
 *            it never mutates a tenant's real system homepage and is fully
 *            cleaned up in `after(...)`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Testability finding (NOT a bug — reported to the lane, not fixed here):
 *   `restoreHomepageRevision` and `saveHomepageDraftComposition` call
 *   `requirePhase5Capability` on their FIRST line with no bypass and no
 *   `__hooks` DI seam (unlike `copyPublishedToDraft`), so they throw before any
 *   DB work and cannot be invoked in a node:test harness. `publishHomepage` is
 *   testable only because `bypassCapabilityCheck` exists. Restore's DB-level
 *   effect (a new appended revision under a version guard) is therefore covered
 *   through the Tier-2 revision-append + CAS invariants rather than a direct
 *   call. Adding a matching test seam to restore/save is a follow-up for the
 *   decomposition lanes.
 *
 * Run:
 *   TIER 1 only (no env):
 *     NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *       npx tsx --test src/lib/site-admin/server/homepage-publish-integration.test.ts
 *   TIER 1 + TIER 2 (real DB):
 *     NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     TEST_M3_TENANT_ID=<tenant-uuid> \
 *       NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *       npx tsx --test src/lib/site-admin/server/homepage-publish-integration.test.ts
 *   (Glob-covered by the `test:builder` lane → runs in CI; Tier 2 skips there.)
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createBuilderNode } from "../builder-node/create";
import type { BuilderNode } from "../builder-node/types";
import { publishHomepage } from "./homepage";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const SECTION_ID = "33333333-3333-4333-8333-333333333333";
const LOCALE = "en" as const;

/** A canonically-valid FREEFORM builder tree (container + two headings), built
 *  from the real node factory so it survives future schema tweaks. Node count
 *  is > 1, so `recoverBuilderTreeIfEmpty` returns it early (no extra query),
 *  and it carries NO `section` node, so it needs no composition slot to pass
 *  `resolveSnapshotBuilderTreeForPublish`. */
function freeformTree(): BuilderNode[] {
  const container = createBuilderNode("container");
  const h1 = createBuilderNode("heading");
  const h2 = createBuilderNode("heading");
  (container as { children: BuilderNode[] }).children = [h1, h2];
  return [container];
}

function pageRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAGE_ID,
    tenant_id: TENANT,
    locale: LOCALE,
    slug: "",
    template_key: "homepage",
    system_template_key: "homepage",
    is_system_owned: true,
    template_schema_version: 1,
    title: "Studio Home",
    status: "draft",
    body: "",
    hero: { introTagline: "By appointment" },
    meta_title: null,
    meta_description: "Meta copy",
    og_title: null,
    og_description: null,
    og_image_url: null,
    og_image_media_asset_id: null,
    noindex: false,
    include_in_sitemap: true,
    canonical_url: null,
    published_at: null,
    published_homepage_snapshot: null,
    version: 5,
    created_by: null,
    updated_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function draftSectionRow(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: TENANT,
    page_id: PAGE_ID,
    section_id: SECTION_ID,
    slot_key: "hero",
    sort_order: 0,
    is_draft: true,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function sectionFacts(
  status: "draft" | "published" | "archived",
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: SECTION_ID,
    tenant_id: TENANT,
    section_type_key: "hero",
    name: "Hero",
    status,
    schema_version: 1,
    props_jsonb: { headline: "Welcome" },
    version: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Recording Supabase mock — chainable + call-recording, table/shape aware.
// Records every write so assertions run against the op's real query chain.
// ---------------------------------------------------------------------------

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eqs: Array<[string, unknown]>;
}

interface MockConfig {
  /** Row returned by the initial cms_pages SELECT (maybeSingle). */
  pageRow: Record<string, unknown>;
  /** Row returned by the cms_pages UPDATE ... select (maybeSingle). `null`
   *  simulates a CAS miss AT WRITE TIME (concurrent bump between read + write). */
  afterRow: Record<string, unknown> | null;
  /** is_draft=TRUE rows returned by the cms_page_sections SELECT. */
  draftRows: Array<Record<string, unknown>>;
  /** builderTree carried on the version-matched cms_page_revisions row. */
  versionRevisionTree: unknown;
  /** rows returned by loadSectionFactsBulk (cms_sections .in()). */
  sectionFacts: Array<Record<string, unknown>>;
}

function makeSupabase(cfg: MockConfig) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const rec: RecordedCall = { table, method: "select", eqs: [] };
    calls.push(rec);

    const chain: Record<string, unknown> = {};
    const self = () => chain;

    const single = () => {
      if (table === "cms_pages") {
        return {
          data: rec.method === "update" ? cfg.afterRow : cfg.pageRow,
          error: null,
        };
      }
      if (table === "cms_page_revisions") {
        // version-matched builderTree lookup (limit(1).maybeSingle)
        return { data: { snapshot: { builderTree: cfg.versionRevisionTree } }, error: null };
      }
      return { data: null, error: null };
    };

    // Directly-awaited chains (no maybeSingle terminal):
    //   - cms_page_sections draft SELECT (.order().order())
    //   - cms_page_sections live DELETE (.eq()...)
    //   - cms_page_revisions recover SELECT (.order().limit(25)) — only if
    //     reached (never in these fixtures: trees are non-empty).
    const listResult = () => {
      if (table === "cms_page_sections") return { data: cfg.draftRows, error: null };
      return { data: [], error: null };
    };

    chain.select = () => self();
    chain.insert = (payload: unknown) => {
      rec.method = "insert";
      rec.payload = payload;
      return Promise.resolve({ data: null, error: null });
    };
    chain.update = (payload: unknown) => {
      rec.method = "update";
      rec.payload = payload;
      return self();
    };
    chain.delete = () => {
      rec.method = "delete";
      return self();
    };
    chain.eq = (col: string, val: unknown) => {
      rec.eqs.push([col, val]);
      return self();
    };
    // loadSectionFactsBulk terminates + awaits on .in().
    chain.in = () => Promise.resolve({ data: cfg.sectionFacts, error: null });
    chain.order = () => self();
    chain.limit = () => self();
    chain.maybeSingle = () => Promise.resolve(single());
    chain.single = () => Promise.resolve(single());
    // Make the chain itself awaitable for the directly-awaited selects/deletes.
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve(listResult());

    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls };
}

// Helpers over recorded calls.
const writeCalls = (calls: RecordedCall[]) =>
  calls.filter(
    (c) => c.method === "insert" || c.method === "update" || c.method === "delete",
  );
const findCall = (
  calls: RecordedCall[],
  table: string,
  method: RecordedCall["method"],
) => calls.find((c) => c.table === table && c.method === method);

const publishParams = (
  over: Partial<{ tenantId: string; expectedVersion: number }> = {},
) => ({
  tenantId: over.tenantId ?? TENANT,
  values: {
    tenantId: TENANT,
    locale: LOCALE,
    expectedVersion: over.expectedVersion ?? 5,
  },
  actorProfileId: null,
  bypassCapabilityCheck: true as const,
});

/**
 * Invoke the REAL `publishHomepage` and swallow ONLY the trailing request-scope
 * throw (`after()` / `revalidateTag`). Any other throw propagates. Returns the
 * op's `Phase5Result` when it returned normally (early-exit paths never reach
 * the request-scope calls), else `undefined` (the happy path, which succeeds at
 * the DB layer then throws on the deferred audit/cache-bust).
 */
async function runPublish(
  supabase: SupabaseClient,
  params: ReturnType<typeof publishParams>,
): Promise<Awaited<ReturnType<typeof publishHomepage>> | undefined> {
  try {
    return await publishHomepage(supabase, params);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const isRequestScope =
      /request scope/i.test(msg) || /static generation store/i.test(msg);
    if (!isRequestScope) throw err;
    return undefined;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 1 — REAL publishHomepage over a recording mock (always runs)
// ═══════════════════════════════════════════════════════════════════════════

describe("publishHomepage — real function, recording mock", () => {
  test("FREEFORM happy path: writes published snapshot + status + revision + version CAS", async () => {
    const tree = freeformTree();
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, status: "published" }),
      draftRows: [], // no curated slots -> freeform (builderTree-only) homepage
      versionRevisionTree: tree,
      sectionFacts: [],
    });

    const res = await runPublish(supabase, publishParams());
    // Happy path succeeds at the DB layer, then throws on the deferred
    // audit/cache-bust request-scope call — so it returns undefined here.
    assert.equal(res, undefined, "happy path reaches the trailing request-scope call");

    // --- cms_pages UPDATE: status + published snapshot + version CAS advance ---
    const upd = findCall(calls, "cms_pages", "update");
    assert.ok(upd, "cms_pages UPDATE ran");
    const payload = upd!.payload as Record<string, unknown>;
    assert.equal(payload.status, "published", "status flipped to published");
    assert.ok(payload.published_at, "published_at stamped");
    assert.equal(payload.version, 6, "version CAS-advanced to beforeVersion+1");
    // Optimistic lock: the UPDATE is guarded by .eq('version', beforeVersion).
    assert.ok(
      upd!.eqs.some(([c, v]) => c === "version" && v === 5),
      "UPDATE guarded by the expected prior version (optimistic CAS)",
    );
    assert.ok(
      upd!.eqs.some(([c, v]) => c === "id" && v === PAGE_ID),
      "UPDATE scoped to the homepage row id",
    );

    // --- published_homepage_snapshot: a v1 HomepageSnapshot carrying the tree ---
    assert.ok(
      "published_homepage_snapshot" in payload,
      "published_homepage_snapshot written",
    );
    const snap = payload.published_homepage_snapshot as Record<string, unknown>;
    assert.equal(snap.version, 1, "snapshot envelope version");
    assert.equal(snap.pageVersion, 6, "snapshot pins the new page version");
    assert.equal(snap.locale, LOCALE);
    assert.deepEqual(
      (snap.fields as { title: string }).title,
      "Studio Home",
      "snapshot freezes the page title",
    );
    assert.ok(Array.isArray(snap.slots), "snapshot carries a slots array");
    assert.ok(
      Array.isArray(snap.builderTree) && (snap.builderTree as unknown[]).length === 1,
      "snapshot carries the frozen freeform builderTree",
    );

    // --- cms_page_revisions INSERT: kind='published' at the new version ---
    const revIns = findCall(calls, "cms_page_revisions", "insert");
    assert.ok(revIns, "cms_page_revisions INSERT ran");
    const rev = revIns!.payload as Record<string, unknown>;
    assert.equal(rev.kind, "published", "revision logged as kind=published");
    assert.equal(rev.version, 6, "revision stamped at the published version");
    assert.equal(rev.page_id, PAGE_ID);
    assert.ok(rev.snapshot, "revision carries a snapshot payload");
  });

  test("CURATED happy path: freezes the referenced section + resyncs is_draft=FALSE rows", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, status: "published" }),
      draftRows: [draftSectionRow()],
      versionRevisionTree: [], // curated -> tree rebuilt from slots at publish
      sectionFacts: [sectionFacts("published")],
    });

    const res = await runPublish(supabase, publishParams());
    assert.equal(res, undefined, "curated happy path reaches the trailing request-scope call");

    // Published snapshot freezes the referenced section into slots[].
    const upd = findCall(calls, "cms_pages", "update");
    assert.ok(upd, "cms_pages UPDATE ran");
    const snap = (upd!.payload as Record<string, unknown>)
      .published_homepage_snapshot as Record<string, unknown>;
    const slots = snap.slots as Array<{ sectionId: string; slotKey: string }>;
    assert.equal(slots.length, 1, "one section frozen into the snapshot");
    assert.equal(slots[0].sectionId, SECTION_ID);
    assert.equal(slots[0].slotKey, "hero");

    // The live junction is resynced: DELETE is_draft=FALSE, then re-INSERT.
    const liveDelete = calls.find(
      (c) =>
        c.table === "cms_page_sections" &&
        c.method === "delete" &&
        c.eqs.some(([col, val]) => col === "is_draft" && val === false),
    );
    assert.ok(liveDelete, "old is_draft=FALSE rows deleted before resync");
    const liveInsert = findCall(calls, "cms_page_sections", "insert");
    assert.ok(liveInsert, "fresh live rows inserted");
    const liveRows = liveInsert!.payload as Array<Record<string, unknown>>;
    assert.ok(
      liveRows.every((r) => r.is_draft === false),
      "resynced rows are is_draft=FALSE (mirror the published snapshot)",
    );
    assert.equal(liveRows[0].section_id, SECTION_ID);
  });

  test("stale expectedVersion -> clean VERSION_CONFLICT, ZERO writes", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow({ version: 5 }),
      afterRow: pageRow({ version: 6 }),
      draftRows: [],
      versionRevisionTree: freeformTree(),
      sectionFacts: [],
    });

    // Operator's expectedVersion is behind the stored row.
    const res = await runPublish(supabase, publishParams({ expectedVersion: 4 }));
    assert.ok(res && res.ok === false, "returns a failure result (no throw)");
    assert.equal(
      (res as { code?: string }).code,
      "VERSION_CONFLICT",
      "stale CAS rejected with VERSION_CONFLICT",
    );
    assert.equal(
      writeCalls(calls).length,
      0,
      "a rejected publish performs no INSERT/UPDATE/DELETE",
    );
  });

  test("CAS miss AT WRITE TIME (afterRow null) -> VERSION_CONFLICT", async () => {
    // expectedVersion matches the read, but the guarded UPDATE affects 0 rows
    // (a concurrent writer bumped the version between our read and write).
    const { supabase } = makeSupabase({
      pageRow: pageRow({ version: 5 }),
      afterRow: null, // UPDATE ... .eq('version',5) matched nothing
      draftRows: [],
      versionRevisionTree: freeformTree(),
      sectionFacts: [],
    });

    const res = await runPublish(supabase, publishParams({ expectedVersion: 5 }));
    assert.ok(res && res.ok === false, "returns a failure result");
    assert.equal(
      (res as { code?: string }).code,
      "VERSION_CONFLICT",
      "a lost write-time CAS is surfaced as VERSION_CONFLICT",
    );
  });

  test("PUBLISH_NOT_READY: required slot empty (non-freeform) is rejected", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      draftRows: [], // no slots ...
      versionRevisionTree: [], // ... AND no builderTree -> NOT freeform
      sectionFacts: [],
    });

    const res = await runPublish(supabase, publishParams());
    assert.ok(res && res.ok === false, "returns a failure result");
    assert.equal((res as { code?: string }).code, "PUBLISH_NOT_READY");
    assert.match(
      (res as { message?: string }).message ?? "",
      /required slot/i,
      "message names the empty required slot",
    );
    assert.equal(writeCalls(calls).length, 0, "no writes on a not-ready publish");
  });

  test("PUBLISH_NOT_READY: referenced section not published is rejected", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      draftRows: [draftSectionRow()],
      versionRevisionTree: [],
      sectionFacts: [sectionFacts("draft")], // referenced section still a draft
    });

    const res = await runPublish(supabase, publishParams());
    assert.ok(res && res.ok === false, "returns a failure result");
    assert.equal((res as { code?: string }).code, "PUBLISH_NOT_READY");
    assert.match(
      (res as { message?: string }).message ?? "",
      /is draft|publish the section/i,
      "message tells the operator to publish the section first",
    );
    assert.equal(writeCalls(calls).length, 0, "no writes when a section is unpublished");
  });

  test("tenantId mismatch -> FORBIDDEN, ZERO reads/writes", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      draftRows: [],
      versionRevisionTree: freeformTree(),
      sectionFacts: [],
    });

    const res = await runPublish(
      supabase,
      publishParams({ tenantId: "99999999-9999-4999-8999-999999999999" }),
    );
    assert.ok(res && res.ok === false, "returns a failure result");
    assert.equal((res as { code?: string }).code, "FORBIDDEN");
    // Guard runs before any DB access.
    assert.equal(calls.length, 0, "no query issued on a tenant mismatch");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2 — real-Postgres CAS + revision-append invariants (env-gated)
// ═══════════════════════════════════════════════════════════════════════════
//
// The DB contract the publish/restore pipeline leans on, proven against a real
// Postgres: (a) an optimistic `.eq('version', expected)` UPDATE rejects a stale
// writer (the CAS at the heart of publish + restore + save), and (b) an appended
// cms_page_revisions row is durably readable back (how publish logs kind=
// 'published' and restore logs a new draft revision). Uses a DISPOSABLE,
// prefix-slugged NON-system page so it never touches a tenant's real homepage.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const TENANT_A = process.env.TEST_M3_TENANT_ID?.trim();

const DB_READY = Boolean(SUPA_URL && SERVICE_KEY && TENANT_A);
const DB_SKIP_REASON = DB_READY
  ? undefined
  : "Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + TEST_M3_TENANT_ID to run the publish-pipeline DB invariants";

const SLUG_PREFIX = "hp-pub-itest";

function slugFor(label: string): string {
  return `${SLUG_PREFIX}-${label}-${randomUUID().slice(0, 8)}`;
}

async function cleanupTenant(supabase: SupabaseClient, tenantId: string) {
  // Revisions cascade on page delete; delete the disposable pages we created.
  await supabase
    .from("cms_pages")
    .delete()
    .eq("tenant_id", tenantId)
    .ilike("slug", `${SLUG_PREFIX}-%`);
}

describe(
  "homepage publish pipeline DB invariants (env-gated)",
  { skip: DB_SKIP_REASON },
  () => {
    const supabase = createClient(SUPA_URL!, SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    before(async () => {
      await cleanupTenant(supabase, TENANT_A!);
    });

    after(async () => {
      await cleanupTenant(supabase, TENANT_A!);
    });

    test("optimistic CAS: a stale-version UPDATE affects 0 rows; the fresh one wins", async () => {
      const slug = slugFor("cas");
      const { data: inserted, error: insErr } = await supabase
        .from("cms_pages")
        .insert({
          tenant_id: TENANT_A!,
          locale: LOCALE,
          slug,
          template_key: "standard_page",
          template_schema_version: 1,
          title: "CAS probe",
          body: "",
          hero: {},
          noindex: false,
          include_in_sitemap: true,
          status: "draft",
          version: 1,
        })
        .select("id, version")
        .single<{ id: string; version: number }>();
      assert.equal(insErr, null);
      assert.ok(inserted);

      // Writer A (fresh) advances v1 -> v2 under the guard.
      const { data: winRows, error: winErr } = await supabase
        .from("cms_pages")
        .update({ title: "A wins", version: 2 })
        .eq("id", inserted!.id)
        .eq("version", 1)
        .select("id, version");
      assert.equal(winErr, null);
      assert.equal(winRows?.length, 1, "the fresh-version writer advances the row");

      // Writer B (stale, still expects v1) — the same guard now matches nothing.
      const { data: staleRows, error: staleErr } = await supabase
        .from("cms_pages")
        .update({ title: "B stale", version: 2 })
        .eq("id", inserted!.id)
        .eq("version", 1)
        .select("id, version");
      assert.equal(staleErr, null);
      assert.equal(
        staleRows?.length ?? 0,
        0,
        "a stale-version UPDATE affects 0 rows (this is what surfaces as VERSION_CONFLICT)",
      );

      // Final state is Writer A's.
      const { data: finalRow } = await supabase
        .from("cms_pages")
        .select("title, version")
        .eq("id", inserted!.id)
        .single<{ title: string; version: number }>();
      assert.equal(finalRow?.title, "A wins");
      assert.equal(finalRow?.version, 2);
    });

    test("revision append: publish + restore-style rows are durably readable back in order", async () => {
      const slug = slugFor("rev");
      const { data: page, error: pErr } = await supabase
        .from("cms_pages")
        .insert({
          tenant_id: TENANT_A!,
          locale: LOCALE,
          slug,
          template_key: "standard_page",
          template_schema_version: 1,
          title: "Revision probe",
          body: "",
          hero: {},
          noindex: false,
          include_in_sitemap: true,
          status: "draft",
          version: 1,
        })
        .select("id")
        .single<{ id: string }>();
      assert.equal(pErr, null);
      assert.ok(page);

      // Append a published revision, then a rollback (restore) revision — the
      // two revision kinds the publish pipeline writes.
      const publishedSnap = { kind: "published", builderTree: freeformTree() };
      const rollbackSnap = { kind: "rollback", builderTree: freeformTree() };
      const { error: revErr } = await supabase.from("cms_page_revisions").insert([
        {
          tenant_id: TENANT_A!,
          page_id: page!.id,
          kind: "published",
          version: 2,
          template_schema_version: 1,
          snapshot: publishedSnap,
          created_by: null,
        },
        {
          tenant_id: TENANT_A!,
          page_id: page!.id,
          kind: "rollback",
          version: 3,
          template_schema_version: 1,
          snapshot: rollbackSnap,
          created_by: null,
        },
      ]);
      assert.equal(revErr, null, "both revision rows insert");

      const { data: revs, error: readErr } = await supabase
        .from("cms_page_revisions")
        .select("kind, version, snapshot")
        .eq("tenant_id", TENANT_A!)
        .eq("page_id", page!.id)
        .order("version", { ascending: true });
      assert.equal(readErr, null);
      assert.equal(revs?.length, 2, "both appended revisions read back");
      assert.deepEqual(
        (revs ?? []).map((r: { kind: string }) => r.kind),
        ["published", "rollback"],
        "publish logs kind=published; a restore appends a new kind=rollback revision",
      );
      // A restore rehydrates from the stored snapshot — prove it round-trips.
      const rollback = (revs ?? []).find(
        (r: { kind: string }) => r.kind === "rollback",
      ) as { snapshot: { builderTree: unknown } } | undefined;
      assert.ok(
        Array.isArray(rollback?.snapshot.builderTree),
        "restore revision carries a rehydratable builderTree snapshot",
      );
    });
  },
);
