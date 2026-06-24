/**
 * copy-published-to-draft.test.ts — regression for `copyPublishedToDraft`
 * (the "Copy from live" homepage draft-reset op in ./homepage.ts).
 *
 * Contract under test (DRAFT-ONLY; mirrors restoreHomepageRevision but sources
 * its composition from `cms_pages.published_homepage_snapshot` — the frozen
 * publish snapshot — instead of a `cms_page_revisions.snapshot` row):
 *   1. FREEFORM: a builderTree-only snapshot (slots:[] + builderTree:[...]) resets
 *      the draft, and the inserted draft revision carries that EXACT builderTree.
 *   2. CURATED: slots populated → fresh is_draft=TRUE cms_page_sections rows are
 *      inserted from the slots, DROPPING any referenced section that is missing
 *      or status==='archived'.
 *   3. NULL/EMPTY snapshot → clean PUBLISH_NOT_READY failure, NO insert/update/
 *      delete on cms_pages / cms_page_sections / cms_page_revisions.
 *   4. NO SIDE EFFECTS on success: no update sets status/published_at, no write
 *      touches published_homepage_snapshot, and the public cache is never busted.
 *
 * Mocking strategy (Node 20 + tsx `--test`):
 *   - `requirePhase5Capability` is supplied as a GRANTED stub through the op's
 *     `__hooks` injection seam (a default-bound param; production never passes
 *     it). `scheduleAuditEvent` is likewise a no-op stub so the test never hits
 *     `after()`'s request-scope requirement. This avoids `mock.module`, which
 *     is unusable here: under tsx, registering ANY module mock corrupts the
 *     named-export bindings of every subsequently dynamic-imported module.
 *   - Supabase: a table-/method-aware chainable mock that RECORDS every call so
 *     assertions run against the op's real query chain + payloads.
 *   - revalidateTag: the op has NO call to it on any path reached here (the only
 *     site, bustHomepageTags, lives in publishHomepage). "Never busts cache" is
 *     asserted two ways: (a) the draft UPDATE payload sets neither status nor
 *     published_at (the publish gate that precedes any bust), and (b) a
 *     source-level invariant that the copyPublishedToDraft body contains no
 *     revalidateTag / bustHomepageTags call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { copyPublishedToDraft } from "./homepage";

// ---------------------------------------------------------------------------
// Granted-capability + no-op-audit hooks injected into every successful run.
// ---------------------------------------------------------------------------

let scheduledAuditCount = 0;
const hooks = {
  // capability GRANTED — resolves without touching auth/cookies.
  requireCapability: async () => {},
  // audit no-op — never schedules `after()`, so no request scope is needed.
  scheduleAudit: () => {
    scheduledAuditCount += 1;
  },
} as const;

// ---------------------------------------------------------------------------
// Supabase mock — chainable + call-recording, table/method aware.
// ---------------------------------------------------------------------------

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update" | "delete";
  payload?: unknown; // insert / update payload
  eqs: Array<[string, unknown]>;
  ins: Array<[string, readonly unknown[]]>;
}

interface TablePlan {
  /** Terminal result for a SELECT chain (.maybeSingle / .in / .limit). */
  selectResult?: { data: unknown; error: unknown };
  /** Terminal result for an UPDATE chain (.maybeSingle). */
  updateResult?: { data: unknown; error: unknown };
}

function makeSupabase(plans: Record<string, TablePlan>) {
  const calls: RecordedCall[] = [];

  function from(table: string) {
    const plan = plans[table] ?? {};
    const rec: RecordedCall = { table, method: "select", eqs: [], ins: [] };
    calls.push(rec);

    const chain: Record<string, unknown> = {};
    const self = () => chain;

    chain.select = () => self();
    chain.insert = (payload: unknown) => {
      rec.method = "insert";
      rec.payload = payload;
      // insert(...) is awaited directly in the op.
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
    chain.in = (col: string, vals: readonly unknown[]) => {
      rec.ins.push([col, vals]);
      // loadSectionFactsBulk terminates + awaits on .in().
      return Promise.resolve(plan.selectResult ?? { data: [], error: null });
    };
    chain.order = () => self();
    chain.limit = () =>
      Promise.resolve(plan.selectResult ?? { data: null, error: null });
    chain.maybeSingle = () =>
      Promise.resolve(
        rec.method === "update"
          ? plan.updateResult ?? { data: null, error: null }
          : plan.selectResult ?? { data: null, error: null },
      );
    chain.single = () => (chain.maybeSingle as () => unknown)();
    // The draft-rows DELETE is `delete().eq().eq().eq()` awaited directly; make
    // the chain itself a thenable that resolves to no error.
    chain.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data: null, error: null });

    return chain;
  }

  return { supabase: { from } as unknown as SupabaseClient, calls };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT = "tenant-1";
