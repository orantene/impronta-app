/**
 * freeform-compat.ts — W3 (all-freeform rebuild).
 *
 * The Impronta rebuild is going all-freeform (BuilderNode pages only). The
 * "+" Add Gallery is already freeform-only by construction — `insert.ts`'s
 * `assertAddGalleryBuilderTreeOnly` throws on any legacy slot insert — so
 * every card in the gallery DOES insert into the freeform tree. The
 * remaining risk is narrower: a card that inserts successfully but produces
 * a node (or subtree) that doesn't actually WORK once it lands — it fails
 * builder-tree validation, or it lands as an empty/misconfigured connected
 * component that shows a "finish configuring" placeholder instead of content.
 *
 * This is a STATIC map, keyed by `AddGalleryItem.id`, of every gallery item
 * currently known to have that problem. It exists so the gallery can flag
 * the card in the UI (red border + badge, see `add-gallery-cards.tsx` /
 * `add-gallery-card-meta.tsx`) without blocking insertion — an operator can
 * still add it, but now knows to double-check or avoid it until it's fixed
 * or converted.
 *
 * SOURCE OF TRUTH for what belongs here: `freeform-compat-sweep.test.ts`.
 * That test resolves the REAL insert payload for every available gallery
 * item (via `resolveAddGalleryInsertAction`, the same function the live
 * gallery calls), splices it into an empty page tree, and checks it against
 * `validateBuilderNodeTree` + a smoke render. The test asserts this map is
 * exactly the set of items that fail that sweep — no more (stale entries
 * left in after a fix), no less (a newly-broken item slips in unflagged).
 * Update this map, then re-run the sweep to confirm it goes green again.
 *
 * `note` is shown to the operator (info tooltip on the card) — keep it one
 * short, plain-language sentence. No jargon, no em dashes.
 */
export interface FreeformIncompatibilityInfo {
  note: string;
}

export const FREEFORM_INCOMPATIBLE: Record<string, FreeformIncompatibilityInfo> = {
  "el-icon-card": {
    note:
      "This card's icon does not save. Cards only support a heading, text, image, and button, so the icon inside this layout gets dropped.",
  },
};
