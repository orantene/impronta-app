/**
 * Talent-site SHELL adapter — spy tests (node:test + node:assert, NO vitest /
 * React / Supabase).
 *
 * Proves the talent-site shell adapter:
 *   1. has kind "site_shell";
 *   2. NEVER writes a legacy slot table — the runtime guard is a no-op for
 *      `talent_sites`, but a regression that pointed it at `cms_page_sections`
 *      would throw (asserted via an injected guard);
 *   3. scopes every op by `talentProfileId` (captured at construction);
 *   4. load prefers the freeform DRAFT (`shellTree`), falling back to the
 *      PUBLISHED tree (`shellPublished`) when the draft is empty;
 *   5. save round-trips the edited tree to `saveShell`;
 *   6. publish calls `publishShell` (bakes shell_tree → shell_published).
 *
 * All deps are injected — no server-action / DB import graph is loaded.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTalentSiteShellAdapter,
  buildTalentSiteShellComposition,
  type TalentSiteShellAdapterActions,
  type TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";
import {
  assertNoLegacyBuilderWrite,
  LegacyBuilderWriteError,
} from "../legacy-write-guard";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const TALENT_ID = "talent-profile-123";
const LOCALE = "en";
const CTX = { locale: LOCALE as never, pageSlug: null, pageId: TALENT_ID };

const DRAFT_TREE: BuilderNodeTree = [
  { id: "h-draft", kind: "heading", props: { text: "Draft header", level: 2 } },
];
const PUBLISHED_TREE: BuilderNodeTree = [
  { id: "h-pub", kind: "heading", props: { text: "Live header", level: 2 } },
];

/** A full `CompositionSaveInput` for the spy tests (only builderTree matters). */
function saveInput(builderTree: BuilderNodeTree) {
  return {
    pageId: TALENT_ID,
    locale: LOCALE as never,
    expectedVersion: 1,
    metadata: {
      title: "Site shell",
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: false,
    },
    slots: {},
    builderTree,
  };
}

function makeRow(overrides: Partial<TalentSiteShellRow> = {}): TalentSiteShellRow {
  return {
    id: "talent-sites-row-1",
    shellTree: [],
    shellPublished: PUBLISHED_TREE,
    sitePublishedAt: "2026-02-01T00:00:00Z",
    updatedAt: new Date("2026-06-16T12:00:00Z").toISOString(),
    ...overrides,
  };
}

function makeActions(row: TalentSiteShellRow | null = makeRow()): TalentSiteShellAdapterActions & {
  calls: string[];
  loadIds: string[];
  saved: BuilderNodeTree | null;
} {
  const calls: string[] = [];
  const loadIds: string[] = [];
  let saved: BuilderNodeTree | null = null;
  return {
    calls,
    loadIds,
    get saved() {
      return saved;
    },
    async loadShell(input) {
      calls.push("loadShell");
      loadIds.push(input.talentProfileId);
      return row;
    },
    async saveShell(input) {
      calls.push("saveShell");
      saved = input.patch.shellTree as BuilderNodeTree;
      return { ok: true as const, updatedAt: new Date("2026-06-16T12:30:00Z").toISOString() };
    },
    async publishShell() {
      calls.push("publishShell");
      return {
        ok: true as const,
        publishedAt: "2026-06-16T13:00:00Z",
        updatedAt: "2026-06-16T13:00:00Z",
      };
    },
  };
}

test("adapter has kind 'site_shell'", () => {
  const adapter = createTalentSiteShellAdapter(makeActions(), { talentProfileId: TALENT_ID });
  assert.equal(adapter.kind, "site_shell");
});

test("load prefers the freeform draft tree, then the published tree", () => {
  // Empty draft → published fallback.
  const fallbackComp = buildTalentSiteShellComposition(makeRow({ shellTree: [] }), LOCALE);
  assert.deepEqual(fallbackComp.builderTree, PUBLISHED_TREE);

  // Non-empty draft wins.
  const draftComp = buildTalentSiteShellComposition(
    makeRow({ shellTree: DRAFT_TREE }),
    LOCALE,
  );
  assert.deepEqual(draftComp.builderTree, DRAFT_TREE);
});

test("load scopes by the captured talentProfileId", async () => {
  const actions = makeActions();
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: TALENT_ID });
  const res = await adapter.load(CTX);
  assert.equal(res.ok, true);
  assert.deepEqual(actions.loadIds, [TALENT_ID]);
});

test("save round-trips the edited tree to saveShell", async () => {
  const actions = makeActions();
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: TALENT_ID });
  const res = await adapter.save(CTX, saveInput(DRAFT_TREE));
  assert.equal(res.ok, true);
  assert.deepEqual(actions.saved, DRAFT_TREE);
  assert.ok(actions.calls.includes("saveShell"));
});

