/**
 * promote-to-starter.ts — A5 (Builder Lab polish, Phase 6).
 *
 * Pure resolver behind the Playground's one-click "Promote to starter" action.
 * Given a Playground draft row it decides:
 *   1. Whether the draft is PROMOTABLE to a published page-templates starter.
 *   2. What `gallery_tab` + `target_context` the row must carry so it lands in
 *      the live builders' "+" Add → Page Templates tab with a sane scope.
 *   3. Whether an `updateTemplateDraft` patch is actually needed before publish
 *      (skip the write when the row is already correctly tagged).
 *
 * Kept a plain, side-effect-free module (NOT "use server", no React) so it is
 * unit-testable in the node runner and callable from the client row action — the
 * UI calls `updateTemplateDraft` (only when `patch` is non-null) then
 * `publishTemplate`, both of which already run `validateTemplateForPublish`
 * server-side. This module never reimplements validation or the publish write.
 */

import type {
  BuilderGalleryTab,
  BuilderTemplateKind,
  BuilderTemplateRow,
  BuilderTemplateStatus,
  BuilderTemplateTarget,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

/** The gallery tab a promoted starter must live in — the live builders' "+"
 *  Add → Page Templates tab. */
const STARTER_GALLERY_TAB: BuilderGalleryTab = "page_templates";

/** Targets valid for a page-template starter scope. `platform` is a shell-only
 *  scope and is coerced to `both` (offer it on both surfaces) when promoting. */
type StarterTarget = Exclude<BuilderTemplateTarget, "platform">;

/** A draft is a promotable page-template starter only when its kind is
 *  `page_template`. Shell (header/footer) drafts have their own A7 apply flow
 *  and never become page-template starters. */
function isPageTemplateKind(kind: BuilderTemplateKind): boolean {
  return kind === "page_template";
}

/** Map any target_context onto a sane page-template starter scope: keep
 *  talent/workspace/both; coerce the shell-only `platform` scope to `both`. */
export function coerceStarterTarget(
  target: BuilderTemplateTarget,
): StarterTarget {
  return target === "platform" ? "both" : target;
}

/** Why a draft cannot be promoted (when `promotable` is false). */
export type PromoteBlockReason = "not-page-template" | "archived" | "already-published-current";

export interface PromoteToStarterPlan {
  /** True when the draft can be promoted to a published starter. */
  promotable: boolean;
  /** Present only when `promotable` is false — a stable machine code the UI maps
   *  to an inline message. */
  blockedReason?: PromoteBlockReason;
  /**
   * The `updateTemplateDraft` patch to apply BEFORE publishing, or null when the
   * row is already tagged correctly (gallery_tab + target_context). Only the keys
   * that actually need to change are included, so a no-op write is never issued.
   */
  patch:
    | {
        gallery_tab?: BuilderGalleryTab;
        target_context?: StarterTarget;
      }
    | null;
  /** The final gallery_tab the published starter will carry. */
  resolvedGalleryTab: BuilderGalleryTab;
  /** The final target_context the published starter will carry. */
  resolvedTarget: StarterTarget;
}

/**
 * Decide how to promote a Playground draft into a published page-templates
 * starter. Pure: inspects the row, returns the plan. The caller applies
 * `patch` (if non-null) via `updateTemplateDraft`, then calls `publishTemplate`
 * — which runs `validateTemplateForPublish` and surfaces reasons on failure.
 *
 * Blocks (promotable=false) when:
 *   - the draft is not a `page_template` kind (shell drafts use the A7 flow), or
 *   - the draft is archived (revive it before promoting).
 *
 * A draft already `published` is still promotable (re-publish bumps the version
 * — a legitimate operation), as long as it is a page template.
 */
export function planPromoteToStarter(
  row: Pick<
    BuilderTemplateRow,
    "kind" | "status" | "gallery_tab" | "target_context"
  >,
): PromoteToStarterPlan {
  const resolvedGalleryTab = STARTER_GALLERY_TAB;
  const resolvedTarget = coerceStarterTarget(row.target_context);

  if (!isPageTemplateKind(row.kind)) {
    return {
      promotable: false,
      blockedReason: "not-page-template",
      patch: null,
      resolvedGalleryTab,
      resolvedTarget,
    };
  }

  if (isArchived(row.status)) {
    return {
      promotable: false,
      blockedReason: "archived",
      patch: null,
      resolvedGalleryTab,
      resolvedTarget,
    };
  }

  // Build the minimal patch — only the keys that actually differ from the row.
  const patch: { gallery_tab?: BuilderGalleryTab; target_context?: StarterTarget } =
    {};
  if (row.gallery_tab !== resolvedGalleryTab) {
    patch.gallery_tab = resolvedGalleryTab;
  }
  if (row.target_context !== resolvedTarget) {
    patch.target_context = resolvedTarget;
  }

  return {
    promotable: true,
    patch: Object.keys(patch).length > 0 ? patch : null,
    resolvedGalleryTab,
    resolvedTarget,
  };
}

function isArchived(status: BuilderTemplateStatus): boolean {
  return status === "archived";
}

/** Operator-readable copy for a block reason (inline, never toast-and-vanish). */
export function promoteBlockMessage(reason: PromoteBlockReason): string {
  switch (reason) {
    case "not-page-template":
      return "Only full-page drafts can be promoted to a starter. Shell drafts apply to a tenant's header/footer instead.";
    case "archived":
      return "This draft is archived. Restore it before promoting it to a starter.";
    case "already-published-current":
      return "This starter is already published with no changes since the last version.";
  }
}
