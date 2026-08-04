/**
 * Homepage adapter — PURE FACTORY (no runtime imports).
 *
 * This module holds only the `HomepageAdapterActions` shape + the
 * `createHomepageAdapter` dependency-injection factory. It imports the
 * composition / revision modules for TYPES ONLY (`import type`), so it pulls in
 * NONE of the heavy server-action / DB / React-component (CSS) module graph at
 * runtime. That is what lets `homepage-adapter-parity.test.ts` import the
 * factory under a bare `tsx --test` run and prove pass-through with spies.
 *
 * The production binding (real server actions) lives in `homepage-adapter.ts`,
 * which re-exports these symbols.
 */

import type {
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { RevisionRestoreResult } from "@/lib/site-admin/edit-mode/revisions-actions";

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
    /** STYLE-1 — persisted in the draft revision snapshot alongside styleClasses. */
    stylePresets?: BuilderSurfaceSaveDraftInput["stylePresets"];
    editSession?: BuilderSurfaceSaveDraftInput["editSession"];
  }) => Promise<SaveDraftResult>;
  publish: (input: {
    locale: string;
    pageId?: string | null;
    expectedVersion: number;
    styleClasses?: BuilderSurfacePublishInput["styleClasses"];
    /** STYLE-1 — published alongside styleClasses. */
    stylePresets?: BuilderSurfacePublishInput["stylePresets"];
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
      // pageId is only a target for NON-homepage pages (pageSlug set). The
      // homepage load returns its real row id too, but forwarding it routes
      // the save into the generic `if (input.pageId)` branch, skipping the
      // hardened homepage lane (LWW beacon adoption, content-aware empty
      // guard, introTagline). Same normalization the publish drawer applies.
      return actions.save({
        ...input,
        locale: ctx.locale,
        pageId: ctx.pageSlug ? ctx.pageId : null,
      });
    },

    saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      return actions.saveDraft({
        locale: ctx.locale,
        pageId: ctx.pageSlug ? ctx.pageId : null,
        expectedVersion: input.expectedVersion,
        metadata: input.metadata,
        slots: input.slots,
        builderTree: input.builderTree,
        styleClasses: input.styleClasses,
        stylePresets: input.stylePresets,
        editSession: input.editSession,
      });
    },

    publish(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      return actions.publish({
        locale: ctx.locale,
        pageId: ctx.pageSlug ? ctx.pageId : null,
        expectedVersion: input.expectedVersion,
        styleClasses: input.styleClasses,
        stylePresets: input.stylePresets,
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
