/**
 * shell-freeform-without-slots.test.ts — the site shell must work with ZERO
 * legacy `cms_page_sections` slot rows.
 *
 * THE BUG SHAPE
 * -------------
 * The shell can be composed two ways: legacy slot rows, or a freeform
 * `builderTree` in `cms_pages.blocks`. Two live guards assumed slots were the
 * only way, so a purely-freeform shell read as "empty":
 *
 *   1. `loadPublishedShell` (server/shell-reads.ts) returned null on
 *      `snapshot.slots.length === 0`. Null means "fall through to the hard-coded
 *      LEGACY PublicHeader" — so a CORRECT freeform shell rendered the WRONG
 *      header, or none at all.
 *
 *   2. `republishSiteShellSnapshot` (edit-mode/site-shell-publish.ts) bailed on
 *      `draftRows.length === 0` with `{ ok: true, applied: false, reason:
 *      "shell_has_no_sections" }`. Every one of its four callers branches on
 *      `ok` alone, so the operator got a SUCCESS toast while nothing was
 *      published. That is a silent-failure bug in its own right.
 *
 * `scripts/impronta-rebuild/shell/seed-shell.ts` documents the incident these
 * guards caused: "cleaning up" the anchor slot rows left the live site with no
 * header at all. The anchors were a workaround for these two guards, not a
 * requirement of the renderer — `classifyShellTree`/`resolveShellSidePlan`
 * already treat `slots: []` + a tree as `mode: "freeform"`.
 *
 * WHAT THIS FILE ASSERTS
 * ----------------------
 *   A. FREEFORM-ONLY READS  — a snapshot with zero slots and a real tree is
 *      renderable (was: null → legacy header).
 *   B. FREEFORM-ONLY PUBLISHES — `republishSiteShellSnapshot` bakes and applies
 *      it (was: applied:false, reason "shell_has_no_sections").
 *   C. GENUINELY EMPTY FAILS HONESTLY — a shell row with neither slots nor
 *      blocks now returns `ok: false` instead of lying with `ok: true`.
 *   D. TODAY'S IMPRONTA SHAPE IS UNCHANGED — slots AND a tree keeps every
 *      pre-existing behaviour byte-for-byte, on both the read and write paths.
 *      Impronta (en + es) is the only tenant with a `site_shell` row at all,
 *      and both rows have 2 slots and a 2-root tree, so D is the whole live
 *      blast radius.
 *
 * Tests A/B/C fail on the pre-fix code; D passes before and after.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  hasFreeformShellTree,
  republishSiteShellSnapshot,
} from "@/lib/site-admin/edit-mode/site-shell-publish";
import type { HomepageSnapshot } from "./homepage";
import { projectPublishedShellRow, shellSnapshotHasContent } from "./shell-reads";

const TENANT = "00000000-0000-0000-0000-000000000001";
const PAGE_ID = "page-shell-1";
const SECTION_ID = "sec-header-1";

/** A shell authored entirely on the freeform surface — no slot row addresses it. */
const FREEFORM_TREE = [
  {
    id: "shell-header",
    kind: "section",
    props: {
      sectionId: SECTION_ID,
      sectionTypeKey: "site_header",
      slotKey: "header",
      sortOrder: 0,
    },
    children: [
      { id: "operator-node", kind: "text", props: { text: "Book a model" } },
    ],
  },
];

function snapshotWith(
  over: Partial<HomepageSnapshot>,
): Pick<HomepageSnapshot, "slots" | "builderTree"> {
  return {
    slots: [],
    builderTree: null,
    ...over,
  } as Pick<HomepageSnapshot, "slots" | "builderTree">;
}

const LEGACY_SLOT = {
  slotKey: "header",
  sortOrder: 0,
  sectionId: SECTION_ID,
  sectionTypeKey: "site_header",
  schemaVersion: 1,
  name: "Header",
  props: {},
} as unknown as HomepageSnapshot["slots"][number];

// ── A. the READ guard ───────────────────────────────────────────────────────

test("[A] a published snapshot with ZERO slots and a freeform tree is renderable", () => {
  assert.equal(
    shellSnapshotHasContent(
      snapshotWith({ slots: [], builderTree: FREEFORM_TREE as never }),
    ),
    true,
    "a slots-free shell whose content lives entirely in `builderTree` read as " +
      "EMPTY, so `loadPublishedShell` returned null and the public reader fell " +
      "back to the hard-coded LEGACY header — the wrong header on a live site",
  );

  const projected = projectPublishedShellRow({
    id: PAGE_ID,
    locale: "en",
    status: "published",
    published_at: "2026-09-01T00:00:00.000Z",
    published_page_snapshot: snapshotWith({
      slots: [],
      builderTree: FREEFORM_TREE as never,
    }) as HomepageSnapshot,
  });
  assert.ok(projected, "the freeform-only shell must project to a PublishedShell");
  assert.equal(projected.pageId, PAGE_ID);
  assert.deepEqual(
    projected.snapshot.builderTree,
    FREEFORM_TREE,
    "the freeform tree must survive the projection intact",
  );
});

