/**
 * WAVE 1.1 — cms-page RESTORE actually restores CONTENT.
 *
 * Before this lane, `restorePageRevision` rewrote the page-field columns only.
 * It had ZERO references to `builderTree` or `cms_page_sections`, so restoring a
 * revision on an ordinary cms page:
 *   - left the sections + freeform tree exactly as they were (ineffective), AND
 *   - bumped `cms_pages.version` while writing a rollback revision that carried
 *     no tree, so the editor's version-matched read found nothing on the next
 *     load and the freeform tree was dropped entirely (destructive).
 *
 * These tests drive the REAL `restorePageRevision` over a recording Supabase
 * mock via the `__hooks` DI seam, in the same Tier-1 style as
 * `homepage-restore-integration.test.ts` (real function, no env, no DB).
 *
 * Run:
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --test src/lib/site-admin/server/page-restore-integration.test.ts
 *   (Glob-covered by `test:builder` via src/lib/site-admin/server/*.test.ts.)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createBuilderNode } from "../builder-node/create";
import type { BuilderNode } from "../builder-node/types";
import { restorePageRevision } from "./pages";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const SECTION_ID = "33333333-3333-4333-8333-333333333333";
const REV_ID = "44444444-4444-4444-8444-444444444444";

/** A canonically-valid FREEFORM tree (root container + two headings). */
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
    locale: "en",
    slug: "about",
    template_key: "standard_page",
    system_template_key: null,
    is_system_owned: false,
    template_schema_version: 1,
    title: "About",
    status: "published",
    body: "",
    hero: {},
    meta_title: null,
    meta_description: "Current meta",
    og_title: null,
    og_description: null,
    og_image_url: null,
    og_image_media_asset_id: null,
    noindex: false,
    include_in_sitemap: true,
    canonical_url: null,
    published_at: null,
    version: 5,
    created_by: null,
    updated_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

/** A revision written by the page EDITOR: page fields + composition + tree. */
function contentRevisionRow(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: REV_ID,
    tenant_id: TENANT,
    page_id: PAGE_ID,
    kind: "draft",
    version: 3,
    template_schema_version: 1,
    snapshot: {
      title: "Restored About",
      meta_description: "Restored meta",
      composition: [
        {
          slotKey: "body",
          sortOrder: 0,
          sectionId: SECTION_ID,
          sectionTypeKey: "rich_text",
          name: "Story",
          props: {},
        },
      ],
      builderTree: freeformTree(),
      styleClasses: { c1: { id: "c1", name: "Lead", style: { color: "red" } } },
    },
    created_by: null,
    created_at: "2026-05-15T00:00:00.000Z",
    ...over,
  };
}

/** A revision written by the page-METADATA CRUD path: no content keys at all. */
function metadataOnlyRevisionRow(): Record<string, unknown> {
  return {
    id: REV_ID,
    tenant_id: TENANT,
    page_id: PAGE_ID,
    kind: "draft",
    version: 2,
    template_schema_version: 1,
    snapshot: {
      title: "Older title",
      meta_description: "Older meta",
      noindex: true,
    },
    created_by: null,
    created_at: "2026-05-10T00:00:00.000Z",
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
  afterRow: Record<string, unknown> | null;
  /** Revision returned by the SELECT-by-id lookup. */
  revisionRow: Record<string, unknown> | null;
  /** Snapshot returned by the version-matched revision read (.eq("version")). */
  versionMatchedSnapshot?: unknown;
  /** Rows returned for the cms_sections `.in()` existence check. */
  sectionRows?: Array<Record<string, unknown>>;
  /** Rows returned by any awaited cms_page_sections SELECT. */
  draftSectionRows?: Array<Record<string, unknown>>;
  /** Rows returned by the recovery scan (`cms_page_revisions` ordered select). */
  recoveryRevisions?: Array<{ snapshot: unknown }>;
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
        // Two distinct maybeSingle reads: by revision id, and version-matched.
        const byVersion = rec.eqs.some(([c]) => c === "version");
        if (byVersion) {
          return {
            data:
              cfg.versionMatchedSnapshot === undefined
                ? null
                : { snapshot: cfg.versionMatchedSnapshot },
            error: null,
          };
        }
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
    chain.in = () => Promise.resolve({ data: cfg.sectionRows ?? [], error: null });
    chain.order = () => self();
    chain.limit = () =>
      // The recovery scan awaits `.limit(25)` directly (no maybeSingle).
      table === "cms_page_revisions"
        ? {
            ...chain,
            then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
              resolve({ data: cfg.recoveryRevisions ?? [], error: null }),
          }
        : self();
    chain.maybeSingle = () => Promise.resolve(single());
    chain.single = () => Promise.resolve(single());
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({
        data: table === "cms_page_sections" ? (cfg.draftSectionRows ?? []) : [],
        error: null,
      });

    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls };
}

const findCall = (
  calls: RecordedCall[],
  table: string,
  method: RecordedCall["method"],
) => calls.find((c) => c.table === table && c.method === method);

const restoreParams = (over: Partial<{ expectedVersion: number }> = {}) => ({
  tenantId: TENANT,
  values: {
    tenantId: TENANT,
    pageId: PAGE_ID,
    revisionId: REV_ID,
    expectedVersion: over.expectedVersion ?? 5,
  } as never,
  actorProfileId: null,
  __hooks: {
    requireCapability: async () => {},
    scheduleAudit: () => {},
  },
});

