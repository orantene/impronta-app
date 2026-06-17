/**
 * REV-1 · Version-history parity — restoreRevision bound on EVERY surface.
 *
 * (node:test + node:assert, NO vitest / React / Supabase — all deps injected.)
 *
 * Proves the restoreRevision capability is a property of the ONE shared seam
 * (BuilderSurfaceAdapter), adopted by every restore-capable surface, NOT a fork
 * that one surface silently omits. The cautionary precedent: the production
 * `createBoundCmsPageAdapter` + the talent-site-shell adapter implemented the
 * interface slot but failed to BIND restoreRevision — "a method no surface binds
 * is a silent fork." This matrix builds each non-lab surface adapter over a spy
 * action set that DOES supply restoreRevision and asserts the adapter exposes a
 * callable restoreRevision that routes through to that action. A surface that
 * drops the binding (or whose core stops threading it) fails here.
 *
 * This drives the PURE core factories (the same ones the production
 * `createBound*` factories wrap) over injected spy actions — so it proves the
 * seam threads restoreRevision end-to-end without loading the "use server"
 * graph. The production bindings themselves are a one-line wiring that tsc
 * type-checks against these same action interfaces.
 *
 * Lives in its own file (rather than `consumer-surfaces-adapter.test.ts`) to
 * keep that file under the 800-line max-lines cap — extract, don't exceed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createTalentPageAdapter,
  type TalentPageAdapterActions,
} from "./talent-page-adapter-core";
import {
  createCmsPageAdapter,
  type CmsPageAdapterActions,
  type CmsFreeformPageRow,
} from "./cms-page-adapter-core";
import {
  createSiteShellAdapter,
  type SiteShellAdapterActions,
  type SiteShellRow,
} from "./site-shell-adapter-core";
import {
  createTalentSiteShellAdapter,
  type TalentSiteShellAdapterActions,
  type TalentSiteShellRow,
} from "./talent-site-shell-adapter-core";
import {
  buildTalentSiteShellRevisionSnapshot,
  isTalentSiteShellRevisionSnapshot,
  nextTalentSiteShellRevisionVersion,
  TALENT_SITE_SHELL_REVISION_SURFACE,
} from "./talent-site-shell-revision-snapshot";
import {
  buildFreeformRevisionSnapshot,
  nextFreeformRevisionVersion,
} from "./freeform-revision-snapshot";

import type { BuilderSurfaceAdapter } from "../surface-adapter";

const REV_CTX = { locale: "en" as const, pageSlug: "index", pageId: "p1" };
const STAMP = (h: string) => new Date(`2026-06-17T${h}:00:00Z`).toISOString();

/** A talent_page action set that supplies restoreRevision (spy-tracked). */
function talentPageActionsWithRestore(): TalentPageAdapterActions & { calls: string[] } {
  const calls: string[] = [];
  const row = {
    id: "tp-1",
    talent_profile_id: "p1",
    slug: "index",
    title: "Page",
    status: "draft" as const,
    blocks: [],
    theme: {},
    required_talent_tier: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  return {
    calls,
    async ensurePage() {
      return row;
    },
    async loadPage() {
      return row;
    },
    async savePage() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishPage() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
}

/** A cms_page adapter whose action surface supplies restoreRevision. */
function cmsAdapterWithRestore(): { adapter: BuilderSurfaceAdapter; calls: string[] } {
  const calls: string[] = [];
  const row: CmsFreeformPageRow = {
    id: "cms-1",
    slug: "index",
    title: "Page",
    status: "draft",
    blocks: [],
    is_freeform: true,
    version: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  const actions: CmsPageAdapterActions = {
    async loadPage() {
      return row;
    },
    async savePage() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishPage() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return { adapter: createCmsPageAdapter(actions, { assertNoLegacyWrite() {} }), calls };
}

/** A site_shell (agency) adapter whose action surface supplies restore. */
function siteShellAdapterWithRestore(): { adapter: BuilderSurfaceAdapter; calls: string[] } {
  const calls: string[] = [];
  const row: SiteShellRow = {
    id: "shell-1",
    title: "Site shell",
    status: "draft",
    blocks: [],
    snapshotBuilderTree: null,
    version: null,
    published_at: null,
    updated_at: STAMP("00"),
  };
  const actions: SiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishShell() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return { adapter: createSiteShellAdapter(actions, { assertNoLegacyWrite() {} }), calls };
}

/** A talent-site-shell adapter whose action surface supplies restore. */
function talentSiteShellAdapterWithRestore(): {
  adapter: BuilderSurfaceAdapter;
  calls: string[];
} {
  const calls: string[] = [];
  const row: TalentSiteShellRow = {
    id: "ts-1",
    shellTree: [],
    shellPublished: [],
    sitePublishedAt: null,
    updatedAt: STAMP("00"),
  };
  const actions: TalentSiteShellAdapterActions = {
    async loadShell() {
      return row;
    },
    async saveShell() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishShell() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
    async restoreRevision() {
      calls.push("restoreRevision");
      return { ok: true, updatedAt: STAMP("03") };
    },
  };
  return {
    adapter: createTalentSiteShellAdapter(actions, {
      talentProfileId: "p1",
      assertNoLegacyWrite() {},
    }),
    calls,
  };
}

test("[REV-1] EVERY restore-capable surface adapter BINDS a callable restoreRevision", async () => {
  // Table-driven: each restore-capable surface (talent_page, cms_page,
  // site_shell agency, talent-site-shell) must expose restoreRevision when its
  // action surface supplies the action. A surface that fails to thread the
  // binding through its core factory fails this assertion.
  const talentActions = talentPageActionsWithRestore();
  const matrix: Array<{ surface: string; built: { adapter: BuilderSurfaceAdapter; calls: string[] } }> = [
    {
      surface: "talent_page",
      built: {
        adapter: createTalentPageAdapter(talentActions, {
          talentProfileId: "p1",
          assertNoLegacyWrite() {},
        }),
        calls: talentActions.calls,
      },
    },
    { surface: "cms_page", built: cmsAdapterWithRestore() },
    { surface: "site_shell", built: siteShellAdapterWithRestore() },
    { surface: "talent_site_shell", built: talentSiteShellAdapterWithRestore() },
  ];

  for (const { surface, built } of matrix) {
    assert.equal(
      typeof built.adapter.restoreRevision,
      "function",
      `surface "${surface}" MUST bind restoreRevision (a method no surface binds is a silent fork)`,
    );
    const res = await built.adapter.restoreRevision!(REV_CTX, {
      revisionId: "rev-1",
      expectedVersion: 1,
    });
    assert.equal(res.ok, true, `surface "${surface}" restoreRevision must succeed via its action`);
    assert.ok(
      built.calls.includes("restoreRevision"),
      `surface "${surface}" restoreRevision must route through its bound action`,
    );
  }
});

test("[REV-1] an adapter built WITHOUT a restore action omits restoreRevision (lab/ephemeral model)", () => {
  // The optional-method contract: a surface whose action set lacks
  // restoreRevision (e.g. an ephemeral lab, or a not-yet-wired surface) omits
  // the method entirely so call-sites can guard on its presence. This is what
  // makes the "binding" the load-bearing step — the core honours the absence.
  const cmsNoRestore: CmsPageAdapterActions = {
    async loadPage() {
      return null;
    },
    async savePage() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishPage() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
  };
  assert.equal(
    createCmsPageAdapter(cmsNoRestore, { assertNoLegacyWrite() {} }).restoreRevision,
    undefined,
    "a cms_page adapter with no restore action must omit restoreRevision",
  );

  const tsNoRestore: TalentSiteShellAdapterActions = {
    async loadShell() {
      return null;
    },
    async saveShell() {
      return { ok: true, updatedAt: STAMP("01") };
    },
    async publishShell() {
      return { ok: true, publishedAt: STAMP("02"), updatedAt: STAMP("02") };
    },
  };
  assert.equal(
    createTalentSiteShellAdapter(tsNoRestore, {
      talentProfileId: "p1",
      assertNoLegacyWrite() {},
    }).restoreRevision,
    undefined,
    "a talent-site-shell adapter with no restore action must omit restoreRevision",
  );
});

test("[REV-1] talent-site-shell revision snapshot is freeform-tree shaped + marker-namespaced", () => {
  // The shell snapshot carries the freeform tree under `builderTree` (the key
  // the shared revisions machinery reads) AND a surface marker so it is never
  // confused with the full-site TalentSiteSnapshot rows in the same table.
  const snap = buildTalentSiteShellRevisionSnapshot({
    title: "Site shell",
    shellTree: [{ id: "n1", kind: "section", props: {} }],
  });
  assert.equal(snap.surface, TALENT_SITE_SHELL_REVISION_SURFACE);
  assert.deepEqual(snap.builderTree, [{ id: "n1", kind: "section", props: {} }]);
  assert.equal(isTalentSiteShellRevisionSnapshot(snap), true);

  // A non-array shellTree normalises to [] (always restorable).
  assert.deepEqual(
    buildTalentSiteShellRevisionSnapshot({ title: "x", shellTree: null }).builderTree,
    [],
  );

  // A full-site composition snapshot (no marker / no builderTree) is rejected,
  // so a restore can never paint slot composition into the freeform shell.
  assert.equal(isTalentSiteShellRevisionSnapshot({ pageVersion: 3, blocks: [] }), false);
  assert.equal(isTalentSiteShellRevisionSnapshot(null), false);
  assert.equal(
    isTalentSiteShellRevisionSnapshot({ surface: "other", builderTree: [] }),
    false,
  );

  // Version helper applies the +1 rule (1 for the first revision).
  assert.equal(nextTalentSiteShellRevisionVersion(undefined), 1);
  assert.equal(nextTalentSiteShellRevisionVersion(4), 5);
});

test("[REV-1] freeform cms_page revision snapshot is builderTree shaped", () => {
  const snap = buildFreeformRevisionSnapshot({
    title: "Page",
    blocks: [{ id: "n1", kind: "section", props: {} }],
  });
  assert.deepEqual(snap.builderTree, [{ id: "n1", kind: "section", props: {} }]);
  assert.deepEqual(buildFreeformRevisionSnapshot({ title: "x", blocks: "bad" }).builderTree, []);
  assert.equal(nextFreeformRevisionVersion(undefined), 1);
  assert.equal(nextFreeformRevisionVersion(9), 10);
});
