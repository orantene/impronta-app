/**
 * site-shell-publish-freeform-survives.test.ts — the F2 regression.
 *
 * THE INCIDENT SHAPE
 * ------------------
 * `republishSiteShellSnapshot` is the ONE place the shell's published snapshot
 * is baked, and it is called from the shell's own Publish, from the legacy
 * SiteHeaderInspector autosave, AND from the HOMEPAGE publish
 * (composition-actions.ts). It used to hardcode the snapshot's `builderTree` to
 * a tree derived purely from the slot composition. Only the shell's own Publish
 * compensated, by re-overlaying the freeform `cms_pages.blocks` tree afterwards.
 *
 * So the operator would: publish the shell (freeform header content goes live),
 * then publish the HOMEPAGE — and the homepage publish silently rebaked the
 * shell snapshot from slots alone, wiping the freeform shell content off the
 * LIVE site. No error, no warning. Same for a SiteHeaderInspector autosave.
 *
 * WHAT THIS TEST ASSERTS
 * ----------------------
 * The exact sequence from the incident, against a fake PostgREST client:
 *
 *   1. shell row has freeform `blocks` (the operator's published shell content)
 *   2. call `republishSiteShellSnapshot` the way the HOMEPAGE publish calls it
 *      (i.e. with NO freeform overlay afterwards — that is the whole bug)
 *   3. ASSERT the snapshot written to `cms_pages.published_page_snapshot` has
 *      `builderTree` deep-equal to the freeform `blocks` tree, and specifically
 *      that the operator's freeform child node is still in it.
 *
 * Step 3 is the assertion that fails on the pre-fix code: it used to write the
 * slot-derived legacy tree, which contains a `legacy:header:0:<sectionId>`
 * landmark and NONE of the operator's freeform children.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { republishSiteShellSnapshot } from "./site-shell-publish";

const TENANT = "00000000-0000-0000-0000-000000000001";
const PAGE_ID = "page-shell-1";
const SECTION_ID = "sec-header-1";

/** The operator's freeform shell tree — what must survive a homepage publish. */
const FREEFORM_BLOCKS = [
  {
    id: "shell-header",
    kind: "section",
    props: {
      sectionId: SECTION_ID,
      sectionTypeKey: "site_header",
      slotKey: "header",
      sortOrder: 0,
      label: null,
    },
    children: [
      { id: "operator-added-node", kind: "text", props: { text: "Book a model" } },
    ],
  },
];

interface Captured {
  updates: Array<{ table: string; payload: Record<string, unknown> }>;
}

/**
 * Minimal chainable PostgREST fake. Every filter/order method returns `this`;
 * the builder is thenable so a bare `await` resolves it, and `maybeSingle()`
 * resolves the single-row shape. Responses are keyed by table + verb.
 */
function makeFakeSupabase(captured: Captured) {
  const rows: Record<string, unknown> = {
    "cms_pages:select": {
      id: PAGE_ID,
      title: "Site shell",
      meta_description: null,
      template_schema_version: 1,
      version: 3,
      blocks: FREEFORM_BLOCKS,
    },
    "cms_page_sections:select": [
      { section_id: SECTION_ID, slot_key: "header", sort_order: 0 },
    ],
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
      verb === "select" ? { data: rows[key] ?? null, error: null } : { data: null, error: null };
    if (verb === "update") {
      captured.updates.push({ table, payload: payload as Record<string, unknown> });
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
      then: (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject),
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

test("[F2] a homepage publish does NOT wipe the shell's freeform content", async () => {
  const captured: Captured = { updates: [] };
  const supabase = makeFakeSupabase(captured);

  // This is EXACTLY how composition-actions.ts calls it during a homepage
  // publish — no freeform overlay before or after. Pre-fix, the shell's
  // freeform content did not survive this call.
  const res = await republishSiteShellSnapshot(supabase, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: "actor-1",
  });

  assert.equal(res.ok, true, "republish should succeed");

  const pageUpdate = captured.updates.find((u) => u.table === "cms_pages");
  assert.ok(pageUpdate, "republish must write cms_pages.published_page_snapshot");

  const snapshot = pageUpdate.payload.published_page_snapshot as {
    builderTree: unknown;
    slots: unknown[];
  };
  assert.ok(snapshot, "no snapshot written");

  // ── THE ASSERTION ────────────────────────────────────────────────────────
  // The baked builderTree IS the operator's freeform tree, verbatim.
  assert.deepEqual(
    snapshot.builderTree,
    FREEFORM_BLOCKS,
    "the homepage publish rebaked the shell snapshot from slot composition and " +
      "DISCARDED the freeform `blocks` tree — this is the F2 data-loss bug: the " +
      "operator's published shell content silently disappears from the live site",
  );

  // Said a second way, so a future refactor that keeps the shape but loses the
  // content still fails loudly: the operator's own node must be present.
  assert.ok(
    JSON.stringify(snapshot.builderTree).includes("operator-added-node"),
    "the operator's freeform child node is missing from the published snapshot",
  );

  // The slot composition is still baked alongside — this fix is additive, it
  // does not remove the legacy slots the dormant system maintains.
  assert.equal(snapshot.slots.length, 1, "slot composition must still be baked");
});

test("[F2] a shell with NO freeform blocks still bakes the legacy slot tree", async () => {
  // The flag-off / pre-freeform tenant path must stay byte-stable: with empty
  // `blocks` the snapshot falls back to the slot-derived legacy tree exactly as
  // before. Without this, the fix would break every tenant that has never used
  // the freeform shell surface.
  const captured: Captured = { updates: [] };
  const supabase = makeFakeSupabase(captured);
  // Re-point the shell row at an empty draft.
  const original = supabase as unknown as { from: (t: string) => unknown };
  const wrapped = {
    from: (table: string) => {
      const inner = original.from(table) as Record<string, () => unknown>;
      if (table !== "cms_pages") return inner;
      return {
        ...inner,
        select: () => {
          const chain = inner.select() as Record<string, unknown>;
          const prev = chain.maybeSingle as () => Promise<{ data: Record<string, unknown> }>;
          chain.maybeSingle = async () => {
            const r = await prev();
            return { data: { ...r.data, blocks: [] }, error: null };
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;

  const res = await republishSiteShellSnapshot(wrapped, {
    tenantId: TENANT,
    locale: "en",
    actorProfileId: "actor-1",
  });
  assert.equal(res.ok, true);

  const pageUpdate = captured.updates.find((u) => u.table === "cms_pages");
  assert.ok(pageUpdate);
  const snapshot = pageUpdate.payload.published_page_snapshot as {
    builderTree: Array<{ id: string }>;
  };
  assert.equal(
    snapshot.builderTree[0]?.id,
    `legacy:header:0:${SECTION_ID}`,
    "with no freeform blocks the snapshot must still carry the slot-derived " +
      "legacy tree — the pre-freeform tenant path must not change",
  );
});