test("[A] a snapshot with NEITHER slots NOR a tree is still not renderable", () => {
  for (const empty of [
    snapshotWith({}),
    snapshotWith({ builderTree: [] as never }),
    snapshotWith({ slots: [] }),
  ]) {
    assert.equal(
      shellSnapshotHasContent(empty),
      false,
      "an empty shell must still fall back to the legacy header",
    );
  }
  assert.equal(shellSnapshotHasContent(null), false);
  assert.equal(
    projectPublishedShellRow({
      id: PAGE_ID,
      locale: "en",
      status: "published",
      published_at: null,
      published_page_snapshot: null,
    }),
    null,
  );
});

// ── D(read). today's Impronta shape ─────────────────────────────────────────

test("[D] the CURRENT Impronta shape (slots AND a tree) reads exactly as before", () => {
  const snap = snapshotWith({
    slots: [LEGACY_SLOT],
    builderTree: FREEFORM_TREE as never,
  });
  assert.equal(shellSnapshotHasContent(snap), true);

  // An unpublished row is still null — the status gate is untouched.
  assert.equal(
    projectPublishedShellRow({
      id: PAGE_ID,
      locale: "en",
      status: "draft",
      published_at: null,
      published_page_snapshot: snap as HomepageSnapshot,
    }),
    null,
    "a draft shell row must never render publicly",
  );

  const projected = projectPublishedShellRow({
    id: PAGE_ID,
    locale: "es",
    status: "published",
    published_at: "2026-09-01T00:00:00.000Z",
    published_page_snapshot: snap as HomepageSnapshot,
  });
  assert.deepEqual(projected, {
    pageId: PAGE_ID,
    locale: "es",
    publishedAt: "2026-09-01T00:00:00.000Z",
    snapshot: snap,
  });
});

test("[D] the freeform shape test is the SAME one the publish path uses", () => {
  // Read and write must agree on what "this shell has freeform content" means.
  // If they drift, one path renders a tree the other refuses to bake.
  assert.equal(hasFreeformShellTree(FREEFORM_TREE), true);
  assert.equal(hasFreeformShellTree([]), false);
  assert.equal(hasFreeformShellTree(null), false);
  assert.equal(hasFreeformShellTree({}), false);
  assert.equal(
    shellSnapshotHasContent(snapshotWith({ builderTree: FREEFORM_TREE as never })),
    hasFreeformShellTree(FREEFORM_TREE),
  );
});

// ── B / C / D(write). the PUBLISH guard ─────────────────────────────────────

interface Captured {
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
  inserts: Array<{ table: string; payload: unknown }>;
}

/**
 * Minimal chainable PostgREST fake — same shape as the sibling
 * `edit-mode/site-shell-publish-freeform-survives.test.ts`, extended to record
 * inserts (the slots-free path must not attempt an empty INSERT).
 */
