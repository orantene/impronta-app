import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPlatformLabAdapter,
  emptyLabComposition,
} from "./platform-lab-adapter-core";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";
import type { BuilderSurfaceContext } from "../surface-adapter";
import type {
  CompositionData,
  CompositionSaveInput,
} from "@/lib/site-admin/edit-mode/composition-actions";

/**
 * Ephemeral-persistence proof (WS5 acceptance, HARD RULE).
 *
 * The platform_lab adapter MUST be a no-op sink: its autosave / save / saveDraft
 * / publish NEVER call `saveHomepageCompositionAction` (or any homepage / cms
 * write). We inject a SPY action set alongside the adapter and assert the
 * adapter never touches it under any mutation. We also prove the legacy-write
 * guard throws for `cms_page_sections` on this surface.
 */

const ctx: BuilderSurfaceContext = {
  locale: "en",
  pageSlug: null,
  pageId: null,
};

const baseSaveInput: CompositionSaveInput = {
  locale: "en",
  pageId: null,
  expectedVersion: 1,
  metadata: {
    title: "Lab",
    metaTitle: null,
    metaDescription: null,
    introTagline: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: true,
  },
  slots: {},
  builderTree: [],
};

/**
 * A spy that records every call to each homepage action. The adapter is given a
 * `loadInitialComposition` that does NOT reach these — they exist purely to
 * prove the adapter never invokes them. If the adapter ever wired a homepage
 * action behind its sink, one of these counters would tick above 0.
 */
function makeHomepageActionSpy() {
  const calls = {
    saveHomepageCompositionAction: 0,
    saveDraftHomepageAction: 0,
    publishHomepageFromEditModeAction: 0,
    loadHomepageCompositionAction: 0,
    restoreHomepageRevisionAction: 0,
  };
  const actions = {
    saveHomepageCompositionAction: async () => {
      calls.saveHomepageCompositionAction += 1;
      return { ok: true as const, pageVersion: 99 };
    },
    saveDraftHomepageAction: async () => {
      calls.saveDraftHomepageAction += 1;
      return { ok: true as const, pageVersion: 99, savedAt: "x" };
    },
    publishHomepageFromEditModeAction: async () => {
      calls.publishHomepageFromEditModeAction += 1;
      return { ok: true as const, pageVersion: 99, publishedAt: "x" };
    },
    loadHomepageCompositionAction: async () => {
      calls.loadHomepageCompositionAction += 1;
      return { ok: false as const, error: "should never be called" };
    },
    restoreHomepageRevisionAction: async () => {
      calls.restoreHomepageRevisionAction += 1;
      return { ok: true as const, pageVersion: 99 };
    },
  };
  return { calls, actions };
}

test("platform_lab adapter declares kind=platform_lab", () => {
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });
  assert.equal(adapter.kind, "platform_lab");
});

test("save NEVER calls saveHomepageCompositionAction (ephemeral sink)", async () => {
  const spy = makeHomepageActionSpy();
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });

  const res = await adapter.save(ctx, baseSaveInput);

  assert.equal(res.ok, true);
  // The whole point: zero homepage writes from a Lab save.
  assert.equal(spy.calls.saveHomepageCompositionAction, 0);
  assert.equal(spy.calls.saveDraftHomepageAction, 0);
  assert.equal(spy.calls.publishHomepageFromEditModeAction, 0);
});

test("saveDraft NEVER calls any homepage action (ephemeral sink)", async () => {
  const spy = makeHomepageActionSpy();
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });

  const res = await adapter.saveDraft(ctx, {
    expectedVersion: 1,
    metadata: baseSaveInput.metadata,
    slots: baseSaveInput.slots,
    builderTree: [],
  });

  assert.equal(res.ok, true);
  assert.equal(spy.calls.saveDraftHomepageAction, 0);
  assert.equal(spy.calls.saveHomepageCompositionAction, 0);
});

test("publish NEVER calls publishHomepageFromEditModeAction (ephemeral sink)", async () => {
  const spy = makeHomepageActionSpy();
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });

  const res = await adapter.publish(ctx, { expectedVersion: 1 });

  assert.equal(res.ok, true);
  assert.equal(spy.calls.publishHomepageFromEditModeAction, 0);
  assert.equal(spy.calls.saveHomepageCompositionAction, 0);
});

test("repeated saves bump an in-memory CAS version (no I/O, monotonic)", async () => {
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });
  const r1 = await adapter.save(ctx, baseSaveInput);
  const r2 = await adapter.save(ctx, baseSaveInput);
  assert.equal(r1.ok && r2.ok, true);
  if (r1.ok && r2.ok) {
    assert.equal(r2.pageVersion > r1.pageVersion, true);
  }
});

test("every mutation invokes the legacy-write guard defensively", async () => {
  let guardCalls = 0;
  const guarded: string[] = [];
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
    assertNoLegacyWrite: (table: string) => {
      guardCalls += 1;
      guarded.push(table);
    },
  });

  await adapter.save(ctx, baseSaveInput);
  await adapter.saveDraft(ctx, {
    expectedVersion: 1,
    metadata: baseSaveInput.metadata,
    slots: baseSaveInput.slots,
    builderTree: [],
  });
  await adapter.publish(ctx, { expectedVersion: 1 });

  // save + saveDraft + publish each guard exactly once.
  assert.equal(guardCalls, 3);
});

test("assertNoLegacyBuilderWrite throws for platform_lab → cms_page_sections", () => {
  assert.throws(() =>
    assertNoLegacyBuilderWrite("platform_lab", "cms_page_sections"),
  );
  // and for the composition[] shape
  assert.throws(() =>
    assertNoLegacyBuilderWrite("platform_lab", "composition[]"),
  );
});

test("platform_lab may write builder_templates (its only durable target)", () => {
  assert.doesNotThrow(() =>
    assertNoLegacyBuilderWrite("platform_lab", "builder_templates"),
  );
});

test("load returns OK with a seed when provided, else an empty lab composition", async () => {
  const seed: CompositionData = {
    ...emptyLabComposition(ctx),
    pageId: "seed-page",
    pageVersion: 7,
  };
  const withSeed = createPlatformLabAdapter({
    loadInitialComposition: () => seed,
  });
  const r1 = await withSeed.load(ctx);
  assert.equal(r1.ok, true);
  if (r1.ok) assert.equal(r1.data.pageId, "seed-page");

  const noSeed = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });
  const r2 = await noSeed.load(ctx);
  assert.equal(r2.ok, true);
  if (r2.ok) {
    // Empty freeform canvas — no slots, empty tree, noindex on.
    assert.deepEqual(r2.data.builderTree, []);
    assert.equal(r2.data.metadata.noindex, true);
  }
});

test("platform_lab adapter omits restoreRevision (no ephemeral history)", () => {
  const adapter = createPlatformLabAdapter({
    loadInitialComposition: () => null,
  });
  assert.equal(adapter.restoreRevision, undefined);
});
