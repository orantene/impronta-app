/**
 * Page-design templates — productised full-page starter designs.
 *
 * These are the same hand-authored BuilderNode trees the fidelity harness
 * scores at ~90 (the harness re-exports them from here), now registered as
 * one-click page-builder presets a tenant can pick. Each is a single-root
 * `container` (EXCEPT `impronta`, which is intentionally MULTI-ROOT — a
 * top-level array of section nodes so the editor renders it without the
 * empty-recovery quirk) exercising the real capability stack — registry fonts,
 * real photography, P3 repeaters, rich_text, pricing_table, nav, hover/scroll
 * motion — so "the engine can mimic any design" becomes "here are designs you
 * can drop onto a page and edit."
 */

import type { PageDesign } from "./types";
import { improntaDesign } from "./impronta";
import { editorialDesign } from "./editorial";
import { agencyDesign } from "./agency";
import { saasDesign } from "./saas";
import { storeDesign } from "./store";
import { storeOrderableDesign } from "./store-orderable";
import { festivalDesign } from "./festival";
import { studioDesign } from "./studio";
import { noirDesign } from "./noir";
import { restaurantDesign } from "./restaurant";
import { restaurantOrderableDesign } from "./restaurant-orderable";
import { conferenceDesign } from "./conference";
import { coachDesign } from "./coach";

export type { PageDesign, PageDesignArchetype } from "./types";
export {
  expandBuilderRepeaters,
  cloneBuilderTreeWithFreshIds,
  bakePageDesignTree,
} from "./expand-repeaters";
export { PAGE_DESIGN_PHOTOS, pageDesignPhoto } from "./photos";
export type { PageDesignPhotoKey } from "./photos";

export {
  improntaDesign,
  editorialDesign,
  agencyDesign,
  saasDesign,
  storeDesign,
  storeOrderableDesign,
  festivalDesign,
  studioDesign,
  noirDesign,
  restaurantDesign,
  restaurantOrderableDesign,
  conferenceDesign,
  coachDesign,
};

/** Registry order = display order in the template picker. */
export const PAGE_DESIGNS: ReadonlyArray<PageDesign> = [
  improntaDesign,
  editorialDesign,
  agencyDesign,
  saasDesign,
  storeDesign,
  storeOrderableDesign,
  festivalDesign,
  studioDesign,
  noirDesign,
  restaurantDesign,
  restaurantOrderableDesign,
  conferenceDesign,
  coachDesign,
];

export function getPageDesign(id: string): PageDesign | undefined {
  return PAGE_DESIGNS.find((design) => design.id === id);
}
