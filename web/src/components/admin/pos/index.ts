/**
 * index.ts — barrel for the Counter's presentational components (T4).
 *
 * Everything here takes props and emits callbacks; none of it fetches data.
 * A future wiring task maps `lib/pos/*` results onto these prop shapes —
 * see `pos-types.ts`'s header for how closely the field names already track
 * the engine's.
 */

export { PosFrame, type PosFrameProps, type PosFrameLink } from "./PosFrame";
export {
  SellSurface,
  ALL_CATEGORIES_ID,
  FAVOURITES_ID,
  type SellSurfaceProps,
  type SellSurfaceCopy,
} from "./SellSurface";
export { Basket, type BasketProps, type BasketCopy } from "./Basket";
export { CustomerSheet, initialsOf, type CustomerSheetProps, type CustomerSheetCopy, type CustomerDraft } from "./CustomerSheet";
export { LineEditSheet, type LineEditSheetProps, type LineEditCopy } from "./LineEditSheet";
export { DiscountSheet, type DiscountSheetProps, type DiscountSheetCopy, type DiscountTab } from "./DiscountSheet";
export { CustomAmountSheet, ManagerApprovalDialog, type CustomAmountCopy } from "./CustomAmount";
export { HoldSaleDialog, HoldExpiredDialog, type HoldSaleCopy, type HoldExpiredCopy, type HoldExpiredChoice } from "./HoldDialogs";
export { LinkBookingSheet, type LinkBookingCopy } from "./LinkBookingSheet";
export { CashDoneDialog, type CashDoneCopy } from "./CashDoneDialog";
export { CashDrawerScreen, type CashDrawerCopy, type CashDrawerView } from "./CashDrawerScreen";
export { ReceiptsScreen, receiptsSubtitle, type ReceiptsCopy, type PosReceiptRow } from "./ReceiptsScreen";
export { IssuesScreen, type IssuesCopy } from "./IssuesScreen";
export { DevicesScreen, ConnectionScreen, type DevicesCopy, type ConnectionCopy, type PosDeviceRow } from "./DeviceScreens";
export { ScanScreen, type ScanScreenCopy } from "./ScanScreen";
export { PosHeader, type PosHeaderProps, type PosHeaderMenuItem } from "./PosHeader";
export { PosSheet, PosDialog } from "./PosSheet";
export { PosKeypad } from "./PosKeypad";
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
  chromeCopy,
  sellSurfaceCopy,
  basketCopy,
  lineEditCopy,
  customerSheetCopy,
  discountSheetCopy,
  customAmountCopy,
  holdSaleCopy,
  holdExpiredCopy,
  linkBookingCopy,
  collectSheetCopy,
  collectMethodUnavailableCopy,
  cashDoneCopy,
  paidScreenCopy,
  heldSalesListCopy,
  cashDrawerCopy,
  receiptsCopy,
  issuesCopy,
  devicesCopy,
  deviceRowsCopy,
  connectionCopy,
  scanScreenCopy,
  refusalCopy,
  counterPageCopy,
  posModeLabel,
  type PosCounterPageCopy,
  type PosChromeCopy,
  type DeviceRowsCopy,
} from "./pos-copy";
export { CustomerDisplay, type CustomerDisplayProps, type CustomerDisplayScreen } from "./CustomerDisplay";
export { customerDisplayCopy, customerDisplayLinkCopy, scanCopy, type CustomerDisplayCopy, type ScanCopy } from "./customer-display-copy";
export { ScannerListener } from "./ScannerListener";
export { ScanStatus, type ScanToast } from "./ScanStatus";