test("publish calls publishShell", async () => {
  const actions = makeActions();
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: TALENT_ID });
  const res = await adapter.publish(CTX, { expectedVersion: 1 });
  assert.equal(res.ok, true);
  assert.ok(actions.calls.includes("publishShell"));
});

test("the real guard is a no-op for talent_sites (never throws)", () => {
  // The production adapter guards with `assertNoLegacyBuilderWrite("site_shell",
  // "talent_sites")` — talent_sites is NOT a legacy slot table, so it never
  // throws. A regression pointing at a legacy table WOULD throw.
  assert.doesNotThrow(() => assertNoLegacyBuilderWrite("site_shell", "talent_sites"));
  assert.throws(
    () => assertNoLegacyBuilderWrite("site_shell", "cms_page_sections"),
    LegacyBuilderWriteError,
  );
});

test("a save with an injected legacy-table guard throws (defense check)", async () => {
  const actions = makeActions();
  // Inject a guard that simulates the adapter mistakenly targeting a legacy table.
  const adapter = createTalentSiteShellAdapter(actions, {
    talentProfileId: TALENT_ID,
    assertNoLegacyWrite: () => {
      throw new LegacyBuilderWriteError("site_shell", "cms_page_sections");
    },
  });
  await assert.rejects(
    () => adapter.save(CTX, saveInput(DRAFT_TREE)),
    LegacyBuilderWriteError,
  );
});

test("a missing shell row returns an error, never an auto-created blank shell", async () => {
  const actions = makeActions(null);
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: TALENT_ID });
  const res = await adapter.load(CTX);
  assert.equal(res.ok, false);
});

// ── REV-1b — owner-gated revision LIST read ───────────────────────────────────

test("[REV-1b] adapter exposes loadRevisions ONLY when the action supplies loadShellRevisions", () => {
  // Omitted by default — matches the optional-capability contract (homepage /
  // cms_page surfaces have no surface-specific list read; the drawer's
  // staff-gated default covers them).
  const without = createTalentSiteShellAdapter(makeActions(), { talentProfileId: TALENT_ID });
  assert.equal(
    without.loadRevisions,
    undefined,
    "a shell adapter whose action set lacks loadShellRevisions must omit loadRevisions",
  );

  // Present once the action surface binds it.
  const withList: TalentSiteShellAdapterActions = {
    ...makeActions(),
    async loadShellRevisions() {
      return { ok: true, revisions: [], pageVersion: 1, publishedVersion: null };
    },
  };
  const adapter = createTalentSiteShellAdapter(withList, { talentProfileId: TALENT_ID });
  assert.equal(typeof adapter.loadRevisions, "function");
});

test("[REV-1b] loadRevisions routes through the bound action, scoped to the captured talentProfileId", async () => {
  const seenIds: string[] = [];
  const actions: TalentSiteShellAdapterActions = {
    ...makeActions(),
    async loadShellRevisions(input) {
      seenIds.push(input.talentProfileId);
      return {
        ok: true,
        revisions: [
          {
            id: "rev-1",
            kind: "draft",
            version: 2,
            createdAt: "2026-06-17T00:00:00Z",
            createdBy: null,
            sectionCount: 3,
            titleAtRevision: "Site shell",
            label: null,
          },
        ],
        pageVersion: 42,
        publishedVersion: null,
      };
    },
  };
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: TALENT_ID });
  assert.equal(typeof adapter.loadRevisions, "function");
  const res = await adapter.loadRevisions!(CTX);
  // The owner-gated read result passes through unchanged (drawer-shaped).
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.pageVersion, 42);
    assert.equal(res.revisions.length, 1);
    assert.equal(res.revisions[0]!.id, "rev-1");
  }
  // Scoped to the captured talent id — never an unscoped / staff-gated read.
  assert.deepEqual(seenIds, [TALENT_ID]);
});

test("[REV-1b] loadRevisions errors (never silently lists) when no talentProfileId is resolvable", async () => {
  const actions: TalentSiteShellAdapterActions = {
    ...makeActions(),
    async loadShellRevisions() {
      return { ok: true, revisions: [], pageVersion: 1, publishedVersion: null };
    },
  };
  // No captured id AND no ctx.pageId → the adapter must refuse rather than read.
  const adapter = createTalentSiteShellAdapter(actions, { talentProfileId: "" });
  const res = await adapter.loadRevisions!({ locale: LOCALE as never, pageSlug: null, pageId: null });
  assert.equal(res.ok, false);
});