function makeFakeSupabase(
  captured: Captured,
  opts: { blocks: unknown; slotRows: unknown[] },
) {
  const rows: Record<string, unknown> = {
    "cms_pages:select": {
      id: PAGE_ID,
      title: "Site shell",
      meta_description: null,
      template_schema_version: 1,
      version: 3,
      blocks: opts.blocks,
    },
    "cms_page_sections:select": opts.slotRows,
    "cms_sections:select": [
      {
        id: SECTION_ID,
        section_type_key: "site_header",
        schema_version: 1,
        name: "Header",
        props_jsonb: { variant: "standard" },
        status: "published",
      },
    ],
  };

  function builder(table: string, verb: string, payload?: unknown) {
    const key = `${table}:${verb}`;
    const result =
      verb === "select"
        ? { data: rows[key] ?? null, error: null }
        : { data: null, error: null };
    if (verb === "update") {
      captured.updates.push({ table, payload: payload as Record<string, unknown> });
    }
    if (verb === "insert") {
      captured.inserts.push({ table, payload });
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      order: () => chain,
      returns: () => chain,
      maybeSingle: async () => ({
        data: Array.isArray(rows[key]) ? (rows[key] as unknown[])[0] : rows[key] ?? null,
        error: null,
      }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  }

  return {
    from: (table: string) => ({
      select: () => builder(table, "select"),
      update: (payload: unknown) => builder(table, "update", payload),
      delete: () => builder(table, "delete"),
      insert: (payload: unknown) => builder(table, "insert", payload),
    }),
  } as unknown as SupabaseClient;
}

test("[B] a shell with a freeform tree and ZERO slot rows PUBLISHES", async () => {
  const captured: Captured = { updates: [], inserts: [] };
  const supabase = makeFakeSupabase(captured, {
    blocks: FREEFORM_TREE,
    slotRows: [],
  });

  const res = await republishSiteShellSnapshot(supabase, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: "actor-1",
  });

  assert.equal(
    res.ok,
    true,
    "publishing a slots-free freeform shell must succeed",
  );
  assert.equal(
    "applied" in res && res.applied,
    true,
    'pre-fix this returned { ok: true, applied: false, reason: "shell_has_no_sections" } ' +
      "— publish silently no-opped while every caller showed the operator success",
  );

  const pageUpdate = captured.updates.find((u) => u.table === "cms_pages");
  assert.ok(pageUpdate, "the snapshot must actually be written");
  const snapshot = pageUpdate.payload.published_page_snapshot as {
    slots: unknown[];
    builderTree: unknown;
  };
  assert.deepEqual(snapshot.slots, [], "a slots-free shell bakes an empty slot list");
  assert.deepEqual(
    snapshot.builderTree,
    FREEFORM_TREE,
    "the freeform tree is what gets published",
  );
  assert.equal(
    pageUpdate.payload.status,
    "published",
    "the shell row must be flipped to published",
  );
  // A `.insert([])` is a wasted (and PostgREST-hostile) round trip.
  assert.equal(
    captured.inserts.length,
    0,
    "no live section rows to re-point — the empty INSERT must be skipped",
  );
});

test("[C] a shell with NO slots and NO blocks fails LOUDLY instead of lying", async () => {
  const captured: Captured = { updates: [], inserts: [] };
  const supabase = makeFakeSupabase(captured, { blocks: [], slotRows: [] });

  const res = await republishSiteShellSnapshot(supabase, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: "actor-1",
  });

  assert.equal(
    res.ok,
    false,
    "pre-fix this returned ok:true/applied:false. No caller inspects `applied`, " +
      "so the operator saw a success toast while the live shell was untouched. " +
      "An honest failure is the point of this assertion",
  );
  assert.match(
    "error" in res ? res.error : "",
    /no content to publish/i,
    "the error must tell the operator what is actually wrong",
  );
  assert.equal(
    captured.updates.length,
    0,
    "nothing must be written when there is nothing to publish",
  );
});

test("[D] the CURRENT Impronta shape (slots AND a tree) publishes exactly as before", async () => {
  const captured: Captured = { updates: [], inserts: [] };
  const supabase = makeFakeSupabase(captured, {
    blocks: FREEFORM_TREE,
    slotRows: [{ section_id: SECTION_ID, slot_key: "header", sort_order: 0 }],
  });

  const res = await republishSiteShellSnapshot(supabase, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: "actor-1",
  });

  assert.equal(res.ok, true);
  assert.equal("applied" in res && res.applied, true);
  assert.equal("sectionCount" in res ? res.sectionCount : -1, 1);

  const pageUpdate = captured.updates.find((u) => u.table === "cms_pages");
  assert.ok(pageUpdate);
  const snapshot = pageUpdate.payload.published_page_snapshot as {
    slots: Array<{ sectionId: string; slotKey: string }>;
    builderTree: unknown;
  };
  assert.equal(snapshot.slots.length, 1, "the slot composition is still baked");
  assert.equal(snapshot.slots[0]?.sectionId, SECTION_ID);
  assert.deepEqual(snapshot.builderTree, FREEFORM_TREE);
  // Live section pointers are still replaced for a slotted shell.
  assert.equal(captured.inserts.length, 1);
});

test("[D] a tenant with NO shell row is still an honest no-op, not a failure", async () => {
  const captured: Captured = { updates: [], inserts: [] };
  const noShell = {
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        in: () => chain,
        order: () => chain,
        returns: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const res = await republishSiteShellSnapshot(noShell, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: null,
  });
  // This is the ONE legitimate `ok: true, applied: false`: the tenant simply is
  // not on the shell path, so nothing was promised and nothing is owed. Every
  // non-Impronta tenant hits this branch on every homepage publish; turning it
  // into a failure would break them all.
  assert.equal(res.ok, true);
  assert.equal("applied" in res && res.applied, false);
  assert.equal("reason" in res ? res.reason : "", "no_shell_row");
  assert.equal(captured.updates.length, 0);
});
