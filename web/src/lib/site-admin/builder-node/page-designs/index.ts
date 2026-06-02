/**
 * Page-design templates — productised full-page starter designs.
 *
 * These are the same hand-authored BuilderNode trees the fidelity harness
 * scores at ~90 (the harness re-exports them from here), now registered as
 * one-click page-builder presets a tenant can pick. Each is a single-root
 * `container` exercising the real capability stack — registry fonts, real
 * photography, P3 repeaters, rich_text, pricing_table, nav, hover/scroll
 * motion — so "the engine can mimic any design" becomes "here are designs you
 * can drop onto a page and edit."
 */

import type { PageDesign } from "./types";
import { editorialDesign } from "./editorial";
import { agencyDesign } from "./agency";
import { saasDesign } from "./saas";
import { storeDesign } from "./store";
import { festivalDesign } from "./festival";
import { studioDesign } from "./studio";
import { noirDesign } from "./noir";

export type { PageDesign, PageDesignArchetype } from "./types";
export {
  expandBuilderRepeaters,
  cloneBuilderTreeWithFreshIds,
  bakePageDesignTree,
} from "./expand-repeaters";
export { PAGE_DESIGN_PHOTOS, pageDesignPhoto } from "./photos";
export type { PageDesignPhotoKey } from "./photos";

export {
  editorialDesign,
  agencyDesign,
  saasDesign,
  storeDesign,
  festivalDesign,
  studioDesign,
  noirDesign,
};

/** Registry order = display order in the template picker. */
export const PAGE_DESIGNS: ReadonlyArray<PageDesign> = [
  editorialDesign,
  agencyDesign,
  saasDesign,
  storeDesign,
  festivalDesign,
  studioDesign,
  noirDesign,
];

export function getPageDesign(id: string): PageDesign | undefined {
  return PAGE_DESIGNS.find((design) => design.id === id);
}
