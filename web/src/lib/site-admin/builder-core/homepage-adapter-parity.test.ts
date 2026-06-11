import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createHomepageAdapter,
  type HomepageAdapterActions,
} from "./adapters/homepage-adapter";
import type {
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceRestoreInput,
  BuilderSurfaceSaveDraftInput,
} from "./surface-adapter";
import type { CompositionSaveInput } from "@/lib/site-admin/edit-mode/composition-actions";

/**
 * Homepage parity proof (WS1 acceptance).
 *
 * The homepage adapter MUST be a pure pass-through over the four homepage
 * composition actions + the two restore actions, so the homepage stays
 * byte-identical through the seam. We build the adapter with spy actions and
 * assert that — for the SAME ctx + input the legacy edit-context call-sites
 * supplied — the adapter forwards the EXACT argument object the action would
 * have received from a direct call, and returns the action's result unchanged.
 */

/** Records the single argument each action was called with + the call count. */
function makeSpyActions() {
  const calls: Record<string, unknown[]> = {
    load: [],
    save: [],
    saveDraft: [],
    publish: [],
    restoreHomepageRevision: [],
    restorePageRevision: [],
  };
  // Distinct sentinel results so we can prove the adapter returns the action's
  // result verbatim (no wrapping / remapping).
  const results = {
    load: { ok: true as const, data: { sentinel: "load" } },
    save: { ok: true as const, pageVersion: 11 },
    saveDraft: { ok: true as const, pageVersion: 12, savedAt: "2026-06-10T00:00:00Z" },
    publish: { ok: true as const, pageVersion: 13, publishedAt: "2026-06-10T00:00:01Z" },
    restoreHomepageRevision: { ok: true as const, pageVersion: 14 },
    restorePageRevision: { ok: true as const, pageVersion: 15 },
  };
  const actions = {
    load: async (input) => {
      calls.load!.push(input);
      return results.load as never;
    },
    save: async (input) => {
      calls.save!.push(input);
      return results.save;
    },
    saveDraft: async (input) => {
      calls.saveDraft!.push(input);
      return results.saveDraft;
    },
    publish: async (input) => {
      calls.publish!.push(input);
      return results.publish;
    },
    restoreHomepageRevision: async (input) => {
      calls.restoreHomepageRevision!.push(input);
      return results.restoreHomepageRevision;
    },
    restorePageRevision: async (input) => {
      calls.restorePageRevision!.push(input);
      return results.restorePageRevision;
    },
  } satisfies HomepageAdapterActions;
  return { actions, calls, results };
}

const baseMetadata: CompositionSaveInput["metadata"] = {
  title: "Home",
  metaTitle: null,
  metaDescription: null,
  introTagline: null,
  ogTitle: null,
  ogDescription: null,
  ogImageUrl: null,
  canonicalUrl: null,
  noindex: false,
};

const baseSlots: CompositionSaveInput["slots"] = {
  body: [{ sectionId: "sec-1", sortOrder: 0 }],
};

test("homepage adapter.load forwards { locale, pageSlug } unchanged + returns result verbatim", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "en", pageSlug: null, pageId: null };

  const res = await adapter.load(ctx);

  assert.equal(calls.load!.length, 1);
  // Direct call-site passed: loadHomepageCompositionAction({ locale, pageSlug })
  assert.deepEqual(calls.load![0], { locale: "en", pageSlug: null });
  assert.equal(res, results.load); // verbatim, same reference
});

test("homepage adapter.load threads a non-homepage pageSlug through", async () => {
  const { actions, calls } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);

  await adapter.load({ locale: "es", pageSlug: "about", pageId: "page-9" });

  assert.deepEqual(calls.load![0], { locale: "es", pageSlug: "about" });
});

test("homepage adapter.save merges ctx locale+pageId onto the envelope (homepage)", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "en", pageSlug: null, pageId: null };
  const input: CompositionSaveInput = {
    locale: "en",
    pageId: null,
    expectedVersion: 7,
    metadata: baseMetadata,
    slots: baseSlots,
    builderTree: [],
  };

  const res = await adapter.save(ctx, input);

  assert.equal(calls.save!.length, 1);
  // Direct call-site passed: saveHomepageCompositionAction({ locale, pageId, ...envelope })
  assert.deepEqual(calls.save![0], {
    locale: "en",
    pageId: null,
    expectedVersion: 7,
    metadata: baseMetadata,
    slots: baseSlots,
    builderTree: [],
  });
  assert.equal(res, results.save);
});

