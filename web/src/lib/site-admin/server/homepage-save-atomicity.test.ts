/**
 * WAVE1-1.5 — save/publish/restore never leave a BUMPED version with no
 * revision at it.
 *
 * ── What was wrong ────────────────────────────────────────────────────────
 * `homepage.ts` claimed transactional saves in its header. It is not
 * transactional: PostgREST gives one statement per round-trip, so a save was a
 * sequence of ~4 independent REST calls with the CAS `UPDATE cms_pages
 * (version+1)` FIRST and the `cms_page_revisions` INSERT LAST. Any failure in
 * between left the page at version N+1 with the newest revision still at N:
 *   - the editor's canvas had no revision to rehydrate from, and
 *   - its retry (still holding N as `expectedVersion`) came back
 *     VERSION_CONFLICT for a save that was ITS OWN.
 *
 * ── What this file proves ─────────────────────────────────────────────────
 * The order is now revision-FIRST, CAS-second, with the reserved revision
 * compensated when the CAS loses. So:
 *   1. an INJECTED revision-write failure performs ZERO cms_pages UPDATEs (the
 *      version is never bumped) — this is the DoD case;
 *   2. the happy path still writes the revision at the version it is claiming;
 *   3. a GENUINE concurrent write is still rejected by the CAS (the reorder did
 *      not weaken optimistic concurrency), and the orphan revision it reserved
 *      is deleted again.
 * Covered for the draft-save path AND the restore path.
 *
 * Same Tier-1 style as `homepage-restore-integration.test.ts`: the REAL
 * function driven over a recording Supabase mock via the `__hooks` DI seam, no
 * env, no DB, no module mocks (unusable under `tsx --test`).
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --test src/lib/site-admin/server/homepage-save-atomicity.test.ts
 *   (Glob-covered by the `test:builder` lane via src/lib/site-admin/server/.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBuilderNode } from "../builder-node/create";
import type { BuilderNode } from "../builder-node/types";
import {
  restoreHomepageRevision,
  saveHomepageDraftComposition,
} from "./homepage";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const REV_ID = "44444444-4444-4444-8444-444444444444";
const LOCALE = "en" as const;

function freeformTree(): BuilderNode[] {
  const container = createBuilderNode("container");
  const h1 = createBuilderNode("heading");
  (container as { children: BuilderNode[] }).children = [h1];
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

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eqs: Array<[string, unknown]>;
}

interface MockConfig {
  pageRow: Record<string, unknown>;
  /** Row the cms_pages UPDATE returns. `null` = the CAS lost the race. */
  afterRow: Record<string, unknown> | null;
  /** Revision row returned by the SELECT-by-id (restore only). */
  revisionRow?: Record<string, unknown> | null;
  /** Inject a failure on the cms_page_revisions INSERT. */
  failRevisionInsert?: boolean;
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
        return { data: cfg.revisionRow ?? null, error: null };
      }
      return { data: null, error: null };
    };

    chain.select = () => self();
    chain.insert = (payload: unknown) => {
      rec.method = "insert";
      rec.payload = payload;
      if (table === "cms_page_revisions" && cfg.failRevisionInsert) {
        return Promise.resolve({
          data: null,
          error: { message: "injected: revision insert failed" },
        });
      }
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
    chain.in = () => Promise.resolve({ data: [], error: null });
    chain.order = () => self();
    chain.limit = () => self();
    chain.maybeSingle = () => Promise.resolve(single());
    chain.single = () => Promise.resolve(single());
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data: [], error: null });

    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls };
}

const findAll = (
  calls: RecordedCall[],
  table: string,
  method: RecordedCall["method"],
) => calls.filter((c) => c.table === table && c.method === method);

const noopHooks = {
  requireCapability: async () => {},
  scheduleAudit: () => {},
};

/** A freeform draft save (no curated slots, one builder tree). */
const saveParams = (over: { expectedVersion?: number } = {}) => ({
  tenantId: TENANT,
  values: {
    tenantId: TENANT,
    locale: LOCALE,
    expectedVersion: over.expectedVersion ?? 5,
    metadata: {
      title: "Studio Home",
      metaTitle: undefined,
      metaDescription: "Meta copy",
      introTagline: undefined,
      ogTitle: undefined,
      ogDescription: undefined,
      ogImageUrl: undefined,
      canonicalUrl: undefined,
      noindex: false,
    },
    slots: {},
    builderTree: freeformTree(),
  } as unknown as Parameters<
    typeof saveHomepageDraftComposition
  >[1]["values"],
  actorProfileId: null,
  __hooks: noopHooks,
});

const restoreParams = (over: { expectedVersion?: number } = {}) => ({
  tenantId: TENANT,
  values: {
    tenantId: TENANT,
    locale: LOCALE,
    revisionId: REV_ID,
    expectedVersion: over.expectedVersion ?? 5,
  },
  actorProfileId: null,
  __hooks: noopHooks,
});

const storedRevision = () => ({
  id: REV_ID,
  tenant_id: TENANT,
  page_id: PAGE_ID,
  kind: "published",
  version: 3,
  template_schema_version: 1,
  snapshot: {
    page: { title: "Restored Home", meta_description: "Restored meta" },
    composition: [],
    builderTree: freeformTree(),
  },
  created_by: null,
  created_at: "2026-05-15T00:00:00.000Z",
});

// ═══════════════════════════════════════════════════════════════════════════
// saveHomepageDraftComposition
// ═══════════════════════════════════════════════════════════════════════════