const PAGE_ID = "page-1";
const LOCALE = "en" as const;

/** Valid builder tree (passes validateBuilderNodeTree, so it is carried through
 *  verbatim rather than rebuilt from legacy slots). The section node's
 *  `props.sectionId` MUST be a real UUID or validation fails and the resolver
 *  falls back to an empty legacy-slot tree. */
const FREEFORM_SECTION_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const freeformTree = [
  {
    id: "section-1",
    kind: "section",
    props: { sectionId: FREEFORM_SECTION_UUID, sectionTypeKey: "hero" },
    children: [
      { id: "heading-1", kind: "heading", props: { text: "Headline", level: 2 } },
    ],
  },
];

function pageRow(snapshot: unknown) {
  return {
    id: PAGE_ID,
    tenant_id: TENANT,
    locale: LOCALE,
    slug: "",
    template_key: "homepage",
    system_template_key: "homepage",
    is_system_owned: true,
    template_schema_version: 1,
    title: "Live Homepage",
    status: "published",
    body: "",
    hero: { introTagline: "live tagline" },
    meta_title: null,
    meta_description: "live meta",
    og_title: null,
    og_description: null,
    og_image_url: null,
    og_image_media_asset_id: null,
    noindex: false,
    include_in_sitemap: true,
    canonical_url: null,
    published_at: "2026-06-01T00:00:00.000Z",
    published_homepage_snapshot: snapshot,
    version: 7,
    created_by: null,
    updated_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

/** The post-update row the op selects back after the CAS-bump. */
const updatedPageRow = () => ({ ...pageRow(null), version: 8 });

function snapshotSection(
  sectionId: string,
  slotKey: string,
  sortOrder: number,
): Record<string, unknown> {
  return {
    slotKey,
    sortOrder,
    sectionId,
    sectionTypeKey: "hero",
    schemaVersion: 1,
    name: `Section ${sectionId}`,
    props: { headline: sectionId },
  };
}

function sectionFacts(
  id: string,
  status: "draft" | "published" | "archived",
): Record<string, unknown> {
  return {
    id,
    tenant_id: TENANT,
    section_type_key: "hero",
    name: `Section ${id}`,
    status,
    schema_version: 1,
    props_jsonb: { headline: id },
    version: 1,
  };
}

const params = (
  hooksArg?: typeof hooks,
): Parameters<typeof copyPublishedToDraft>[1] => ({
  tenantId: TENANT,
  locale: LOCALE,
  actorProfileId: "actor-1",
  __hooks: hooksArg ?? hooks,
});

// helpers over recorded calls
const callsTo = (calls: RecordedCall[], table: string) =>
  calls.filter((c) => c.table === table);
const writesTo = (calls: RecordedCall[], table: string) =>
  calls.filter(
    (c) =>
      c.table === table &&
      (c.method === "insert" || c.method === "update" || c.method === "delete"),
  );

// ---------------------------------------------------------------------------
// 1. FREEFORM
// ---------------------------------------------------------------------------

test("FREEFORM: builderTree-only snapshot resets draft; inserted revision carries the exact builderTree", async () => {
  const snapshot = {
    version: 1,
    publishedAt: "2026-06-01T00:00:00.000Z",
    pageVersion: 7,
    locale: LOCALE,
    fields: {
      title: "Live Homepage",
      metaDescription: "live meta",
      introTagline: "live tagline",
    },
    templateSchemaVersion: 1,
    slots: [],
    builderTree: freeformTree,
  };
  const { supabase, calls } = makeSupabase({
    cms_pages: {
      selectResult: { data: pageRow(snapshot), error: null },
      updateResult: { data: updatedPageRow(), error: null },
    },
  });

  const res = await copyPublishedToDraft(supabase, params());
  assert.equal(res.ok, true, "freeform copy should succeed");

  // Exactly one cms_page_revisions insert (kind='rollback') whose
  // snapshot.builderTree is the exact freeform tree (no legacy-slot rebuild).
  const revInserts = callsTo(calls, "cms_page_revisions").filter(
    (c) => c.method === "insert",
  );
  assert.equal(revInserts.length, 1, "exactly one revision insert");
  const revPayload = revInserts[0].payload as {
    kind: string;
    snapshot: { builderTree?: unknown };
  };
  assert.equal(revPayload.kind, "rollback", "draft revision, not published");
  assert.deepEqual(
    revPayload.snapshot.builderTree,
    freeformTree,
    "inserted draft revision carries the exact published builderTree",
  );

  // Zero curated slots → no section rows inserted.
  const sectionInserts = callsTo(calls, "cms_page_sections").filter(
    (c) => c.method === "insert",
  );
  assert.equal(sectionInserts.length, 0, "no section rows for a freeform reset");
});

// ---------------------------------------------------------------------------
// 2. CURATED — drops missing / archived sections
// ---------------------------------------------------------------------------

test("CURATED: slots populated -> fresh is_draft=TRUE section rows; missing/archived sections are DROPPED", async () => {
  // 3 referenced sections: keep (published), archived (drop), missing (drop).
  const snapshot = {
    version: 1,
    publishedAt: "2026-06-01T00:00:00.000Z",
    pageVersion: 7,
    locale: LOCALE,
    fields: {
      title: "Live Homepage",
      metaDescription: "live meta",
      introTagline: "live tagline",
    },
    templateSchemaVersion: 1,
    slots: [
      snapshotSection("sec-keep", "hero", 0),
      snapshotSection("sec-archived", "body", 0),
      snapshotSection("sec-missing", "body", 1),
    ],
  };
  const { supabase, calls } = makeSupabase({
    cms_pages: {
      selectResult: { data: pageRow(snapshot), error: null },
      updateResult: { data: updatedPageRow(), error: null },
    },
    // loadSectionFactsBulk: sec-keep published, sec-archived archived,
    // sec-missing absent (never returned → dropped as missing).
    cms_sections: {
      selectResult: {
        data: [
          sectionFacts("sec-keep", "published"),
          sectionFacts("sec-archived", "archived"),
        ],
        error: null,
      },
    },
  });

  const res = await copyPublishedToDraft(supabase, params());
  assert.equal(res.ok, true, "curated copy should succeed");

  // Fresh is_draft=TRUE section rows inserted, containing ONLY the kept section.
  const sectionInserts = callsTo(calls, "cms_page_sections").filter(
    (c) => c.method === "insert",
  );
  assert.equal(sectionInserts.length, 1, "exactly one section-rows insert");
  const insertedRows = sectionInserts[0].payload as Array<{
    section_id: string;
    is_draft: boolean;
    slot_key: string;
    sort_order: number;
  }>;
  assert.deepEqual(
    insertedRows.map((r) => r.section_id),
    ["sec-keep"],
    "only the kept (published, present) section is inserted; archived + missing dropped",
  );
  assert.ok(
    insertedRows.every((r) => r.is_draft === true),
    "inserted section rows are is_draft=TRUE",
  );
  assert.equal(insertedRows[0].slot_key, "hero");
  assert.equal(insertedRows[0].sort_order, 0);

  // The op DELETEs the existing is_draft=TRUE rows before inserting.
  const sectionDeletes = callsTo(calls, "cms_page_sections").filter(
    (c) => c.method === "delete",
  );
  assert.equal(sectionDeletes.length, 1, "one draft-rows delete");
  assert.ok(
    sectionDeletes[0].eqs.some(([c, v]) => c === "is_draft" && v === true),
    "delete is scoped to is_draft=TRUE rows",
  );

  // The dropped sections are reflected in the revision composition too.
  const revInsert = callsTo(calls, "cms_page_revisions").find(
    (c) => c.method === "insert",
  );
  const revComposition = (
    revInsert!.payload as {
      snapshot: { composition: Array<{ sectionId: string }> };
    }
  ).snapshot.composition;
  assert.deepEqual(
    revComposition.map((e) => e.sectionId),
    ["sec-keep"],
    "revision composition also drops missing/archived sections",
  );
});

// ---------------------------------------------------------------------------
// 3. NULL / EMPTY snapshot — PUBLISH_NOT_READY, no writes
// ---------------------------------------------------------------------------

for (const [label, snapshot] of [
  ["null", null],
  ["empty", { slots: [], builderTree: [] }],
] as const) {
  test(`NULL/EMPTY (${label}): returns PUBLISH_NOT_READY and performs NO insert/update/delete`, async () => {
    const { supabase, calls } = makeSupabase({
      cms_pages: {
        selectResult: { data: pageRow(snapshot), error: null },
        updateResult: { data: updatedPageRow(), error: null },
      },
    });

    const res = await copyPublishedToDraft(supabase, params());

    assert.equal(res.ok, false, "should fail cleanly");
    assert.equal(
      (res as { code?: string }).code,
      "PUBLISH_NOT_READY",
      "fails with PUBLISH_NOT_READY (nothing published to copy)",
    );

    // No mutation of any table.
    assert.equal(writesTo(calls, "cms_pages").length, 0, "no cms_pages write");
    assert.equal(
      writesTo(calls, "cms_page_sections").length,
      0,
      "no cms_page_sections write",
    );
    assert.equal(
      writesTo(calls, "cms_page_revisions").length,
      0,
      "no cms_page_revisions write",
    );
    // The only DB touch is the initial cms_pages SELECT.
    assert.equal(
      callsTo(calls, "cms_pages").filter((c) => c.method === "select").length,
      1,
      "only the initial homepage SELECT ran",
    );
  });
}

// ---------------------------------------------------------------------------
// 4. NO SIDE EFFECTS on a successful run
// ---------------------------------------------------------------------------

test("NO SIDE EFFECTS: success never sets status/published_at, never writes published_homepage_snapshot, never busts cache", async () => {
  scheduledAuditCount = 0;
  const snapshot = {
    version: 1,
    publishedAt: "2026-06-01T00:00:00.000Z",
    pageVersion: 7,
    locale: LOCALE,
    fields: {
      title: "Live Homepage",
      metaDescription: "live meta",
      introTagline: "live tagline",
    },
    templateSchemaVersion: 1,
    slots: [snapshotSection("sec-keep", "hero", 0)],
    builderTree: freeformTree,
  };
  const { supabase, calls } = makeSupabase({
    cms_pages: {
      selectResult: { data: pageRow(snapshot), error: null },
      updateResult: { data: updatedPageRow(), error: null },
    },
    cms_sections: {
      selectResult: { data: [sectionFacts("sec-keep", "published")], error: null },
    },
  });

  const res = await copyPublishedToDraft(supabase, params());
  assert.equal(res.ok, true, "copy should succeed");

  // The cms_pages UPDATE payload is the DRAFT-ONLY field set: it must NOT carry
  // status, published_at, or published_homepage_snapshot.
  const pageUpdates = callsTo(calls, "cms_pages").filter(
    (c) => c.method === "update",
  );
  assert.equal(
    pageUpdates.length,
    1,
    "exactly one cms_pages update (the draft copy)",
  );
  const updatePayload = pageUpdates[0].payload as Record<string, unknown>;
  assert.ok(!("status" in updatePayload), "draft copy must NOT set status");
  assert.ok(
    !("published_at" in updatePayload),
    "draft copy must NOT set published_at",
  );
  assert.ok(
    !("published_homepage_snapshot" in updatePayload),
    "draft copy must NOT write published_homepage_snapshot",
  );
  // It DOES copy the draft page fields + CAS-bump version.
  assert.equal(updatePayload.version, 8, "version is CAS-bumped");
  assert.ok(
    "title" in updatePayload && "hero" in updatePayload,
    "draft fields copied",
  );

  // No write anywhere carries published_homepage_snapshot.
  const objectWrites = calls.filter(
    (c) => c.method === "insert" || c.method === "update",
  );
  for (const w of objectWrites) {
    const p = w.payload as Record<string, unknown> | undefined;
    if (p && typeof p === "object" && !Array.isArray(p)) {
      assert.ok(
        !("published_homepage_snapshot" in p),
        `no write touches published_homepage_snapshot (table=${w.table})`,
      );
    }
  }

  // The inserted revision is a DRAFT (kind='rollback'), never 'published'.
  const revInsert = callsTo(calls, "cms_page_revisions").find(
    (c) => c.method === "insert",
  );
  assert.equal(
    (revInsert!.payload as { kind: string }).kind,
    "rollback",
    "revision kind is rollback (draft), not published",
  );

  // Audit IS scheduled exactly once (the op emits a compose audit event), but
  // through the injected no-op so no `after()` request scope is required.
  assert.equal(scheduledAuditCount, 1, "exactly one audit event scheduled");
});

// ---------------------------------------------------------------------------
// 4b. Source-level invariant — the op body has NO cache bust.
// ---------------------------------------------------------------------------
// revalidateTag / bustHomepageTags appear in homepage.ts only inside
// publishHomepage. This pins that copyPublishedToDraft never gains one, which a
// behavioral mock cannot guarantee for a code path that is simply never taken.

test("INVARIANT: copyPublishedToDraft body contains no revalidateTag / bustHomepageTags call", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./homepage.ts", import.meta.url)),
    "utf8",
  );
  const start = src.indexOf("export async function copyPublishedToDraft");
  assert.ok(start > 0, "found copyPublishedToDraft in homepage.ts");
  // Slice to the end of file — copyPublishedToDraft is the last export.
  const body = src.slice(start);
  assert.ok(
    !/\brevalidateTag\s*\(/.test(body),
    "copyPublishedToDraft must not call revalidateTag",
  );
  assert.ok(
    !/\bbustHomepageTags\s*\(/.test(body),
    "copyPublishedToDraft must not call bustHomepageTags",
  );
  // Sanity: the bust helper DOES exist earlier in the file (so the regex above
  // is meaningfully scoped, not just matching a renamed/absent symbol).
  assert.ok(
    src.includes("function bustHomepageTags"),
    "bustHomepageTags helper still exists earlier in homepage.ts",
  );
});