function nodeCount(tree: unknown): number {
  if (!Array.isArray(tree)) return 0;
  let n = 0;
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.pop() as { children?: unknown[] } | undefined;
    if (!node || typeof node !== "object") continue;
    n += 1;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return n;
}

describe("restorePageRevision — content restore (WAVE 1.1)", () => {
  test("restores the revision's sections AND builderTree, not just page fields", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, title: "Restored About" }),
      revisionRow: contentRevisionRow(),
      sectionRows: [{ id: SECTION_ID, name: "Story", status: "published" }],
    });

    const res = await restorePageRevision(supabase, restoreParams());
    assert.ok(res.ok, "restore succeeds");
    assert.equal(res.data.version, 6);

    // Draft slot rows are REPLACED with the restored composition.
    const del = calls.find(
      (c) =>
        c.table === "cms_page_sections" &&
        c.method === "delete" &&
        c.eqs.some(([col, val]) => col === "is_draft" && val === true),
    );
    assert.ok(del, "old is_draft=TRUE rows cleared (was: never touched)");
    const ins = findCall(calls, "cms_page_sections", "insert");
    assert.ok(ins, "restored draft rows inserted (was: never touched)");
    const rows = ins!.payload as Array<Record<string, unknown>>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].section_id, SECTION_ID);
    assert.equal(rows[0].is_draft, true);

    // The rollback revision at the NEW version carries the tree, so the
    // editor's version-matched read on the next load is not empty.
    const revIns = findCall(calls, "cms_page_revisions", "insert");
    assert.ok(revIns, "rollback revision written");
    const rev = revIns!.payload as Record<string, unknown>;
    assert.equal(rev.version, 6, "stamped at the restored version");
    const snap = rev.snapshot as Record<string, unknown>;
    assert.ok(
      nodeCount(snap.builderTree) > 1,
      "rollback revision carries a non-empty builderTree (was: absent)",
    );
    assert.equal(
      (snap.composition as unknown[]).length,
      1,
      "rollback revision carries the composition (was: absent)",
    );
    assert.ok(snap.styleClasses, "linked style classes carried through");
  });

  test("archived sections are dropped from the restored composition", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      revisionRow: contentRevisionRow(),
      sectionRows: [{ id: SECTION_ID, name: "Story", status: "archived" }],
    });

    const res = await restorePageRevision(supabase, restoreParams());
    assert.ok(res.ok);
    const ins = findCall(calls, "cms_page_sections", "insert");
    assert.equal(ins, undefined, "no draft rows inserted for an archived-only restore");
    const rev = findCall(calls, "cms_page_revisions", "insert")!
      .payload as Record<string, unknown>;
    assert.equal(
      ((rev.snapshot as Record<string, unknown>).composition as unknown[]).length,
      0,
    );
  });

  test("metadata-only revision does NOT wipe content, and carries the current tree forward", async () => {
    const currentTree = freeformTree();
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6, title: "Older title" }),
      revisionRow: metadataOnlyRevisionRow(),
      versionMatchedSnapshot: { builderTree: currentTree },
    });

    const res = await restorePageRevision(supabase, restoreParams());
    assert.ok(res.ok);

    const del = calls.find(
      (c) => c.table === "cms_page_sections" && c.method === "delete",
    );
    assert.equal(del, undefined, "sections untouched when the revision has no content");

    const rev = findCall(calls, "cms_page_revisions", "insert")!
      .payload as Record<string, unknown>;
    const snap = rev.snapshot as Record<string, unknown>;
    assert.ok(
      nodeCount(snap.builderTree) > 1,
      "current tree carried into the new-version revision (no empty-canvas reload)",
    );
  });

  test("empty version-matched tree is recovered from a recent non-empty revision (#310 guard)", async () => {
    const good = freeformTree();
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow(),
      afterRow: pageRow({ version: 6 }),
      revisionRow: metadataOnlyRevisionRow(),
      // Pointer drifted onto a lone EMPTY root container.
      versionMatchedSnapshot: { builderTree: [createBuilderNode("container")] },
      recoveryRevisions: [
        { snapshot: { builderTree: [createBuilderNode("container")] } },
        { snapshot: { builderTree: good } },
      ],
    });

    const res = await restorePageRevision(supabase, restoreParams());
    assert.ok(res.ok);
    const rev = findCall(calls, "cms_page_revisions", "insert")!
      .payload as Record<string, unknown>;
    const snap = rev.snapshot as Record<string, unknown>;
    assert.ok(
      nodeCount(snap.builderTree) > 1,
      "recovered a non-empty tree instead of freezing the empty one",
    );
  });

  test("stale expectedVersion -> VERSION_CONFLICT with zero writes", async () => {
    const { supabase, calls } = makeSupabase({
      pageRow: pageRow({ version: 5 }),
      afterRow: pageRow({ version: 6 }),
      revisionRow: contentRevisionRow(),
    });

    const res = await restorePageRevision(
      supabase,
      restoreParams({ expectedVersion: 4 }),
    );
    assert.ok(!res.ok);
    assert.equal((res as { code?: string }).code, "VERSION_CONFLICT");
    assert.equal(
      calls.filter(
        (c) =>
          c.method === "insert" || c.method === "update" || c.method === "delete",
      ).length,
      0,
      "a rejected restore performs no INSERT/UPDATE/DELETE",
    );
  });
});
