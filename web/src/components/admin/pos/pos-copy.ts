/**
 * pos-copy.ts — every string the counter's screens render, read from the
 * message catalogue (`messages/{en,es,fr}.json`) through one translator.
 *
 * Each builder below returns the `*Copy` shape one component declares, so a
 * component gaining a string is a type error here until the key exists, and
 * a key that no builder reads fails `message-key-usage.static.test.ts`.
 * Nothing in this file is a sentence of its own.
 */

import type { PosMode } from "@/lib/pos/modes";

import type { Translator } from "./translator";
import type { BasketCopy } from "./Basket";
import type { CashDoneCopy } from "./CashDoneDialog";
import type { CashDrawerCopy } from "./CashDrawerScreen";
import type { CollectSheetCopy } from "./CollectSheet";
import type { CustomAmountCopy } from "./CustomAmount";
import type { CustomerSheetCopy } from "./CustomerSheet";
import type { ConnectionCopy, DevicesCopy } from "./DeviceScreens";
import type { DiscountSheetCopy } from "./DiscountSheet";
import type { HeldSalesListCopy } from "./HeldSalesList";
import type { HoldExpiredCopy, HoldSaleCopy } from "./HoldDialogs";
import type { IssuesCopy } from "./IssuesScreen";
import type { LineEditCopy } from "./LineEditSheet";
import type { LinkBookingCopy } from "./LinkBookingSheet";
import type { PaidScreenCopy } from "./PaidScreen";
import type { PosRefusalCopy } from "./PosRefusalBanner";
import type { ReceiptsCopy } from "./ReceiptsScreen";
import type { ScanScreenCopy } from "./ScanScreen";
import type { SellSurfaceCopy } from "./SellSurface";

const K = "dashboard.pos.counter";

export function railCopy(t: Translator): Readonly<Record<string, string>> {
  return {
    sell: t(`${K}.rail.sell`),
    orders: t(`${K}.rail.orders`),
    receipts: t(`${K}.rail.receipts`),
    shifts: t(`${K}.rail.shifts`),
    issues: t(`${K}.rail.issues`),
    // Messages & Inquiries: one row on every mode's rail (seam 1).
    messages: t("dashboard.pos.messages.title"),
  };
}

export function railNavLabel(t: Translator): string {
  return t(`${K}.rail.label`);
}

export type PosChromeCopy = {
  readonly modeEyebrow: string;
  readonly lock: string;
  readonly lockUnavailable: string;
  readonly workspace: string;
  readonly cashierMenu: string;
  readonly devices: string;
  readonly connection: string;
  readonly drawerOpen: string;
  readonly drawerNone: string;
  readonly offlineChip: string;
  readonly readerOffChip: string;
  /** `Sale {number} · {cashier}` */
  readonly saleSubtitle: string;
  /** `New sale · {cashier}` */
  readonly newSaleSubtitle: string;
  readonly closeLabel: string;
  readonly drawerTitle: string;
  readonly switchOperator: string;
};

export function chromeCopy(t: Translator): PosChromeCopy {
  return {
    modeEyebrow: t(`${K}.chrome.modeEyebrow`),
    lock: t(`${K}.chrome.lock`),
    lockUnavailable: t(`${K}.chrome.lockUnavailable`),
    workspace: t(`${K}.chrome.workspace`),
    cashierMenu: t(`${K}.chrome.cashierMenu`),
    devices: t(`${K}.chrome.devices`),
    connection: t(`${K}.chrome.connection`),
    drawerOpen: t(`${K}.chrome.drawerOpen`),
    drawerNone: t(`${K}.chrome.drawerNone`),
    offlineChip: t(`${K}.chrome.offlineChip`),
    readerOffChip: t(`${K}.chrome.readerOffChip`),
    saleSubtitle: t(`${K}.chrome.saleSubtitle`),
    newSaleSubtitle: t(`${K}.chrome.newSaleSubtitle`),
    closeLabel: t(`${K}.chrome.close`),
    drawerTitle: t(`${K}.chrome.drawerTitle`),
    switchOperator: t(`${K}.chrome.switchOperator`),
  };
}

