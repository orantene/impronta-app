"use client";

/**
 * counter-props.ts — the counter's prop vocabulary (`PosClientProps`, the
 * copy bag) and the one derivation that is pure data: the device rows the
 * Devices screen draws from the facts the page read. Split out of
 * `pos-client.tsx` so the wire stays under the file cap.
 */

import type {
  BasketCopy,
  CashDoneCopy,
  CashDrawerCopy,
  CollectSheetCopy,
  ConnectionCopy,
  CustomAmountCopy,
  CustomerSheetCopy,
  DevicesCopy,
  DeviceRowsCopy,
  DiscountSheetCopy,
  HeldSalesListCopy,
  HoldExpiredCopy,
  HoldSaleCopy,
  IssuesCopy,
  LineEditCopy,
  LinkBookingCopy,
  PaidScreenCopy,
  PosBasketLine,
  PosChromeCopy,
  PosCollectionMethodState,
  PosDeviceRow,
  PosReceiptRow,
  PosRefusalCopy,
  ReceiptsCopy,
  ScanCopy,
  ScanScreenCopy,
  SellSurfaceCopy,
} from "@/components/admin/pos";
import type { PosCounterPageCopy } from "@/components/admin/pos/pos-copy";
import type { PosMode } from "@/lib/pos/modes";

import type { PosCatalogItem, PosShiftView } from "./counter-model";

/** The sale, narrowed to what the counter renders. */
export type PosSaleSummary = {
  orderId: string;
  version: number;
  currency: string;
  customerId: string | null;
  discountCents: number;
  totalCents: number;
  outstandingCents: number;
  paymentState: "unpaid" | "pending" | "paid" | "cancelled";
  prepState: string;
  /** The table the check belongs to when it was opened from the floor. */
  spaceId: string | null;
};

export type PosClientCopy = {
  frame: { navLabel: string; destinationLabels: Readonly<Record<string, string>> };
  chrome: PosChromeCopy;
  modeLabel: string;
  sell: SellSurfaceCopy;
  basket: BasketCopy;
  line: LineEditCopy;
  customer: CustomerSheetCopy;
  discount: DiscountSheetCopy;
  custom: CustomAmountCopy;
  hold: HoldSaleCopy;
  expired: HoldExpiredCopy;
  booking: LinkBookingCopy;
  collect: CollectSheetCopy;
  cashDone: CashDoneCopy;
  paid: PaidScreenCopy;
  held: HeldSalesListCopy;
  drawer: CashDrawerCopy;
  receipts: ReceiptsCopy;
  issues: IssuesCopy;
  devices: DevicesCopy;
  deviceRows: DeviceRowsCopy;
  connection: ConnectionCopy;
  scanScreen: ScanScreenCopy;
  refusal: PosRefusalCopy;
  page: PosCounterPageCopy;
  scan: ScanCopy;
  /** The rail's door to the customer display (`/admin/pos/display`). */
  displayLink: { label: string; hint: string };
  heldSaleLabel: string;
  customAmountTitle: string;
  categories: Readonly<Record<string, string>>;
};

export type PosClientProps = {
  mode: PosMode;
  /** For the customer display's beacon (`display-beacon.ts`), keyed per workspace. */
  tenantId: string;
  /** This workspace's own name: the location chip until a locations table exists. */
  workspaceName: string;
  /** The signed-in person, as the cashier chip names them. */
  cashierName: string;
  locale: string;
  /** This request's own `/…/admin/pos` path, so links keep the host shape. */
  posPath: string;
  workspacePath: string;
  receiptOrigin: string;
  receiptCode: string | null;
  sale: PosSaleSummary | null;
  basketLines: PosBasketLine[];
  /** The sale's tax outcome (`lib/catalog/tax`): `unset` says so on the Tax row. */
  taxState: "unset" | "taxed";
  /** The sale's last accepted write, as a clock string, for `Saved hh:mm`. */
  savedAt: string | null;
  openSales: Array<{ id: string; totalCents: number; createdAt: string | null }>;
  receipts: PosReceiptRow[];
  catalog: PosCatalogItem[];
  currency: string;
  minorUnitDivisor: number;
  methods: PosCollectionMethodState[];
  /** Whether a card reader is configured at all (`reportTerminalAvailability`). */
  readerConfigured: boolean;
  shift: PosShiftView | null;
  copy: PosClientCopy;
};


/**
 * The Devices screen's six rows, every status a fact the page read
 * (D-POS-29): the reader from `reportTerminalAvailability`, the scanner as
 * the keyboard wedge, the display as a second window, the printers and the
 * drawer as not set up.
 */
export function deviceRows(
  props: Pick<PosClientProps, "readerConfigured">,
  copy: DeviceRowsCopy,
  actions: { readonly openScan: () => void; readonly openDisplay: () => void },
): PosDeviceRow[] {
  return [
    {
      id: "reader",
      title: copy.reader,
      detail: props.readerConfigured ? copy.readerDetail : copy.readerNotSetUp,
      state: props.readerConfigured ? "off" : "notSetUp",
      action: copy.reconnect,
      reason: copy.readerUnavailable,
    },
    { id: "receiptPrinter", title: copy.receiptPrinter, detail: copy.printerNotSetUp, state: "notSetUp", action: copy.testPrint, reason: copy.printerNotSetUp },
    { id: "kitchenPrinter", title: copy.kitchenPrinter, detail: copy.printerNotSetUp, state: "notSetUp", action: copy.testPrint, reason: copy.printerNotSetUp },
    { id: "scanner", title: copy.scanner, detail: copy.scannerDetail, state: "ready", action: copy.testScan, onAction: actions.openScan },
    { id: "display", title: copy.display, detail: copy.displayDetail, state: "closed", action: copy.showTest, onAction: actions.openDisplay },
    { id: "drawer", title: copy.drawer, detail: copy.drawerDetail, state: "notSetUp", action: copy.openLogged, reason: copy.drawerUnavailable },
  ];
}
