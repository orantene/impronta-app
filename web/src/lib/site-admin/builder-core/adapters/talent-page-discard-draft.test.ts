/**
 * talent_page `discardDraft` — "Discard draft" / "Pull from live: Replace" on a
 * talent site. The homepage action resets the WORKSPACE homepage, so on a talent
 * site the request succeeded and the edit stayed on the canvas. The adapter now
 * resets the talent page's own draft to its live body (`blocks_published`).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
  type TalentPagePatch,
  type TalentPageRow,
} from "./talent-page-adapter-core";

const LIVE = [{ id: "live-1", kind: "heading", props: { text: "Live" } }];
const DRAFT = [{ id: "draft-1", kind: "heading", props: { text: "Draft edit" } }];

function row(over: Partial<TalentPageRow> = {}): TalentPageRow {
  return {
    id: "tp-row-001",
    talent_profile_id: "tp",
    slug: "index",
    title: "Page",
    status: "published",
    blocks: DRAFT,
    blocks_published: LIVE,
    theme: { styleClasses: {} },
    required_talent_tier: null,
    published_at: null,
    updated_at: "2026-06-11T12:00:00Z",
    ...over,
  } as TalentPageRow;
}

function setup(r: TalentPageRow, writeResult: { ok: false; error: string; code?: string } | null = null) {
  const saves: Array<{ patch: TalentPagePatch; expectedDraftRev?: number | null }> = [];
  const actions: TalentPageAdapterActions = {
    ensurePage: async () => r,
    loadPage: async () => r,
    savePage: async (input) => {
      saves.push({ patch: input.patch, expectedDraftRev: input.expectedDraftRev });
      return writeResult ?? { ok: true, updatedAt: "2026-06-11T12:01:00Z", draftRev: 8 };
    },
    publishPage: async () => ({ ok: true, publishedAt: "x", updatedAt: "x" }),
  };
  const adapter = createTalentPageAdapter(actions, { assertNoLegacyWrite: () => {}, talentProfileId: "tp" });
  return { adapter, saves };
}

const CTX = { locale: "en" as const, pageSlug: "index", pageId: "tp-row-001" };

test("discardDraft writes the live body into the draft, keeping the theme", async () => {
  const { adapter, saves } = setup(row());
  const res = await adapter.discardDraft!(CTX, { expectedVersion: 7 });
  assert.equal(res.ok, true);
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0]!.patch.blocks, LIVE);
  assert.deepEqual(saves[0]!.patch.theme, { styleClasses: {} });
});

test("discardDraft refuses when nothing is published, and writes nothing", async () => {
  const { adapter, saves } = setup(row({ blocks_published: [] }));
  const res = await adapter.discardDraft!(CTX, { expectedVersion: 7 });
  assert.equal(res.ok, false);
  assert.equal(saves.length, 0);
});

test("discardDraft surfaces a draft-rev conflict code so the editor reloads", async () => {
  const { adapter } = setup(row(), { ok: false, error: "changed elsewhere", code: "VERSION_CONFLICT" });
  const res = await adapter.discardDraft!(CTX, { expectedVersion: 7 });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, "changed elsewhere");
});
