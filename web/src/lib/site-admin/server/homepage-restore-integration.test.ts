/**
 * Phase 5 / M5 — homepage RESTORE (rollback) direct coverage (W5-A2).
 *
 * Split out of `homepage-publish-integration.test.ts` (F6) so both files stay
 * under the 800-line max-lines cap. This drives the REAL
 * `restoreHomepageRevision` over a recording Supabase mock, in F6's Tier-1
 * style (real function, no env, no DB), via the `__hooks` DI seam added in this
 * lane.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Why a DI seam (the F6 testability finding, now resolved):
 *   `restoreHomepageRevision` used to call `requirePhase5Capability` on its
 *   first line with no bypass and no seam (unlike `copyPublishedToDraft`), so it
 *   threw "outside a request scope" before any DB work and could not be invoked
 *   under `tsx --test`. F6 covered restore only indirectly (Tier-2 CAS +
 *   revision-append invariants). This lane added the SAME `__hooks` seam
 *   `copyPublishedToDraft` carries:
 *     `__hooks?: { requireCapability?; scheduleAudit? }` (defaults to the real
 *     impls). Production call sites pass neither, so the capability check runs
 *     exactly as before — runtime behavior is unchanged. The test injects a
 *     no-op `requireCapability` (skip auth/request-scope coupling) + a no-op
 *     `scheduleAudit` (skip the `after()` request-scope throw). Restore writes
 *     no cache-bust (revalidateTag), so with those two couplings neutralized the
 *     op returns its `Phase5Result` cleanly — no request-scope swallow needed.
 *
 *   Same `mock.module`-is-unusable-under-tsx constraint as F6: we drive the real
 *   function over a call-recording mock, never a module mock.
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --test src/lib/site-admin/server/homepage-restore-integration.test.ts
 *   (Glob-covered by the `test:builder` lane via src/lib/site-admin/server/*.test.ts.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBuilderNode } from "../builder-node/create";
import type { BuilderNode } from "../builder-node/types";
import { restoreHomepageRevision } from "./homepage";

// ---------------------------------------------------------------------------
// Shared fixtures (mirror homepage-publish-integration.test.ts)
// ---------------------------------------------------------------------------

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const SECTION_ID = "33333333-3333-4333-8333-333333333333";
const REV_ID = "44444444-4444-4444-8444-444444444444";
const LOCALE = "en" as const;

/** A canonically-valid FREEFORM builder tree (container + two headings). */
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

/** A stored revision the operator is rolling back to: a curated hero-slot
 *  composition + prior page fields + a freeform tree. */
function restoreRevisionRow(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: REV_ID,
    tenant_id: TENANT,
    page_id: PAGE_ID,
    kind: "published",
    version: 3,
    template_schema_version: 1,
    snapshot: {
      page: {
        title: "Restored Home",
        meta_description: "Restored meta",
        hero: { introTagline: "Prior tagline" },
      },
      composition: [
        {
          slotKey: "hero",
          sortOrder: 0,
          sectionId: SECTION_ID,
          sectionTypeKey: "hero",
          schemaVersion: 1,
          name: "Hero",
          props: { headline: "Older headline" },
        },
      ],
      builderTree: freeformTree(),
    },
    created_by: null,
    created_at: "2026-05-15T00:00:00.000Z",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Recording Supabase mock — tailored to restore's query chain.
// (Same recording style as the publish test's `makeSupabase`, but returns a
//  FULL revision row for the SELECT-by-id lookup restore performs.)
// ---------------------------------------------------------------------------

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eqs: Array<[string, unknown]>;
}

interface RestoreMockConfig {
  /** Row returned by the initial cms_pages SELECT (maybeSingle). */
  pageRow: Record<string, unknown>;
  /** Row returned by the cms_pages UPDATE ... select (maybeSingle). `null`
   *  simulates a write-time CAS miss. */
  afterRow: Record<string, unknown> | null;
  /** Revision row returned by the cms_page_revisions SELECT-by-id (maybeSingle).
   *  `null` simulates a bad / nonexistent revision id. */
  revisionRow: Record<string, unknown> | null;
  /** Rows returned by loadSectionFactsBulk (cms_sections .in()). */
  sectionFacts: Array<Record<string, unknown>>;
}

function makeRestoreSupabase(cfg: RestoreMockConfig) {
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
        // The SELECT-by-id revision load. INSERT never calls maybeSingle.
        return { data: cfg.revisionRow, error: null };
      }
      return { data: null, error: null };
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
    chain.in = () => Promise.resolve({ data: cfg.sectionFacts, error: null });
    chain.order = () => self();
    chain.limit = () => self();
    chain.maybeSingle = () => Promise.resolve(single());
    chain.single = () => Promise.resolve(single());
    // Awaitable for directly-awaited selects/deletes (draft clear/insert paths).
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data: [], error: null });

    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls };
}

const writeCalls = (calls: RecordedCall[]) =>
  calls.filter(
    (c) => c.method === "insert" || c.method === "update" || c.method === "delete",
  );
const findCall = (
  calls: RecordedCall[],
  table: string,
  method: RecordedCall["method"],
) => calls.find((c) => c.table === table && c.method === method);

