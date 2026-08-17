/**
 * section-live-data.ts — Marathon W2-T2.
 *
 * A CLIENT-SAFE resolver for `SectionMeta.hasLiveData`, keyed by section type.
 *
 * Why a dedicated module (not `getSectionType` / `section-meta-registry`):
 * both of those import the full `SECTION_REGISTRY`, which references every
 * section's `Component.tsx` — including async SERVER components. Pulling that
 * into the client editor (`edit-context.tsx`) would drag server-only code into
 * the client bundle. Each section's `meta.ts`, by contrast, imports only
 * `type SectionMeta` (zero runtime, zero server deps), so aggregating the metas
 * here is safe to import from a `"use client"` module.
 *
 * The `hasLiveData` boolean on each imported meta is the SINGLE source of truth.
 * The canonical data-bound set (and that none of these tags drift away from the
 * async-Component scan) is independently enforced by
 * `section-meta-live-data.test.ts` (W0-T5d), which also asserts this module's
 * derived set equals the canonical async-derived set.
 */
import { directoryMeta } from "./directory/meta";
import { featuredTalentMeta } from "./featured_talent/meta";
import { heroSearchMeta } from "./hero_search/meta";
import { joinRegisterMeta } from "./join_register/meta";
import { locationDiscoveryMeta } from "./location_discovery/meta";
import { siteFooterMeta } from "./site_footer/meta";
import { siteHeaderMeta } from "./site_header/meta";
import { talentTypeGridMeta } from "./talent_type_grid/meta";
// WS-A A5 — async (server-data-loader) header-widget embeds.
import { headerAccountMeta } from "./header_account/meta";
import { headerInquiryMeta } from "./header_inquiry/meta";
import { headerFavoritesMeta } from "./header_favorites/meta";
import { headerSearchMeta } from "./header_search/meta";
import { headerLanguageMeta } from "./header_language/meta";
import type { SectionMeta } from "./types";

/**
 * The data-bound (server-data-loader) section metas. Each carries
 * `hasLiveData: true`; an in-editor prop edit to one of these does NOT reach the
 * on-screen island until the server re-renders, so the curated save path must
 * still `queueRouterRefresh()` for them.
 */
const LIVE_DATA_METAS: ReadonlyArray<SectionMeta> = [
  directoryMeta,
  featuredTalentMeta,
  heroSearchMeta,
  joinRegisterMeta,
  locationDiscoveryMeta,
  siteFooterMeta,
  siteHeaderMeta,
  talentTypeGridMeta,
  headerAccountMeta,
  headerInquiryMeta,
  headerFavoritesMeta,
  headerSearchMeta,
  headerLanguageMeta,
];

/** Section type keys whose meta is tagged `hasLiveData:true`. Derived, not hand-listed. */
export const LIVE_DATA_SECTION_TYPE_KEYS: ReadonlySet<string> = new Set(
  LIVE_DATA_METAS.filter((m) => m.hasLiveData === true).map((m) => m.key),
);

/**
 * True when a curated section of this type renders against server-resolved live
 * data → its on-screen island needs a `router.refresh()` after a prop edit.
 * False (the default for every pure-render section) → the client-canvas snapshot
 * already reflects the prop change, so the refresh can be skipped (instant paint).
 */
export function sectionTypeHasLiveData(sectionTypeKey: string): boolean {
  return LIVE_DATA_SECTION_TYPE_KEYS.has(sectionTypeKey);
}