export function sellSurfaceCopy(t: Translator): SellSurfaceCopy {
  return {
    searchPlaceholder: t(`${K}.sell.searchPlaceholder`),
    searchLabel: t(`${K}.sell.searchLabel`),
    favourites: t(`${K}.sell.favourites`),
    favouritesUnavailable: t(`${K}.sell.favouritesUnavailable`),
    allCategories: t(`${K}.sell.allCategories`),
    add: t(`${K}.sell.add`),
    empty: t(`${K}.sell.empty`),
    emptyCatalog: t(`${K}.sell.emptyCatalog`),
    chooseVariant: t(`${K}.variant.chooseLabel`),
    chooseOption: t(`${K}.variant.chooseLabel`),
    closeLabel: t(`${K}.chrome.close`),
    scanLabel: t(`${K}.scan.ready`),
    badgeOptions: t(`${K}.sell.badgeOptions`),
    badgeLeft: t(`${K}.sell.badgeLeft`),
    badgeSoldOut: t(`${K}.sell.badgeSoldOut`),
    badgePickSession: t(`${K}.sell.badgePickSession`),
    badgeApproval: t(`${K}.sell.badgeApproval`),
  };
}

export function basketCopy(t: Translator): BasketCopy {
  return {
    title: t(`${K}.basket.title`),
    customer: t(`${K}.basket.customer`),
    booking: t(`${K}.basket.booking`),
    here: t(`${K}.basket.here`),
    toGo: t(`${K}.basket.toGo`),
    emptyTitle: t(`${K}.basket.emptyTitle`),
    empty: t(`${K}.basket.empty`),
    heldSales: t(`${K}.basket.heldSales`),
    basketCount: t(`${K}.basket.basketCount`),
    each: t(`${K}.basket.each`),
    heldUntil: t(`${K}.basket.heldUntil`),
    editLine: t(`${K}.basket.editLine`),
    subtotal: t(`${K}.basket.subtotal`),
    discount: t(`${K}.basket.discount`),
    tax: t(`${K}.basket.tax`),
    taxUnset: t(`${K}.basket.taxUnset`),
    tip: t(`${K}.basket.tip`),
    total: t(`${K}.basket.total`),
    needsApproval: t(`${K}.basket.needsApproval`),
    linked: t(`${K}.basket.linked`),
    charge: t(`${K}.basket.charge`),
    chargeCash: t(`${K}.basket.chargeCash`),
    chargeLoading: t(`${K}.basket.chargeLoading`),
    hold: t(`${K}.hold`),
    send: t(`${K}.basket.send`),
    sendOne: t(`${K}.basket.sendOne`),
    sendAgain: t(`${K}.basket.sendAgain`),
    cardOffline: t(`${K}.basket.cardOffline`),
    saved: t(`${K}.basket.saved`),
    savedOffline: t(`${K}.basket.savedOffline`),
  };
}