describe("saveHomepageDraftComposition — revision-before-version-bump", () => {
  test("happy path: revision is written FIRST, at the version the CAS then claims", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
    });

    const res = await saveHomepageDraftComposition(supabase, saveParams());
    assert.ok(res.ok, "save succeeds");
    assert.equal(res.data.version, 6);

    const revIns = findAll(calls, "cms_page_revisions", "insert");
    const pageUpd = findAll(calls, "cms_pages", "update");
    assert.equal(revIns.length, 1, "exactly one revision written");
    assert.equal(pageUpd.length, 1, "exactly one page UPDATE");
    assert.ok(
      calls.indexOf(revIns[0]!) < calls.indexOf(pageUpd[0]!),
      "the revision INSERT is issued BEFORE the version-bumping UPDATE",
    );

    const rev = revIns[0]!.payload as Record<string, unknown>;
    const upd = pageUpd[0]!.payload as Record<string, unknown>;
    assert.equal(rev.kind, "draft");
    assert.equal(
      rev.version,
      upd.version,
      "the revision is stamped at exactly the version the UPDATE claims",
    );
    assert.equal(rev.version, 6);
    assert.ok(rev.id, "revision id is client-minted so it can be compensated");
    assert.ok(
      (rev.snapshot as { builderTree?: unknown }).builderTree,
      "the projected snapshot still carries the builder tree",
    );
  });

  test("INJECTED revision-write failure -> ZERO page UPDATEs, version never bumped", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      failRevisionInsert: true,
    });

    const res = await saveHomepageDraftComposition(supabase, saveParams());
    assert.ok(!res.ok, "the failure is surfaced, not swallowed");

    assert.equal(
      findAll(calls, "cms_page_revisions", "insert").length,
      1,
      "the revision write was attempted",
    );
    assert.equal(
      findAll(calls, "cms_pages", "update").length,
      0,
      "NO cms_pages UPDATE ran — the version cannot be bumped past a revision that does not exist",
    );
    assert.equal(
      findAll(calls, "cms_page_sections", "delete").length,
      0,
      "the draft junction rows are left untouched too",
    );
  });

  test("genuine concurrent write: CAS still rejects, and the reserved revision is compensated", async () => {
    const { supabase, calls } = makeSupabase({
      // Row still reads at 5 (our expectedVersion matches, so we get past the
      // read-time gate) but the WRITE-time CAS finds 0 rows: another writer
      // bumped it in between. This is the genuine-conflict shape.
      pageRow: pageRow({ version: 5 }),
      afterRow: null,
    });

    const res = await saveHomepageDraftComposition(supabase, saveParams());
    assert.ok(!res.ok, "conflict surfaces as a failure");
    assert.equal(
      (res as { code?: string }).code,
      "VERSION_CONFLICT",
      "the optimistic CAS still rejects a genuine concurrent write",
    );

    const upd = findAll(calls, "cms_pages", "update")[0];
    assert.ok(upd, "the CAS UPDATE was attempted");
    assert.ok(
      upd!.eqs.some(([c, v]) => c === "version" && v === 5),
      "the UPDATE is still guarded by .eq(version, expected) — CAS semantics preserved",
    );

    const revIns = findAll(calls, "cms_page_revisions", "insert")[0];
    const revDel = findAll(calls, "cms_page_revisions", "delete")[0];
    assert.ok(revDel, "the reserved revision is deleted again");
    const reservedId = (revIns!.payload as { id: string }).id;
    assert.ok(
      revDel!.eqs.some(([c, v]) => c === "id" && v === reservedId),
      "the compensating DELETE targets exactly the revision we reserved",
    );
  });

  test("read-time stale expectedVersion -> conflict with ZERO writes (unchanged)", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow({ version: 5 }),
      afterRow: pageRow({ version: 6 }),
    });

    const res = await saveHomepageDraftComposition(
      supabase,
      saveParams({ expectedVersion: 4 }),
    );
    assert.ok(!res.ok);
    assert.equal((res as { code?: string }).code, "VERSION_CONFLICT");
    assert.equal(
      calls.filter((c) => c.method !== "select").length,
      0,
      "a read-time conflict still short-circuits before any write",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// restoreHomepageRevision — same invariant
// ═══════════════════════════════════════════════════════════════════════════

describe("restoreHomepageRevision — revision-before-version-bump", () => {
  test("INJECTED revision-write failure -> ZERO page UPDATEs", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      revisionRow: storedRevision(),
      failRevisionInsert: true,
    });

    const res = await restoreHomepageRevision(supabase, restoreParams());
    assert.ok(!res.ok, "restore surfaces the revision-write failure");
    assert.equal(
      findAll(calls, "cms_pages", "update").length,
      0,
      "restore never bumps the version past a missing revision either",
    );
  });

  test("happy path still orders revision before the CAS bump", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, title: "Restored Home" }),
      revisionRow: storedRevision(),
    });

    const res = await restoreHomepageRevision(supabase, restoreParams());
    assert.ok(res.ok, "restore succeeds");
    const revIns = findAll(calls, "cms_page_revisions", "insert")[0];
    const pageUpd = findAll(calls, "cms_pages", "update")[0];
    assert.ok(revIns && pageUpd);
    assert.ok(
      calls.indexOf(revIns!) < calls.indexOf(pageUpd!),
      "rollback revision written before the version bump",
    );
    assert.equal((revIns!.payload as { kind: string }).kind, "rollback");
    assert.equal((revIns!.payload as { version: number }).version, 6);
  });
});
