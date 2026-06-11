/**
 * Homepage surface adapter — a PURE PASS-THROUGH over the existing four
 * homepage composition actions + the two restore actions.
 *
 * Every method forwards its arguments to the legacy action with NO
 * transformation, so the homepage path through the seam is provably identical
 * to calling those actions directly. The parity test
 * (`builder-core/homepage-adapter-parity.test.ts`) constructs the adapter with
 * the DI factory below + spy actions and asserts each method forwards the exact
 * same argument object to the exact same action and returns its result
 * unchanged — without pulling in the heavy server-action / DB module graph.
 *
 * This is the only adapter allowed to write legacy slot composition
 * (`cms_page_sections`) — it IS the frozen legacy homepage path, just wrapped.
 * It therefore does NOT call `assertNoLegacyBuilderWrite` (that guard is for
 * the new freeform surfaces).
 */

import {
  loadHomepageCompositionAction,
  saveHomepageCompositionAction,
  saveDraftHomepageAction,
  publishHomepageFromEditModeAction,
  type CompositionLoadResult,
  type CompositionSaveInput,
  type CompositionSaveResult,
  type SaveDraftResult,
  type PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import {
  restoreHomepageRevisionAction,
  restorePageRevisionAction,
  type RevisionRestoreResult,
} from "@/lib/site-admin/edit-mode/revisions-actions";

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceRestoreInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";

/**
 * The exact action surface the homepage adapter wraps. Injected so the parity
 * test can prove pass-through with spies; production binds the real actions.
 */
export interface HomepageAdapterActions {
  load: (input: {
    locale: string;
    pageSlug?: string | null;
  }) => Promise<CompositionLoadResult>;
  save: (input: CompositionSaveInput) => Promise<CompositionSaveResult>;
  saveDraft: (input: {
    locale: string;
    pageId?: string | null;
    expectedVersion: number;
    metadata: CompositionSaveInput["metadata"];
    slots: CompositionSaveInput["slots"];
    builderTree?: CompositionSaveInput["builderTree"];
    styleClasses?: BuilderSurfaceSaveDraftInput["styleClasses"];
  }) => Promise<SaveDraftResult>;
  publish: (input: {
    locale: string;
    pageId?: string | null;
    expectedVersion: number;
    styleClasses?: BuilderSurfacePublishInput["styleClasses"];
  }) => Promise<PublishResult>;
  restoreHomepageRevision: (input: {
    revisionId: string;
    locale: string;
    expectedVersion: number;
  }) => Promise<RevisionRestoreResult>;
  restorePageRevision: (input: {
    revisionId: string;
    pageId: string;
    expectedVersion: number;
  }) => Promise<RevisionRestoreResult>;
}

/**
 * Build the homepage adapter over a given action surface. The methods do NO
 * argument transformation beyond folding the ctx fields (locale / pageId /
 * pageSlug) into the shape each action already expects — exactly what the
 * legacy edit-context call-sites did inline.
 */
export function createHomepageAdapter(
  actions: HomepageAdapterActions,
): BuilderSurfaceAdapter {
  return {
    kind: "homepage",

    load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      // Identical to the existing edit-context load call:
      //   loadHomepageCompositionAction({ locale, pageSlug })
      return actions.load({ locale: ctx.locale, pageSlug: ctx.pageSlug });
    },

    save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      // The save envelope already carries locale + pageId; pass it straight
      // through, threading ctx.locale / ctx.pageId so the call-site can keep
      // handing us the same envelope it built, byte-for-byte unchanged.
      return actions.save({ ...input, locale: ctx.locale, pageId: ctx.pageId });
    },

    saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      return actions.saveDraft({
        locale: ctx.locale,
        pageId: ctx.pageId,
        expectedVersion: input.expectedVersion,
        metadata: input.metadata,
        slots: input.slots,
        builderTree: input.builderTree,
        styleClasses: input.styleClasses,
      });
    },

    publish(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      return actions.publish({
        locale: ctx.locale,
        pageId: ctx.pageId,
        expectedVersion: input.expectedVersion,
        styleClasses: input.styleClasses,
      });
    },

    restoreRevision(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceRestoreInput,
    ): Promise<RevisionRestoreResult> {
      // Mirrors the existing edit-context branch exactly: a non-homepage page
      // (pageSlug + pageId both present) restores by pageId; the homepage
      // restores by locale.
      if (ctx.pageSlug && ctx.pageId) {
        return actions.restorePageRevision({
          revisionId: input.revisionId,
          pageId: ctx.pageId,
          expectedVersion: input.expectedVersion,
        });
      }
      return actions.restoreHomepageRevision({
        revisionId: input.revisionId,
        locale: ctx.locale,
        expectedVersion: input.expectedVersion,
      });
    },
  };
}

/** The production homepage adapter — bound to the real homepage server actions. */
export const homepageAdapter: BuilderSurfaceAdapter = createHomepageAdapter({
  load: loadHomepageCompositionAction,
  save: saveHomepageCompositionAction,
  saveDraft: saveDraftHomepageAction,
  publish: publishHomepageFromEditModeAction,
  restoreHomepageRevision: restoreHomepageRevisionAction,
  restorePageRevision: restorePageRevisionAction,
});