test("homepage adapter.save targets a non-homepage page by pageId from ctx", async () => {
  const { actions, calls } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "es", pageSlug: "about", pageId: "page-9" };
  const input: CompositionSaveInput = {
    locale: "es",
    pageId: "page-9",
    expectedVersion: 3,
    metadata: baseMetadata,
    slots: baseSlots,
  };

  await adapter.save(ctx, input);

  assert.equal(calls.save![0] && (calls.save![0] as CompositionSaveInput).pageId, "page-9");
  assert.equal((calls.save![0] as CompositionSaveInput).locale, "es");
});

test("homepage adapter.saveDraft forwards the legacy saveDraftHomepageAction shape", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "en", pageSlug: null, pageId: null };
  const input: BuilderSurfaceSaveDraftInput = {
    expectedVersion: 4,
    metadata: baseMetadata,
    slots: baseSlots,
    builderTree: [],
    styleClasses: undefined,
  };

  const res = await adapter.saveDraft(ctx, input);

  // Direct call-site passed: saveDraftHomepageAction({ locale, pageId, expectedVersion, metadata, slots, builderTree, styleClasses })
  assert.deepEqual(calls.saveDraft![0], {
    locale: "en",
    pageId: null,
    expectedVersion: 4,
    metadata: baseMetadata,
    slots: baseSlots,
    builderTree: [],
    styleClasses: undefined,
  });
  assert.equal(res, results.saveDraft);
});

test("homepage adapter.publish forwards the legacy publish shape", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "en", pageSlug: null, pageId: null };
  const input: BuilderSurfacePublishInput = { expectedVersion: 5, styleClasses: undefined };

  const res = await adapter.publish(ctx, input);

  // Direct call-site passed: publishHomepageFromEditModeAction({ locale, pageId, expectedVersion, styleClasses })
  assert.deepEqual(calls.publish![0], {
    locale: "en",
    pageId: null,
    expectedVersion: 5,
    styleClasses: undefined,
  });
  assert.equal(res, results.publish);
});

test("homepage adapter.restoreRevision uses the homepage (locale) branch when no pageId", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "en", pageSlug: null, pageId: null };
  const input: BuilderSurfaceRestoreInput = { revisionId: "rev-1", expectedVersion: 6 };

  const res = await adapter.restoreRevision!(ctx, input);

  assert.equal(calls.restorePageRevision!.length, 0);
  // Direct call-site passed: restoreHomepageRevisionAction({ revisionId, locale, expectedVersion })
  assert.deepEqual(calls.restoreHomepageRevision![0], {
    revisionId: "rev-1",
    locale: "en",
    expectedVersion: 6,
  });
  assert.equal(res, results.restoreHomepageRevision);
});

test("homepage adapter.restoreRevision uses the page (pageId) branch when pageSlug+pageId present", async () => {
  const { actions, calls, results } = makeSpyActions();
  const adapter = createHomepageAdapter(actions);
  const ctx: BuilderSurfaceContext = { locale: "es", pageSlug: "about", pageId: "page-9" };
  const input: BuilderSurfaceRestoreInput = { revisionId: "rev-2", expectedVersion: 8 };

  const res = await adapter.restoreRevision!(ctx, input);

  assert.equal(calls.restoreHomepageRevision!.length, 0);
  // Direct call-site passed: restorePageRevisionAction({ revisionId, pageId, expectedVersion })
  assert.deepEqual(calls.restorePageRevision![0], {
    revisionId: "rev-2",
    pageId: "page-9",
    expectedVersion: 8,
  });
  assert.equal(res, results.restorePageRevision);
});

test("homepage adapter declares kind=homepage", () => {
  const { actions } = makeSpyActions();
  assert.equal(createHomepageAdapter(actions).kind, "homepage");
});
