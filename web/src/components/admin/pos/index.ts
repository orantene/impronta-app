/**
 * index.ts — barrel for the Counter's presentational components (T4).
 *
 * Everything here takes props and emits callbacks; none of it fetches data.
 * A future wiring task maps `lib/pos/*` results onto these prop shapes —
 * see `pos-types.ts`'s header for how closely the field names already track
 * the engine's.
 */

export { PosFrame, type PosFrameProps } from "./PosFrame";
export {
  SellSurface,
  ALL_CATEGORIES_ID,
  type SellSurfaceProps,
  type SellSurfaceCopy,
} from "./SellSurface";
export { Basket, type BasketProps, type BasketCopy } from "./Basket";
export {
  CustomerPanel,
  type CustomerPanelProps,
  type CustomerPanelCopy,
} from "./CustomerPanel";
export {
  CollectSheet,
  type CollectSheetProps,
  type CollectSheetCopy,
} from "./CollectSheet";
export { PaidScreen, type PaidScreenProps, type PaidScreenCopy } from "./PaidScreen";
export {
  HeldSalesList,
  type HeldSalesListProps,
  type HeldSalesListCopy,
} from "./HeldSalesList";
export { ShiftBar, type ShiftBarProps, type ShiftBarCopy } from "./ShiftBar";
export {
  PosRefusalBanner,
  type PosRefusalBannerProps,
  type PosRefusalCopy,
} from "./PosRefusalBanner";

export * from "./pos-types";
export { basketTotals, changeDueCents, tenderIsShort } from "./pos-math";
export type { Translator } from "./translator";
export {
  railCopy,
  railNavLabel,
  sellSurfaceCopy,
  basketCopy,
  customerPanelCopy,
  collectSheetCopy,
  collectMethodUnavailableCopy,
  paidScreenCopy,
  heldSalesListCopy,
  shiftBarCopy,
  refusalCopy,
  counterPageCopy,
  posModeLabel,
  type PosCounterPageCopy,
} from "./pos-copy";
