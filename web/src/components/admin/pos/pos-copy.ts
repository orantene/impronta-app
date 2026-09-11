/**
 * pos-copy.ts — builds each component's `copy` prop from a translator.
 *
 * Every component in this directory takes copy as props rather than
 * resolving it itself (no data fetching, per the task's own rule), so
 * something has to turn a `t()` function into those prop bags. This is
 * that something — a future page wiring these components calls it once per
 * render with the request's own translator; these component tests call it
 * directly with `createTranslator("en" | "es" | "fr")` to prove every
 * component renders in all three shipped languages.
 *
 * Keys are literal strings on purpose (never built with a template or a
 * variable): `message-key-usage.static.test.ts` can only see a call site
 * shaped like `t("dashboard.pos.counter.rail.sell")`, and a key it cannot
 * resolve is invisible to that guard rather than checked by it.
 */

import type { PosMode } from "@/lib/pos/modes";

import type { Translator } from "./translator";
import type { BasketCopy } from "./Basket";
import type { CollectSheetCopy } from "./CollectSheet";
import type { CustomerPanelCopy } from "./CustomerPanel";
import type { HeldSalesListCopy } from "./HeldSalesList";
import type { PaidScreenCopy } from "./PaidScreen";
import type { PosRefusalCopy } from "./PosRefusalBanner";
import type { SellSurfaceCopy } from "./SellSurface";
import type { ShiftBarCopy } from "./ShiftBar";

export function railCopy(t: Translator): Readonly<Record<string, string>> {
  return {
    sell: t("dashboard.pos.counter.rail.sell"),
    orders: t("dashboard.pos.counter.rail.orders"),
    shifts: t("dashboard.pos.counter.rail.shifts"),
  };
}

/**
 * The rail's own `aria-label` (the nav region's name, not a destination
 * label — `PosFrame`'s `destinationLabels` map is keyed by destination id,
 * never by the mode itself). A separate lookup so `railCopy`'s map keeps
 * meaning only "destination id → label"; folding a `"counter"` entry into
 * it would work by luck of not colliding with `sell`/`orders`/`shifts`
 * today, not by the map's own contract.
 */
export function railNavLabel(t: Translator): string {
  return t("dashboard.pos.counter.rail.label");
}

export function sellSurfaceCopy(t: Translator): SellSurfaceCopy {
  return {
    searchPlaceholder: t("dashboard.pos.counter.sell.searchPlaceholder"),
    searchLabel: t("dashboard.pos.counter.sell.searchLabel"),
    favourites: t("dashboard.pos.counter.sell.favourites"),
    allCategories: t("dashboard.pos.counter.sell.allCategories"),
    add: t("dashboard.pos.counter.sell.add"),
    empty: t("dashboard.pos.counter.sell.empty"),
    emptyCatalog: t("dashboard.pos.counter.sell.emptyCatalog"),
    chooseVariant: t("dashboard.pos.counter.variant.chooseLabel"),
  };
}

export function basketCopy(t: Translator): BasketCopy {
  return {
    title: t("dashboard.pos.counter.basket.title"),
    empty: t("dashboard.pos.counter.basket.empty"),
    decrease: t("dashboard.pos.counter.basket.decrease"),
    increase: t("dashboard.pos.counter.basket.increase"),
    remove: t("dashboard.pos.counter.basket.remove"),
    discountLabel: t("dashboard.pos.counter.basket.discountLabel"),
    discountPlaceholder: t("dashboard.pos.counter.basket.discountPlaceholder"),
    applyDiscount: t("dashboard.pos.counter.basket.applyDiscount"),
    discountNotCombinable: t("dashboard.pos.counter.basket.discountNotCombinable"),
    subtotal: t("dashboard.pos.counter.basket.subtotal"),
    discount: t("dashboard.pos.counter.basket.discount"),
    total: t("dashboard.pos.counter.basket.total"),
    charge: t("dashboard.pos.counter.basket.charge"),
    chargeEmptyHint: t("dashboard.pos.counter.basket.chargeEmptyHint"),
    chargeLoading: t("dashboard.pos.counter.basket.chargeLoading"),
  };
}

