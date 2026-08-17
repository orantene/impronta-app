/**
 * The slider inspector — barrel.
 *
 * `builder-node-content.tsx` imports from here only, so the surface this
 * folder exposes to the god file is one line rather than three deep paths.
 */

export {
  CarouselSettingsPanel,
  type CarouselSettingsPanelProps,
} from "./carousel-settings-panel";
export {
  CAROUSEL_GROUP_ORDER,
  CAROUSEL_GROUP_SEARCH_TERMS,
  CAROUSEL_GROUP_TITLES,
  carouselGroupsFor,
  firstOpenCarouselGroup,
  hasCarouselGroup,
  type CarouselGroupId,
  type CarouselVariant,
} from "./carousel-groups";
