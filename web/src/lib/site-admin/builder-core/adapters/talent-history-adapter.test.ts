/**
 * Theme releases Phase 2: the talent page + shell adapters carry the site's
 * draft_rev as their CAS version, map a lost race to VERSION_CONFLICT, route
 * the revisions drawer through the history timeline, and restore with the
 * editor's expected rev.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { RevisionsLoadResult } from "@/lib/site-admin/edit-mode/revisions-actions";
import type { CompositionSaveInput } from "@/lib/site-admin/edit-mode/composition-actions";
import { adoptDraftRev, resetDraftRevAdoptions } from "@/lib/talent-site/history/draft-rev";

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
  type TalentPageRow,
} from "./talent-page-adapter-core";
import {
  createTalentSiteShellAdapter,
  type TalentSiteShellAdapterActions,
} from "./talent-site-shell-adapter-core";

const ctx = { locale: "en", pageSlug: "home", pageId: "prof-1" };
const noGuard = { assertNoLegacyWrite: () => {}, talentProfileId: "prof-1" };

const pageRow = (over: Partial<TalentPageRow> = {}): TalentPageRow => ({
  id: "page-1",
  talent_profile_id: "prof-1",
  slug: "home",
  title: "Home",
  status: "draft",
  blocks: [],
  theme: {},
  required_talent_tier: null,
  published_at: null,
  updated_at: "2026-09-30T00:00:00Z",
  ...over,
});

const timeline: RevisionsLoadResult = { ok: true, revisions: [], pageVersion: 11, publishedVersion: null };

function pageActions(over: Partial<TalentPageAdapterActions> = {}) {
  const calls: Record<string, unknown[]> = { savePage: [], restoreRevision: [], loadRevisions: [] };
  const actions: TalentPageAdapterActions = {
    loadPage: async () => pageRow({ draft_rev: 11 }),
    ensurePage: async () => pageRow({ draft_rev: 11 }),
    savePage: async (input) => {
      calls.savePage!.push(input);
      return { ok: true, updatedAt: "2026-09-30T00:00:01Z", draftRev: (input.expectedDraftRev ?? 0) + 1 };
    },
    publishPage: async () => ({ ok: true, publishedAt: "p", updatedAt: "2026-09-30T00:00:02Z", draftRev: 12 }),
    restoreRevision: async (input) => {
      calls.restoreRevision!.push(input);
      return { ok: true, updatedAt: "u", draftRev: 13 };
    },
    loadRevisions: async (input) => {
      calls.loadRevisions!.push(input);
      return timeline;
    },
    ...over,
  };
  return { actions, calls };
}

const saveInput = (expectedVersion: number): CompositionSaveInput =>
  ({ locale: "en", pageId: "page-1", expectedVersion, metadata: { title: "Home" }, slots: {}, builderTree: [] }) as unknown as CompositionSaveInput;

test("page load: pageVersion is the site's draft_rev", async () => {
  const { actions } = pageActions();
  const res = await createTalentPageAdapter(actions, noGuard).load(ctx);
  assert.equal(res.ok && res.data.pageVersion, 11);
});

test("page load: no site (no draft_rev) keeps the old updated_at epoch version", async () => {
  const { actions } = pageActions({ ensurePage: async () => pageRow() });
  const res = await createTalentPageAdapter(actions, noGuard).load(ctx);
  assert.equal(res.ok && res.data.pageVersion, Math.floor(Date.parse("2026-09-30T00:00:00Z") / 1000));
});

test("page save: sends the editor's rev as expected_draft_rev and returns the new rev", async () => {
  resetDraftRevAdoptions();
  const { actions, calls } = pageActions();
  const res = await createTalentPageAdapter(actions, noGuard).save(ctx, saveInput(11));
  assert.equal((calls.savePage![0] as { expectedDraftRev: number }).expectedDraftRev, 11);
  assert.equal(res.ok && res.pageVersion, 12);
});

test("page save: a same-tab colour bump is adopted, not treated as a conflict", async () => {
  resetDraftRevAdoptions();
  adoptDraftRev(11, 12);
  const { actions, calls } = pageActions();
  await createTalentPageAdapter(actions, noGuard).save(ctx, saveInput(11));
  assert.equal((calls.savePage![0] as { expectedDraftRev: number }).expectedDraftRev, 12);
  resetDraftRevAdoptions();
});

test("page save: a lost race maps to VERSION_CONFLICT with the EN/ES notice", async () => {
  const { actions } = pageActions({
    savePage: async () => ({ ok: false, code: "VERSION_CONFLICT", error: "Updated in another tab · Reload" }),
  });
  const adapter = createTalentPageAdapter(actions, noGuard);
  const res = await adapter.save(ctx, saveInput(11));
  assert.equal(!res.ok && res.code, "VERSION_CONFLICT");
  assert.equal(!res.ok && res.error, "Updated in another tab · Reload");
  const draft = await adapter.saveDraft(ctx, { expectedVersion: 11, metadata: { title: "Home" }, slots: {} } as never);
  assert.equal(!draft.ok && draft.code, "VERSION_CONFLICT");
});

test("page save: any other failure is NOT reported as a conflict", async () => {
  const { actions } = pageActions({ savePage: async () => ({ ok: false, error: "boom" }) });
  const res = await createTalentPageAdapter(actions, noGuard).save(ctx, saveInput(11));
  assert.equal(!res.ok && res.code, undefined);
});

test("page publish: returns the unchanged draft_rev as the version", async () => {
  const { actions } = pageActions();
  const res = await createTalentPageAdapter(actions, noGuard).publish(ctx, { expectedVersion: 11 });
  assert.equal(res.ok && res.pageVersion, 12);
});

test("page drawer: loadRevisions routes to the site timeline with the page slug", async () => {
  const { actions, calls } = pageActions();
  const adapter = createTalentPageAdapter(actions, noGuard);
  assert.ok(adapter.loadRevisions);
  const res = await adapter.loadRevisions!(ctx);
  assert.equal(res.ok && res.pageVersion, 11);
  assert.deepEqual(calls.loadRevisions![0], { talentProfileId: "prof-1", pageSlug: "home" });
});

test("page restore: passes the entry id + expected rev and returns the new rev", async () => {
  const { actions, calls } = pageActions();
  const res = await createTalentPageAdapter(actions, noGuard).restoreRevision!(ctx, { revisionId: "h-1", expectedVersion: 11 });
  assert.deepEqual(calls.restoreRevision![0], { talentProfileId: "prof-1", pageId: "page-1", revisionId: "h-1", expectedDraftRev: 11 });
  assert.equal(res.ok && res.pageVersion, 13);
});

test("page restore: a stale tab's restore is a conflict, never a silent overwrite", async () => {
  const { actions } = pageActions({
    restoreRevision: async () => ({ ok: false, code: "VERSION_CONFLICT", error: "Updated in another tab · Reload" }),
  });
  const res = await createTalentPageAdapter(actions, noGuard).restoreRevision!(ctx, { revisionId: "h-1", expectedVersion: 3 });
  assert.equal(!res.ok && res.code, "VERSION_CONFLICT");
});

test("page adapter without the timeline action exposes no loadRevisions", () => {
  const { actions } = pageActions({ loadRevisions: undefined });
  assert.equal(createTalentPageAdapter(actions, noGuard).loadRevisions, undefined);
});

// ── shell ────────────────────────────────────────────────────────────────────

function shellActions(over: Partial<TalentSiteShellAdapterActions> = {}) {
  const calls: Record<string, unknown[]> = { saveShell: [], loadShellRevisions: [], loadTimeline: [] };
  const actions: TalentSiteShellAdapterActions = {
    loadShell: async () => ({ id: "site-1", shellTree: [], shellPublished: [], sitePublishedAt: null, updatedAt: "2026-09-30T00:00:00Z", draftRev: 5 }),
    saveShell: async (input) => {
      calls.saveShell!.push(input);
      return { ok: true, updatedAt: "x", draftRev: 6 };
    },
    publishShell: async () => ({ ok: true, publishedAt: "p", updatedAt: "2026-09-30T00:00:00Z", draftRev: 6 }),
    loadShellRevisions: async (input) => {
      calls.loadShellRevisions!.push(input);
      return { ok: true, revisions: [], pageVersion: 1, publishedVersion: null };
    },
    loadTimeline: async (input) => {
      calls.loadTimeline!.push(input);
      return timeline;
    },
    ...over,
  };
  return { actions, calls };
}

test("shell load + save: draft_rev is the CAS version end to end", async () => {
  resetDraftRevAdoptions();
  const { actions, calls } = shellActions();
  const adapter = createTalentSiteShellAdapter(actions, noGuard);
  const loaded = await adapter.load(ctx);
  assert.equal(loaded.ok && loaded.data.pageVersion, 5);
  const saved = await adapter.save(ctx, saveInput(5));
  assert.equal((calls.saveShell![0] as { expectedDraftRev: number }).expectedDraftRev, 5);
  assert.equal(saved.ok && saved.pageVersion, 6);
});

test("shell save: conflict maps to VERSION_CONFLICT", async () => {
  const { actions } = shellActions({
    saveShell: async () => ({ ok: false, code: "VERSION_CONFLICT", error: "Actualizado en otra pestaña · Recargar" }),
  });
  const res = await createTalentSiteShellAdapter(actions, noGuard).save(ctx, saveInput(5));
  assert.equal(!res.ok && res.code, "VERSION_CONFLICT");
});

test("shell drawer: the history timeline is preferred over the legacy shell revision list", async () => {
  const { actions, calls } = shellActions();
  const res = await createTalentSiteShellAdapter(actions, noGuard).loadRevisions!(ctx);
  assert.equal(res.ok && res.pageVersion, 11);
  assert.equal(calls.loadTimeline!.length, 1);
  assert.equal(calls.loadShellRevisions!.length, 0);
});

test("shell drawer: without the timeline the legacy list still serves", async () => {
  const { actions, calls } = shellActions({ loadTimeline: undefined });
  await createTalentSiteShellAdapter(actions, noGuard).loadRevisions!(ctx);
  assert.equal(calls.loadShellRevisions!.length, 1);
});