const restoreParams = (
  over: Partial<{
    tenantId: string;
    expectedVersion: number;
    revisionId: string;
  }> = {},
) => ({
  tenantId: over.tenantId ?? TENANT,
  values: {
    tenantId: TENANT,
    locale: LOCALE,
    revisionId: over.revisionId ?? REV_ID,
    expectedVersion: over.expectedVersion ?? 5,
  },
  actorProfileId: null,
  // DI seam: no-op the auth + audit request-scope couplings. Production callers
  // pass neither, so the real capability guard is unchanged.
  __hooks: {
    requireCapability: async () => {},
    scheduleAudit: () => {},
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// TIER 1 — REAL restoreHomepageRevision via the __hooks DI seam (always runs)
// ═══════════════════════════════════════════════════════════════════════════

describe("restoreHomepageRevision — real function via __hooks seam", () => {
  test("happy path: prior snapshot written back + version bumped + new rollback revision logged", async () => {
    const { supabase, calls } = makeRestoreSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, title: "Restored Home" }),
      revisionRow: restoreRevisionRow(),
      sectionFacts: [sectionFacts("published")],
    });

    const res = await restoreHomepageRevision(supabase, restoreParams());
    assert.ok(res.ok, "restore returns a success result (no request-scope throw)");
    assert.equal(res.data.id, PAGE_ID);
    assert.equal(res.data.version, 6, "restore CAS-advances the page version");

    // --- cms_pages UPDATE: prior page fields written back + version CAS ---
    const upd = findCall(calls, "cms_pages", "update");
    assert.ok(upd, "cms_pages UPDATE ran");
    const payload = upd!.payload as Record<string, unknown>;
    assert.equal(payload.title, "Restored Home", "prior title restored from the snapshot");
    assert.equal(
      payload.meta_description,
      "Restored meta",
      "prior meta_description restored from the snapshot",
    );
    assert.equal(payload.version, 6, "version CAS-advanced to beforeVersion+1");
    assert.ok(
      upd!.eqs.some(([c, v]) => c === "version" && v === 5),
      "UPDATE guarded by the expected prior version (optimistic CAS)",
    );
    assert.ok(
      upd!.eqs.some(([c, v]) => c === "id" && v === PAGE_ID),
      "UPDATE scoped to the homepage row id",
    );

    // --- draft rows replaced: DELETE is_draft=TRUE, then INSERT the kept slot ---
    const draftDelete = calls.find(
      (c) =>
        c.table === "cms_page_sections" &&
        c.method === "delete" &&
        c.eqs.some(([col, val]) => col === "is_draft" && val === true),
    );
    assert.ok(draftDelete, "old is_draft=TRUE rows cleared before the rollback write");
    const draftInsert = findCall(calls, "cms_page_sections", "insert");
    assert.ok(draftInsert, "rolled-back draft rows inserted");
    const draftRows = draftInsert!.payload as Array<Record<string, unknown>>;
    assert.equal(draftRows.length, 1, "the kept hero-slot section is restored");
    assert.equal(draftRows[0].section_id, SECTION_ID);
    assert.equal(draftRows[0].is_draft, true, "restored rows are is_draft=TRUE (draft only)");

    // --- a NEW rollback revision is appended at the new version ---
    const revIns = findCall(calls, "cms_page_revisions", "insert");
    assert.ok(revIns, "cms_page_revisions INSERT ran");
    const rev = revIns!.payload as Record<string, unknown>;
    assert.equal(rev.kind, "rollback", "restore appends a kind=rollback revision");
    assert.equal(rev.version, 6, "new revision stamped at the restored version");
    assert.equal(rev.page_id, PAGE_ID);
    assert.ok(rev.snapshot, "new revision carries a rehydratable snapshot");
  });

  test("nonexistent revision id -> clean NOT_FOUND, no page write", async () => {
    const { supabase, calls } = makeRestoreSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      revisionRow: null, // bad / nonexistent revision id
      sectionFacts: [],
    });

    const res = await restoreHomepageRevision(
      supabase,
      restoreParams({ revisionId: "55555555-5555-4555-8555-555555555555" }),
    );
    assert.ok(!res.ok, "returns a failure result (no throw)");
    assert.equal((res as { code?: string }).code, "NOT_FOUND", "missing revision -> NOT_FOUND");
    // The page row is read, but no mutation happens once the revision misses.
    assert.equal(
      writeCalls(calls).length,
      0,
      "a missing-revision restore performs no INSERT/UPDATE/DELETE",
    );
  });

  test("stale expectedVersion -> clean VERSION_CONFLICT, ZERO writes", async () => {
    const { supabase, calls } = makeRestoreSupabase({
      pageRow: pageRow({ version: 5 }),
      afterRow: pageRow({ version: 6 }),
      revisionRow: restoreRevisionRow(),
      sectionFacts: [sectionFacts("published")],
    });

    const res = await restoreHomepageRevision(
      supabase,
      restoreParams({ expectedVersion: 4 }),
    );
    assert.ok(!res.ok, "returns a failure result");
    assert.equal(
      (res as { code?: string }).code,
      "VERSION_CONFLICT",
      "stale CAS rejected with VERSION_CONFLICT",
    );
    assert.equal(
      writeCalls(calls).length,
      0,
      "a rejected restore performs no INSERT/UPDATE/DELETE",
    );
  });
});