export function lineEditCopy(t: Translator): LineEditCopy {
  return {
    title: t(`${K}.line.title`),
    notSent: t(`${K}.line.notSent`),
    sent: t(`${K}.line.sent`),
    each: t(`${K}.basket.each`),
    quantity: t(`${K}.line.quantity`),
    decrease: t(`${K}.basket.decrease`),
    increase: t(`${K}.basket.increase`),
    options: t(`${K}.line.options`),
    optionsUnavailable: t(`${K}.line.optionsUnavailable`),
    noteBar: t(`${K}.line.noteBar`),
    noteReceipt: t(`${K}.line.noteReceipt`),
    notesUnavailable: t(`${K}.line.notesUnavailable`),
    servedBy: t(`${K}.line.servedBy`),
    servedByUnavailable: t(`${K}.line.servedByUnavailable`),
    priceEach: t(`${K}.line.priceEach`),
    listPrice: t(`${K}.line.listPrice`),
    priceLocked: t(`${K}.line.priceLocked`),
    lineTotal: t(`${K}.line.lineTotal`),
    lineDiscount: t(`${K}.line.lineDiscount`),
    lineDiscountUnavailable: t(`${K}.line.lineDiscountUnavailable`),
    duplicate: t(`${K}.line.duplicate`),
    remove: t(`${K}.basket.remove`),
    cancel: t(`${K}.cancel`),
    unsaved: t(`${K}.line.unsaved`),
    save: t(`${K}.line.save`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function customerSheetCopy(t: Translator): CustomerSheetCopy {
  return {
    title: t(`${K}.customer.title`),
    subtitle: t(`${K}.customer.subtitle`),
    searchLabel: t(`${K}.customer.search`),
    searchPlaceholder: t(`${K}.customer.searchPlaceholder`),
    none: t(`${K}.customer.none`),
    createFromQuery: t(`${K}.customer.createFromQuery`),
    create: t(`${K}.customer.create`),
    walkIn: t(`${K}.customer.walkIn`),
    cashierNote: t(`${K}.customer.cashierNote`),
    crumb: t(`${K}.customer.crumb`),
    createTitle: t(`${K}.customer.createTitle`),
    createSubtitle: t(`${K}.customer.createSubtitle`),
    name: t(`${K}.customer.name`),
    phone: t("dashboard.pos.phone"),
    email: t("dashboard.pos.email"),
    emailOptional: t(`${K}.customer.emailOptional`),
    contactHint: t(`${K}.customer.contactHint`),
    language: t(`${K}.customer.language`),
    languageUnavailable: t(`${K}.customer.languageUnavailable`),
    offers: t(`${K}.customer.offers`),
    offersUnavailable: t(`${K}.customer.offersUnavailable`),
    duplicate: t(`${K}.customer.duplicate`),
    useExisting: t(`${K}.customer.useExisting`),
    differentPerson: t(`${K}.customer.differentPerson`),
    cancel: t(`${K}.cancel`),
    saveAndAdd: t(`${K}.customer.saveAndAdd`),
    failedTitle: t(`${K}.customer.failedTitle`),
    failedSubtitle: t(`${K}.customer.failedSubtitle`),
    savedPill: t(`${K}.customer.savedPill`),
    failedNote: t(`${K}.customer.failedNote`),
    continueWithout: t(`${K}.customer.continueWithout`),
    addToSale: t(`${K}.customer.addToSale`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function discountSheetCopy(t: Translator): DiscountSheetCopy {
  return {
    title: t(`${K}.basket.discount`),
    subtitle: t(`${K}.discount.subtitle`),
    tabCode: t(`${K}.discount.tabCode`),
    tabManual: t(`${K}.discount.tabManual`),
    tabComp: t(`${K}.discount.tabComp`),
    codeLabel: t(`${K}.basket.discountLabel`),
    codePlaceholder: t(`${K}.basket.discountPlaceholder`),
    amount: t(`${K}.discount.amount`),
    reason: t(`${K}.discount.reason`),
    manualUnavailable: t(`${K}.discount.manualUnavailable`),
    compUnavailable: t(`${K}.discount.compUnavailable`),
    eligible: t(`${K}.discount.eligible`),
    eligibleNote: t(`${K}.discount.eligibleNote`),
    before: t(`${K}.discount.before`),
    discount: t(`${K}.basket.discount`),
    after: t(`${K}.discount.after`),
    notCombinable: t(`${K}.basket.discountNotCombinable`),
    refused: t(`${K}.refusal.discountRefused`),
    cancel: t(`${K}.cancel`),
    apply: t(`${K}.basket.applyDiscount`),
    remove: t(`${K}.discount.remove`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function customAmountCopy(t: Translator): CustomAmountCopy {
  return {
    title: t(`${K}.custom.title`),
    subtitle: t(`${K}.custom.subtitle`),
    what: t(`${K}.custom.what`),
    reason: t(`${K}.discount.reason`),
    reasonDefault: t(`${K}.custom.reasonDefault`),
    reportAs: t(`${K}.custom.reportAs`),
    reportAsUnavailable: t(`${K}.custom.reportAsUnavailable`),
    amount: t(`${K}.custom.amount`),
    limitNote: t(`${K}.custom.limitNote`),
    withinLimit: t(`${K}.custom.withinLimit`),
    cancel: t(`${K}.cancel`),
    continueAsk: t(`${K}.custom.continueAsk`),
    addToSale: t(`${K}.custom.addToSale`),
    back: t(`${K}.collect.keypadBack`),
    closeLabel: t(`${K}.chrome.close`),
    approvalTitle: t(`${K}.custom.approvalTitle`),
    approvalSubtitle: t(`${K}.custom.approvalSubtitle`),
    item: t(`${K}.custom.item`),
    whoApproves: t(`${K}.custom.whoApproves`),
    noManagers: t(`${K}.custom.noManagers`),
    pinPrompt: t(`${K}.custom.pinPrompt`),
    approve: t(`${K}.custom.approve`),
    approving: t(`${K}.custom.approving`),
  };
}

export function holdSaleCopy(t: Translator): HoldSaleCopy {
  return {
    title: t(`${K}.holdSale.title`),
    subtitle: t(`${K}.holdSale.subtitle`),
    nameIt: t(`${K}.holdSale.nameIt`),
    nameHint: t(`${K}.holdSale.nameHint`),
    nameUnavailable: t(`${K}.holdSale.nameUnavailable`),
    heldNote: t(`${K}.holdSale.heldNote`),
    back: t(`${K}.back`),
    discard: t(`${K}.holdSale.discard`),
    hold: t(`${K}.hold`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function holdExpiredCopy(t: Translator): HoldExpiredCopy {
  return {
    title: t(`${K}.holdExpired.title`),
    subtitle: t(`${K}.holdExpired.subtitle`),
    holdAgain: t(`${K}.holdExpired.holdAgain`),
    holdAgainUnavailable: t(`${K}.holdExpired.holdAgainUnavailable`),
    remove: t(`${K}.holdExpired.remove`),
    removeHint: t(`${K}.holdExpired.removeHint`),
    pickAnother: t(`${K}.holdExpired.pickAnother`),
    later: t(`${K}.holdExpired.later`),
    confirmRemove: t(`${K}.holdExpired.confirmRemove`),
    confirmPick: t(`${K}.holdExpired.pickAnother`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function linkBookingCopy(t: Translator): LinkBookingCopy {
  return {
    title: t(`${K}.booking.title`),
    subtitle: t(`${K}.booking.subtitle`),
    noCustomer: t(`${K}.booking.noCustomer`),
    noCustomerAction: t(`${K}.booking.noCustomerAction`),
    unreadable: t(`${K}.booking.unreadable`),
    loading: t(`${K}.booking.loading`),
    none: t(`${K}.booking.none`),
    showPaid: t(`${K}.booking.showPaid`),
    balanceLine: t(`${K}.booking.balanceLine`),
    ticketLine: t(`${K}.booking.ticketLine`),
    paidLine: t(`${K}.booking.paidLine`),
    alreadyLinked: t(`${K}.booking.alreadyLinked`),
    afterLinking: t(`${K}.booking.afterLinking`),
    bookingBalance: t(`${K}.booking.bookingBalance`),
    thisSale: t(`${K}.booking.thisSale`),
    charge: t(`${K}.basket.chargeWord`),
    keepSeparate: t(`${K}.booking.keepSeparate`),
    linkOnly: t(`${K}.booking.linkOnly`),
    linkAndPay: t(`${K}.booking.linkAndPay`),
    linking: t(`${K}.booking.linking`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function collectSheetCopy(t: Translator): CollectSheetCopy {
  return {
    title: t(`${K}.collect.title`),
    methodCash: t(`${K}.collect.methodCash`),
    methodCard: t(`${K}.collect.methodCard`),
    methodLink: t(`${K}.collect.methodLink`),
    methodPass: t(`${K}.collect.methodPass`),
    methodTransfer: t(`${K}.collect.methodTransfer`),
    methodTransferUnavailable: t(`${K}.collect.methodTransferUnavailable`),
    methodSplit: t(`${K}.collect.methodSplit`),
    methodSplitUnavailable: t(`${K}.collect.methodSplitUnavailable`),
    cashHint: t(`${K}.collect.cashHint`),
    cardHint: t(`${K}.collect.cardHint`),
    linkHint: t(`${K}.collect.linkHint`),
    passHint: t(`${K}.collect.passHint`),
    how: t(`${K}.collect.how`),
    amountDue: t(`${K}.collect.amountDue`),
    exact: t(`${K}.collect.exact`),
    tendered: t(`${K}.collect.tendered`),
    change: t(`${K}.collect.change`),
    short: t(`${K}.collect.short`),
    confirmCash: t(`${K}.collect.confirmCash`),
    confirmCashChange: t(`${K}.collect.confirmCashChange`),
    confirmCashExact: t(`${K}.collect.confirmCashExact`),
    takePartial: t(`${K}.collect.takePartial`),
    takePartialUnavailable: t(`${K}.collect.takePartialUnavailable`),
    keypadClear: t(`${K}.collect.keypadClear`),
    back: t(`${K}.collect.keypadBack`),
    cardWaiting: t(`${K}.collect.cardWaiting`),
    linkReady: t(`${K}.collect.linkReady`),
    passReady: t(`${K}.collect.passReady`),
    methodUnavailableFallback: t(`${K}.collect.methodUnavailableFallback`),
  };
}

export function collectMethodUnavailableCopy(t: Translator) {
  return {
    card: t(`${K}.collect.cardUnavailable`),
    link: t(`${K}.collect.linkUnavailable`),
    pass: t(`${K}.collect.passUnavailable`),
  };
}

export function cashDoneCopy(t: Translator): CashDoneCopy {
  return {
    title: t(`${K}.cashDone.title`),
    subtitle: t(`${K}.cashDone.subtitle`),
    subtitleExact: t(`${K}.cashDone.subtitleExact`),
    received: t(`${K}.cashDone.received`),
    drawerNote: t(`${K}.cashDone.drawerNote`),
    openDrawer: t(`${K}.cashDone.openDrawer`),
    openDrawerUnavailable: t(`${K}.cashDone.openDrawerUnavailable`),
    done: t(`${K}.cashDone.done`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function paidScreenCopy(t: Translator): PaidScreenCopy {
  return {
    title: t(`${K}.paid.title`),
    amount: t(`${K}.paid.amount`),
    change: t(`${K}.paid.change`),
    printReceipt: t(`${K}.paid.printReceipt`),
    emailReceipt: t(`${K}.paid.emailReceipt`),
    nextCustomer: t(`${K}.paid.nextCustomer`),
  };
}

export function heldSalesListCopy(t: Translator): HeldSalesListCopy {
  return {
    title: t(`${K}.held.title`),
    empty: t(`${K}.held.empty`),
    resume: t(`${K}.held.resume`),
    heldSince: t(`${K}.held.heldSince`),
    fromMessages: t(`${K}.held.fromMessages`),
  };
}

export function cashDrawerCopy(t: Translator): CashDrawerCopy {
    return {
    openEyebrow: t(`${K}.drawer.openEyebrow`),
    drawer: t(`${K}.drawer.drawer`),
    drawerDefault: t(`${K}.drawer.drawerDefault`),
    drawerUnavailable: t(`${K}.drawer.drawerUnavailable`),
    responsible: t(`${K}.drawer.responsible`),
    responsibleYou: t(`${K}.drawer.responsibleYou`),
    startingCash: t(`${K}.drawer.startingCash`),
    openDrawer: t(`${K}.drawer.openDrawer`),
    onceOpen: t(`${K}.drawer.onceOpen`),
    addCash: t(`${K}.drawer.addCash`),
    addCashHint: t(`${K}.drawer.addCashHint`),
    takeOut: t(`${K}.drawer.takeOut`),
    takeOutHint: t(`${K}.drawer.takeOutHint`),
    dropSafe: t(`${K}.drawer.dropSafe`),
    dropSafeHint: t(`${K}.drawer.dropSafeHint`),
    openNoSale: t(`${K}.drawer.openNoSale`),
    openNoSaleHint: t(`${K}.drawer.openNoSaleHint`),
    onceOpenNote: t(`${K}.drawer.onceOpenNote`),
    openNoSaleUnavailable: t(`${K}.drawer.openNoSaleUnavailable`),
    movements: t(`${K}.drawer.movements`),
    movementsEmpty: t(`${K}.drawer.movementsEmpty`),
    movementKind: {
      paid_in: t(`${K}.drawer.movementKind.paid_in`),
      paid_out: t(`${K}.drawer.movementKind.paid_out`),
      drop: t(`${K}.drawer.movementKind.drop`),
      float_add: t(`${K}.drawer.movementKind.float_add`),
    },
    handOver: t(`${K}.drawer.handOver`),
    newResponsible: t(`${K}.drawer.newResponsible`),
    newResponsibleNone: t(`${K}.drawer.newResponsibleNone`),
    countedTogether: t(`${K}.drawer.countedTogether`),
    handOverNote: t(`${K}.drawer.handOverNote`),
    handOverAction: t(`${K}.drawer.handOverAction`),
    handOverChosen: t(`${K}.drawer.handOverChosen`),
    closeAndCount: t(`${K}.drawer.closeAndCount`),
    countEyebrow: t(`${K}.drawer.countEyebrow`),
    coins: t(`${K}.drawer.coins`),
    counted: t(`${K}.drawer.counted`),
    startedWith: t(`${K}.drawer.startedWith`),
    shouldBe: t(`${K}.drawer.shouldBe`),
    blindNote: t(`${K}.drawer.blindNote`),
    whatHappened: t(`${K}.drawer.whatHappened`),
    whatHappenedHint: t(`${K}.drawer.whatHappenedHint`),
    confirmCount: t(`${K}.drawer.confirmCount`),
    back: t(`${K}.back`),
    closeDrawer: t(`${K}.drawer.closeDrawer`),
    closedTitle: t(`${K}.drawer.closedTitle`),
    expected: t(`${K}.drawer.expected`),
    shortBy: t(`${K}.drawer.shortBy`),
    overBy: t(`${K}.drawer.overBy`),
    balanced: t(`${K}.drawer.balanced`),
    openAnother: t(`${K}.drawer.openAnother`),
    keypadBack: t(`${K}.collect.keypadBack`),
  };
}

export function receiptsCopy(t: Translator): ReceiptsCopy {
    return {
    title: t(`${K}.rail.receipts`),
    subtitle: t(`${K}.receipts.subtitle`),
    searchPlaceholder: t(`${K}.receipts.searchPlaceholder`),
    searchLabel: t(`${K}.receipts.searchLabel`),
    today: t(`${K}.receipts.today`),
    yesterday: t(`${K}.receipts.yesterday`),
    week: t(`${K}.receipts.week`),
    all: t(`${K}.receipts.all`),
    cash: t(`${K}.collect.methodCash`),
    card: t(`${K}.collect.methodCard`),
    refunds: t(`${K}.receipts.refunds`),
    methodUnavailable: t(`${K}.receipts.methodUnavailable`),
    walkIn: t(`${K}.customer.walkInShort`),
    empty: t(`${K}.receipts.empty`),
    noCode: t(`${K}.receipts.noCode`),
    open: t(`${K}.receipts.open`),
    fromMessages: t(`${K}.receipts.fromMessages`),
  };
}

export function issuesCopy(t: Translator): IssuesCopy {
    return {
    title: t(`${K}.rail.issues`),
    subtitle: t(`${K}.issues.subtitle`),
    open: t(`${K}.issues.open`),
    mine: t(`${K}.issues.mine`),
    doneToday: t(`${K}.issues.doneToday`),
    all: t(`${K}.receipts.all`),
    payments: t(`${K}.issues.payments`),
    kitchen: t(`${K}.issues.kitchen`),
    devices: t(`${K}.chrome.devices`),
    orders: t(`${K}.rail.orders`),
    unavailable: t(`${K}.issues.unavailable`),
  };
}

export function devicesCopy(t: Translator): DevicesCopy {
    return {
    title: t(`${K}.chrome.devices`),
    subtitle: t(`${K}.devices.subtitle`),
    ready: t(`${K}.devices.ready`),
    off: t(`${K}.devices.off`),
    notSetUp: t(`${K}.devices.notSetUp`),
    closed: t(`${K}.devices.closed`),
    whileOff: t(`${K}.devices.whileOff`),
    cash: t(`${K}.collect.methodCash`),
    links: t(`${K}.devices.links`),
    cardAtCounter: t(`${K}.devices.cardAtCounter`),
    refundsToCard: t(`${K}.devices.refundsToCard`),
    yes: t(`${K}.devices.yes`),
    no: t(`${K}.devices.no`),
    noUntil: t(`${K}.devices.noUntil`),
    internet: t(`${K}.devices.internet`),
    connection: t(`${K}.chrome.connection`),
    ok: t(`${K}.devices.ok`),
    offline: t(`${K}.devices.offline`),
    waitingToSync: t(`${K}.devices.waitingToSync`),
    nothing: t(`${K}.devices.nothing`),
    internetNote: t(`${K}.devices.internetNote`),
  };
}

export type DeviceRowsCopy = {
  readonly reader: string;
  readonly readerDetail: string;
  readonly readerNotSetUp: string;
  readonly reconnect: string;
  readonly readerUnavailable: string;
  readonly receiptPrinter: string;
  readonly kitchenPrinter: string;
  readonly printerNotSetUp: string;
  readonly testPrint: string;
  readonly scanner: string;
  readonly scannerDetail: string;
  readonly testScan: string;
  readonly display: string;
  readonly displayDetail: string;
  readonly displayNone: string;
  readonly showTest: string;
  readonly drawer: string;
  readonly drawerDetail: string;
  readonly openLogged: string;
  readonly drawerUnavailable: string;
};

export function deviceRowsCopy(t: Translator): DeviceRowsCopy {
    return {
    reader: t(`${K}.devices.reader`),
    readerDetail: t(`${K}.devices.readerDetail`),
    readerNotSetUp: t(`${K}.devices.readerNotSetUp`),
    reconnect: t(`${K}.devices.reconnect`),
    readerUnavailable: t(`${K}.devices.readerUnavailable`),
    receiptPrinter: t(`${K}.devices.receiptPrinter`),
    kitchenPrinter: t(`${K}.devices.kitchenPrinter`),
    printerNotSetUp: t(`${K}.devices.printerNotSetUp`),
    testPrint: t(`${K}.devices.testPrint`),
    scanner: t(`${K}.devices.scanner`),
    scannerDetail: t(`${K}.devices.scannerDetail`),
    testScan: t(`${K}.devices.testScan`),
    display: t(`${K}.devices.display`),
    displayDetail: t(`${K}.devices.displayDetail`),
    displayNone: t(`${K}.devices.displayNone`),
    showTest: t(`${K}.devices.showTest`),
    drawer: t(`${K}.drawer.drawer`),
    drawerDetail: t(`${K}.devices.drawerDetail`),
    openLogged: t(`${K}.devices.openLogged`),
    drawerUnavailable: t(`${K}.devices.drawerUnavailable`),
  };
}

export function connectionCopy(t: Translator): ConnectionCopy {
    return {
    title: t(`${K}.chrome.connection`),
    subtitle: t(`${K}.connection.subtitle`),
    offlineTitle: t(`${K}.connection.offlineTitle`),
    offlineDetail: t(`${K}.connection.offlineDetail`),
    onlineTitle: t(`${K}.connection.onlineTitle`),
    onlineDetail: t(`${K}.connection.onlineDetail`),
    tryAgain: t(`${K}.refusal.retry`),
    youCan: t(`${K}.connection.youCan`),
    sellCash: t(`${K}.connection.sellCash`),
    catalog: t(`${K}.connection.catalog`),
    holdResume: t(`${K}.connection.holdResume`),
    takeCard: t(`${K}.connection.takeCard`),
    lastPlaces: t(`${K}.connection.lastPlaces`),
    refund: t(`${K}.connection.refund`),
    yes: t(`${K}.devices.yes`),
    no: t(`${K}.devices.no`),
    noNeedsConnection: t(`${K}.connection.noNeedsConnection`),
    cardReader: t(`${K}.devices.reader`),
    readerConnected: t(`${K}.connection.readerConnected`),
    readerOff: t(`${K}.devices.off`),
    readerNote: t(`${K}.connection.readerNote`),
    waitingToSync: t(`${K}.devices.waitingToSync`),
    nothingQueued: t(`${K}.connection.nothingQueued`),
    syncNow: t(`${K}.connection.syncNow`),
  };
}

export function scanScreenCopy(t: Translator): ScanScreenCopy {
    return {
    title: t(`${K}.scan.title`),
    ready: t(`${K}.scan.readyLine`),
    heading: t(`${K}.scan.heading`),
    hint: t(`${K}.scan.hint`),
    anything: t(`${K}.scan.anything`),
    productsOnly: t(`${K}.scan.productsOnly`),
    ticketsOnly: t(`${K}.scan.ticketsOnly`),
    passesOnly: t(`${K}.scan.passesOnly`),
    filterUnavailable: t(`${K}.scan.filterUnavailable`),
    typeInstead: t(`${K}.scan.typeInstead`),
    placeholder: t(`${K}.scan.placeholder`),
    lookUp: t(`${K}.scan.lookUp`),
    keypadBack: t(`${K}.collect.keypadBack`),
  };
}

export function refusalCopy(t: Translator): PosRefusalCopy {
    return {
    balanceChanged: t(`${K}.refusal.balanceChanged`),
    saleReloading: t(`${K}.refusal.saleReloading`),
    needsCustomerName: t(`${K}.refusal.needsCustomerName`),
    paymentDeclined: t(`${K}.refusal.paymentDeclined`),
    paymentUnknown: t(`${K}.refusal.paymentUnknown`),
    capacityGone: t(`${K}.refusal.capacityGone`),
    bookingChanged: t(`${K}.refusal.bookingChanged`),
    tenderShort: t(`${K}.refusal.tenderShort`),
    emptySale: t(`${K}.refusal.emptySale`),
    itemRefused: t(`${K}.refusal.itemRefused`),
    discountRefused: t(`${K}.refusal.discountRefused`),
    discountNeedsCustomer: t(`${K}.refusal.discountNeedsCustomer`),
    readerUnavailable: t(`${K}.refusal.readerUnavailable`),
    pickupWindow: t(`${K}.refusal.pickupWindow`),
    wrongWorkspace: t(`${K}.refusal.wrongWorkspace`),
    notAllowed: t(`${K}.refusal.notAllowed`),
    amountInvalid: t(`${K}.refusal.amountInvalid`),
    shiftAlreadyOpen: t(`${K}.refusal.shiftAlreadyOpen`),
    shiftAlreadyClosed: t(`${K}.refusal.shiftAlreadyClosed`),
    scanNoMatch: t(`${K}.refusal.scanNoMatch`),
    receiptNotPaid: t(`${K}.refusal.receiptNotPaid`),
    receiptNotSent: t(`${K}.refusal.receiptNotSent`),
    retry: t(`${K}.refusal.retry`),
    reload: t(`${K}.refusal.reload`),
  };
}

export type PosCounterPageCopy = {
  readonly receiptLink: string;
  readonly copyReceipt: string;
  readonly receiptCopied: string;
  readonly hold: string;
  readonly startSale: string;
  readonly cancelSale: string;
  readonly collectTitle: string;
  readonly backToSale: string;
  readonly pickupReadyAt: string;
};

export function counterPageCopy(t: Translator): PosCounterPageCopy {
  return {
    receiptLink: t(`${K}.receiptLink`),
    copyReceipt: t(`${K}.copyReceipt`),
    receiptCopied: t(`${K}.receiptCopied`),
    hold: t(`${K}.hold`),
    startSale: t(`${K}.startSale`),
    cancelSale: t(`${K}.cancelSale`),
    collectTitle: t(`${K}.collectTitle`),
    backToSale: t(`${K}.backToSale`),
    pickupReadyAt: t(`${K}.pickupReadyAt`),
  };
}

export function posModeLabel(t: Translator, mode: PosMode): string {
  switch (mode) {
    case "counter":
      return t(`${K}.mode.counter`);
    case "floor":
      return t(`${K}.mode.floor`);
    case "door":
      return t(`${K}.mode.door`);
    case "classes":
      return t(`${K}.mode.classes`);
    case "projects":
      return t(`${K}.mode.projects`);
  }
}
