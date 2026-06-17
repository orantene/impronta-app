/**
 * Platform Lab adapter — PURE FACTORY (no runtime imports).
 *
 * This is the WS5 ephemeral surface adapter for the Platform Builder Lab. Like
 * `homepage-adapter-core.ts`, it holds ONLY the DI factory + type-only imports,
 * so it pulls in NONE of the heavy server-action / DB / React-component (CSS)
 * module graph at runtime. That is what lets `platform-lab-adapter.test.ts`
 * import the factory under a bare `tsx --test` run and prove — with a spy action
 * set — that the Lab's `save` / `saveDraft` / `publish` NEVER call
 * `saveHomepageCompositionAction` (or any homepage / cms write).
 *
 * EPHEMERAL PERSISTENCE is the whole point. The Lab is a workshop: a super_admin
 * loads a real subject (talent / workspace) into the canvas, edits freely, and
 * the only durable output is a `builder_templates` row written through the WS2
 * registry actions ("Save as page template" / "Save section as gallery item").
 * The builder's own autosave / Save / Publish MUST go to a no-op sink so the Lab
 * can never mutate a live homepage / page. Every mutation:
 *
 *   1. Calls `assertNoLegacyBuilderWrite("platform_lab", <table>)` defensively —
 *      a regression that ever pointed this adapter at `cms_page_sections` /
 *      `composition[]` throws loudly instead of silently corrupting page data.
 *   2. Returns a synthetic OK result with a monotonically-incremented in-memory
 *      version (so the editor's CAS / "Saved" affordance behaves), touching no
 *      I/O whatsoever.
 *
 * The production binding (which provides the seed composition) lives in
 * `platform-lab-adapter.ts`, which re-exports `createPlatformLabAdapter`.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";
import { assertNoLegacyBuilderWrite } from "../legacy-write-guard";

/**
 * The (tiny) dependency surface the Lab adapter needs. Everything is pure /
 * in-memory — there is deliberately NO action set here (unlike the homepage
 * adapter), because the Lab must never reach a server action. The spy test
 * injects its OWN homepage-action spy alongside this adapter and asserts the
 * adapter never touches it.
 */
export interface PlatformLabAdapterDeps {
  /**
   * Produces the seed composition the editor loads with. The Lab builds this
   * from the chosen preview subject (or an empty freeform canvas). Pure — no
   * DB read. Returns `null` to signal "start from the editor's empty default".
   */
  loadInitialComposition: (ctx: BuilderSurfaceContext) => CompositionData | null;
  /**
   * The legacy-write guard, injected so the test can assert it is invoked on
   * every mutation. Defaults to the real `assertNoLegacyBuilderWrite`.
   */
  assertNoLegacyWrite?: (table: string) => void;
}

/**
 * Build the ephemeral platform_lab adapter. Persistence is a no-op sink: the
 * returned adapter satisfies the full `BuilderSurfaceAdapter` contract but
 * `save` / `saveDraft` / `publish` only bump an in-memory version and return a
 * synthetic OK — they NEVER call a homepage / cms action.
 */
export function createPlatformLabAdapter(
  deps: PlatformLabAdapterDeps,
): BuilderSurfaceAdapter {
  const guard =
    deps.assertNoLegacyWrite ??
    ((table: string) => assertNoLegacyBuilderWrite("platform_lab", table));

  // In-memory CAS counter. The editor's optimistic-save loop expects the
  // server version to advance on each successful write; we advance this purely
  // in memory so the editor "feels" persisted while nothing is written.
  let ephemeralVersion = 1;

  function bumpVersion(): number {
    ephemeralVersion += 1;
    return ephemeralVersion;
  }

  return {
    kind: "platform_lab",

    load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      const seed = deps.loadInitialComposition(ctx);
      if (seed) {
        ephemeralVersion = seed.pageVersion;
        return Promise.resolve({ ok: true, data: seed });
      }
      // No seed → the editor falls back to its own empty composition. We still
      // resolve OK with a minimal ephemeral composition so the Lab canvas
      // mounts rather than showing a load error.
      return Promise.resolve({ ok: true, data: emptyLabComposition(ctx) });
    },

    save(
      _ctx: BuilderSurfaceContext,
      _input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      // EPHEMERAL: defensively guard, then no-op. The Lab's autosave + the
      // optimistic-save call-site route here; nothing is persisted.
      guard("platform_lab_ephemeral_sink");
      return Promise.resolve({ ok: true, pageVersion: bumpVersion() });
    },

    saveDraft(
      _ctx: BuilderSurfaceContext,
      _input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      guard("platform_lab_ephemeral_sink");
      return Promise.resolve({
        ok: true,
        pageVersion: bumpVersion(),
        savedAt: new Date().toISOString(),
      });
    },

    publish(
      _ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      // The Lab has no "publish to a live page" concept — publishing a TEMPLATE
      // goes through the WS2 registry actions from the header, not here. This
      // header-Publish path is a no-op sink so an accidental press never ships.
      guard("platform_lab_ephemeral_sink");
      return Promise.resolve({
        ok: true,
        pageVersion: bumpVersion(),
        publishedAt: new Date().toISOString(),
      });
    },

    // NB: no `restoreRevision` — the ephemeral Lab keeps no revision history.
    // The editor guards on the method's presence, so omitting it disables the
    // "Restore revision" affordance on this surface (correct: nothing to
    // restore from a no-op sink).
  };
}

/**
 * A minimal empty freeform composition for the Lab canvas. Pure constructor —
 * no I/O. Used when the chosen subject has no seed composition (e.g. before a
 * subject is picked, or a blank "new template" canvas).
 */
export function emptyLabComposition(
  ctx: BuilderSurfaceContext,
): CompositionData {
  return {
    locale: ctx.locale as CompositionData["locale"],
    pageId: "platform-lab-ephemeral",
    pageVersion: 1,
    liveSitePublishedAt: null,
    metadata: {
      title: "Builder Lab",
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: true,
      // SEO-1 contract field. platform_lab has no public SSR surface
      // (capabilities.seo === false), so structured data is always null here.
      jsonLd: null,
    },
    slots: {},
    builderTree: [],
    slotDefs: [],
    library: [],
    availableLocales: [ctx.locale as CompositionData["locale"]],
  };
}