export function customerPanelCopy(t: Translator): CustomerPanelCopy {
  return {
    title: t("dashboard.pos.counter.customer.title"),
    walkIn: t("dashboard.pos.counter.customer.walkIn"),
    search: t("dashboard.pos.counter.customer.search"),
    searchPlaceholder: t("dashboard.pos.counter.customer.searchPlaceholder"),
    create: t("dashboard.pos.counter.customer.create"),
    attach: t("dashboard.pos.counter.customer.attach"),
    attachRetry: t("dashboard.pos.counter.customer.attachRetry"),
    none: t("dashboard.pos.counter.customer.none"),
  };
}

export function collectSheetCopy(t: Translator): CollectSheetCopy {
  return {
    title: t("dashboard.pos.counter.collect.title"),
    methodCash: t("dashboard.pos.counter.collect.methodCash"),
    methodCard: t("dashboard.pos.counter.collect.methodCard"),
    methodLink: t("dashboard.pos.counter.collect.methodLink"),
    methodPass: t("dashboard.pos.counter.collect.methodPass"),
    amountDue: t("dashboard.pos.counter.collect.amountDue"),
    tendered: t("dashboard.pos.counter.collect.tendered"),
    change: t("dashboard.pos.counter.collect.change"),
    confirmCash: t("dashboard.pos.counter.collect.confirmCash"),
    keypadClear: t("dashboard.pos.counter.collect.keypadClear"),
    cardWaiting: t("dashboard.pos.counter.collect.cardWaiting"),
    linkReady: t("dashboard.pos.counter.collect.linkReady"),
    passReady: t("dashboard.pos.counter.collect.passReady"),
    methodUnavailableFallback: t("dashboard.pos.counter.collect.methodUnavailableFallback"),
  };
}

export function collectMethodUnavailableCopy(t: Translator) {
  return {
    card: t("dashboard.pos.counter.collect.cardUnavailable"),
    link: t("dashboard.pos.counter.collect.linkUnavailable"),
    pass: t("dashboard.pos.counter.collect.passUnavailable"),
  };
}

export function paidScreenCopy(t: Translator): PaidScreenCopy {
  return {
    title: t("dashboard.pos.counter.paid.title"),
    amount: t("dashboard.pos.counter.paid.amount"),
    change: t("dashboard.pos.counter.paid.change"),
    printReceipt: t("dashboard.pos.counter.paid.printReceipt"),
    emailReceipt: t("dashboard.pos.counter.paid.emailReceipt"),
    nextCustomer: t("dashboard.pos.counter.paid.nextCustomer"),
  };
}

export function heldSalesListCopy(t: Translator): HeldSalesListCopy {
  return {
    title: t("dashboard.pos.counter.held.title"),
    empty: t("dashboard.pos.counter.held.empty"),
    resume: t("dashboard.pos.counter.held.resume"),
    heldSince: t("dashboard.pos.counter.held.heldSince"),
  };
}

export function shiftBarCopy(t: Translator): ShiftBarCopy {
  return {
    shiftTitle: t("dashboard.pos.shiftTitle"),
    shiftOpen: t("dashboard.pos.shiftOpen"),
    shiftClose: t("dashboard.pos.shiftClose"),
    shiftOpening: t("dashboard.pos.shiftOpening"),
    shiftCounted: t("dashboard.pos.shiftCounted"),
    shiftExpected: t("dashboard.pos.shiftExpected"),
    shiftVariance: t("dashboard.pos.shiftVariance"),
    shiftNone: t("dashboard.pos.shiftNone"),
    shiftOpenHint: t("dashboard.pos.shiftOpenHint"),
  };
}

