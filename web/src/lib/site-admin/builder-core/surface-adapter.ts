/**
 * BuilderSurfaceAdapter — the seam that lets ONE Page Builder Core (the
 * 7782-line EditProvider) persist against many surfaces via config only.
 *
 * The adapter speaks the EXISTING `CompositionData` lingua franca (from
 * `edit-mode/composition-actions.ts`) for every payload it accepts and
 * returns. That is the whole trick: the provider's internals — slots,
 * builderTree, metadata, CAS version — stay byte-for-byte unchanged, and a
 * surface differs only in WHICH `load/save/saveDraft/publish/restoreRevision`
 * implementation runs behind the seam.
 *
 * The `homepage` adapter is a PURE pass-through over the four existing
 * homepage actions + the two restore actions — so the homepage path is
 * provably identical to calling those actions directly (see
 * `adapters/homepage-adapter.ts` + the parity test).
 *
 * Non-homepage adapters (workspace_page / talent_page / platform_lab, built by
 * WS5/WS6) implement the same interface against pure-freeform tables and MUST
 * call `assertNoLegacyBuilderWrite(kind, table)` in their `save`/`publish`.
 */

import type {
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { RevisionRestoreResult } from "@/lib/site-admin/edit-mode/revisions-actions";
import type { BuilderStyleClassRegistry } from "@/lib/site-admin/builder-node/style-classes";

import type { BuilderSurfaceKind } from "./surface-kind";

/**
 * Runtime context threaded into every adapter call. This mirrors exactly what
 * the existing edit-context call-sites already have in hand (locale + pageSlug
 * + pageId), so wiring a call-site through the adapter is a 1:1 swap with no
 * new state. Each adapter reads only the fields its surface needs:
 *
 *   - homepage uses `locale` (+ `pageSlug`/`pageId` for the generalised
 *     non-homepage page path the homepage actions already support).
 *   - freeform surfaces key off `pageId`.
 *   - platform_lab ignores persistence ctx (ephemeral sink).
 */
export interface BuilderSurfaceContext {
  /** Storefront-resolved locale for the request. */
  locale: string;
  /** Non-null when the editor is on a non-homepage page identified by slug. */
  pageSlug?: string | null;
  /** Non-null when a concrete `cms_pages.id` (or surface page id) is known. */
  pageId?: string | null;
}

/** Input the seam accepts for an explicit "Save draft" checkpoint. Mirrors the
 *  existing `saveDraftHomepageAction` argument minus the ctx fields (locale /
 *  pageId), which the adapter sources from `BuilderSurfaceContext`. */
export interface BuilderSurfaceSaveDraftInput {
  expectedVersion: number;
  metadata: CompositionSaveInput["metadata"];
  slots: CompositionSaveInput["slots"];
  builderTree?: CompositionSaveInput["builderTree"];
  styleClasses?: BuilderStyleClassRegistry;
}

/** Input the seam accepts for a Publish. Mirrors `publishHomepageFromEditModeAction`
 *  minus the ctx fields. */
export interface BuilderSurfacePublishInput {
  expectedVersion: number;
  styleClasses?: BuilderStyleClassRegistry;
}

/** Input the seam accepts for a revision restore. */
export interface BuilderSurfaceRestoreInput {
  revisionId: string;
  expectedVersion: number;
}

/**
 * The surface adapter. One instance per surface kind. The `save` method takes
 * the full `CompositionSaveInput` (the same envelope `saveHomepageCompositionAction`
 * accepts) so the optimistic-save / undo-redo / create-and-insert call-sites
 * route through it unchanged; the lighter `saveDraft` / `publish` /
 * `restoreRevision` take the trimmed inputs above.
 */
export interface BuilderSurfaceAdapter {
  /** Surface discriminator — drives the legacy-write guard + config defaults. */
  readonly kind: BuilderSurfaceKind;

  /** Load the draft-first composition for this surface. */
  load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult>;

  /** Persist a composition mutation atomically (CAS on expectedVersion). */
  save(
    ctx: BuilderSurfaceContext,
    input: CompositionSaveInput,
  ): Promise<CompositionSaveResult>;

  /** Explicit "Save draft" checkpoint — writes a fresh draft revision. */
  saveDraft(
    ctx: BuilderSurfaceContext,
    input: BuilderSurfaceSaveDraftInput,
  ): Promise<SaveDraftResult>;

  /** Publish the current draft to the surface's live target. */
  publish(
    ctx: BuilderSurfaceContext,
    input: BuilderSurfacePublishInput,
  ): Promise<PublishResult>;

  /**
   * Roll the draft back to a saved revision. Optional — a surface with no
   * revision history (e.g. an ephemeral lab) may omit it; call-sites guard on
   * its presence.
   */
  restoreRevision?(
    ctx: BuilderSurfaceContext,
    input: BuilderSurfaceRestoreInput,
  ): Promise<RevisionRestoreResult>;
}
