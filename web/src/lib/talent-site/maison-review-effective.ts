/**
 * TUL-658: what "Review your website" names as the design.
 *
 * On a PUBLISHED site a Design change writes only `pending_design`
 * (live_pending); the row's `theme_design_slug` keeps the live design until
 * Publish. Review must show the pending (draft) design, flag it as an
 * unpublished draft, and say what Undo goes back to. Pure.
 */
import { isMaisonPendingUndo } from "./server/maison-design-snapshot";
import { isMaisonLivePending } from "./server/maison-pending-design";

export type ReviewRowDesign = {
  designSlug: string | null;
  lookSlug: string | null;
};

export type ReviewEffectiveDesign = {
  designSlug: string | null;
  lookSlug: string | null;
  /** Maison palette key from a pending proposal; null = use the row look. */
  paletteKey: string | null;
  customPalette: unknown;
  contentMode: "demo" | "mine" | null;
  /** The shown design is a draft that is not on the public site yet. */
  unpublishedDraft: boolean;
  /** "snapshot" = never-published apply Undo; "live" = discard pending. */
  undoKind: "snapshot" | "live" | null;
  /** Design slug Undo returns to (null when unknown). */
  undoRevertsToSlug: string | null;
};

export function effectiveReviewDesign(
  row: ReviewRowDesign,
  pending: unknown,
  sitePublished: boolean,
): ReviewEffectiveDesign {
  if (isMaisonLivePending(pending)) {
    const p = pending.proposed;
    return {
      designSlug: p.designSlug || row.designSlug,
      lookSlug: p.customPalette ? null : p.lookSlug,
      paletteKey: p.customPalette ? null : p.paletteKey,
      customPalette: p.customPalette ?? null,
      contentMode: p.contentMode === "mine" ? "mine" : "demo",
      unpublishedDraft: true,
      undoKind: "live",
      undoRevertsToSlug:
        pending.undoDraft?.theme_design_slug ?? pending.liveBaseline.theme_design_slug ?? row.designSlug,
    };
  }
  if (isMaisonPendingUndo(pending)) {
    return {
      designSlug: row.designSlug,
      lookSlug: row.lookSlug,
      paletteKey: null,
      customPalette: null,
      contentMode: null,
      unpublishedDraft: !sitePublished,
      undoKind: "snapshot",
      undoRevertsToSlug: pending.previous.theme_design_slug,
    };
  }
  return {
    designSlug: row.designSlug,
    lookSlug: row.lookSlug,
    paletteKey: null,
    customPalette: null,
    contentMode: null,
    unpublishedDraft: false,
    undoKind: null,
    undoRevertsToSlug: null,
  };
}