export function refusalCopy(t: Translator): PosRefusalCopy {
  return {
    balanceChanged: t("dashboard.pos.counter.refusal.balanceChanged"),
    saleReloading: t("dashboard.pos.counter.refusal.saleReloading"),
    needsCustomerName: t("dashboard.pos.counter.refusal.needsCustomerName"),
    paymentDeclined: t("dashboard.pos.counter.refusal.paymentDeclined"),
    paymentUnknown: t("dashboard.pos.counter.refusal.paymentUnknown"),
    capacityGone: t("dashboard.pos.counter.refusal.capacityGone"),
    bookingChanged: t("dashboard.pos.counter.refusal.bookingChanged"),
    tenderShort: t("dashboard.pos.counter.refusal.tenderShort"),
    emptySale: t("dashboard.pos.counter.refusal.emptySale"),
    itemRefused: t("dashboard.pos.counter.refusal.itemRefused"),
    discountRefused: t("dashboard.pos.counter.refusal.discountRefused"),
    discountNeedsCustomer: t("dashboard.pos.counter.refusal.discountNeedsCustomer"),
    readerUnavailable: t("dashboard.pos.counter.refusal.readerUnavailable"),
    pickupWindow: t("dashboard.pos.counter.refusal.pickupWindow"),
    wrongWorkspace: t("dashboard.pos.counter.refusal.wrongWorkspace"),
    notAllowed: t("dashboard.pos.counter.refusal.notAllowed"),
    amountInvalid: t("dashboard.pos.counter.refusal.amountInvalid"),
    shiftAlreadyOpen: t("dashboard.pos.counter.refusal.shiftAlreadyOpen"),
    shiftAlreadyClosed: t("dashboard.pos.counter.refusal.shiftAlreadyClosed"),
    scanNoMatch: t("dashboard.pos.counter.refusal.scanNoMatch"),
    receiptNotPaid: t("dashboard.pos.counter.refusal.receiptNotPaid"),
    receiptNotSent: t("dashboard.pos.counter.refusal.receiptNotSent"),
    retry: t("dashboard.pos.counter.refusal.retry"),
    reload: t("dashboard.pos.counter.refusal.reload"),
  };
}

/**
 * The counter page's own labels — the ones that belong to the WIRING rather
 * than to any one presentational component: the hold/cancel/next actions, the
 * receipt link, and the two shift prompts. Kept beside the component copy
 * builders so a page has exactly one place to look, and written as literal
 * keys for the same reason as every builder above.
 */
export type PosCounterPageCopy = {
  readonly receiptLink: string;
  readonly copyReceipt: string;
  readonly receiptCopied: string;
  readonly hold: string;
  readonly startSale: string;
  readonly cancelSale: string;
  readonly collectTitle: string;
  readonly backToSale: string;
  readonly openShiftCash: string;
  readonly closeShiftCash: string;
  readonly confirmOpenShift: string;
  readonly confirmCloseShift: string;
};

export function counterPageCopy(t: Translator): PosCounterPageCopy {
  return {
    receiptLink: t("dashboard.pos.counter.receiptLink"),
    copyReceipt: t("dashboard.pos.counter.copyReceipt"),
    receiptCopied: t("dashboard.pos.counter.receiptCopied"),
    hold: t("dashboard.pos.counter.hold"),
    startSale: t("dashboard.pos.counter.startSale"),
    cancelSale: t("dashboard.pos.counter.cancelSale"),
    collectTitle: t("dashboard.pos.counter.collectTitle"),
    backToSale: t("dashboard.pos.counter.backToSale"),
    openShiftCash: t("dashboard.pos.counter.openShiftCash"),
    closeShiftCash: t("dashboard.pos.counter.closeShiftCash"),
    confirmOpenShift: t("dashboard.pos.counter.confirmOpenShift"),
    confirmCloseShift: t("dashboard.pos.counter.confirmCloseShift"),
  };
}

/**
 * A POS mode's own label, in the request's language.
 *
 * `POS_MODE_META[mode].label` is English only and says so in its own type
 * comment, so a screen that shows a mode name to a cashier reads it from the
 * catalogue instead. The switch statement (rather than a template key) is
 * what keeps every key literal and therefore visible to
 * `message-key-usage.static.test.ts`.
 */
export function posModeLabel(t: Translator, mode: PosMode): string {
  switch (mode) {
    case "counter":
      return t("dashboard.pos.counter.mode.counter");
    case "floor":
      return t("dashboard.pos.counter.mode.floor");
    case "door":
      return t("dashboard.pos.counter.mode.door");
    case "classes":
      return t("dashboard.pos.counter.mode.classes");
    case "projects":
      return t("dashboard.pos.counter.mode.projects");
  }
}
