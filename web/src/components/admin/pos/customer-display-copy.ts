/**
 * customer-display-copy.ts — the customer display's sentences, from the
 * catalogue, in the request's own language.
 *
 * Same contract as `pos-copy.ts`: literal keys only, so
 * `message-key-usage.static.test.ts` can see every one; every sentence a
 * customer can meet, including every refusal the receipt action can return,
 * is here in all three shipped languages.
 */

import type { Translator } from "./translator";

export type CustomerDisplayCopy = {
  readonly title: string;
  readonly idleWelcome: string;
  readonly idleBody: string;
  readonly reviewHeadingNamed: string;
  readonly reviewHeadingAnon: string;
  readonly subtotal: string;
  readonly discount: string;
  readonly depositPaid: string;
  readonly toPay: string;
  readonly tipNotOffered: string;
  readonly reviewNote: string;
  readonly looksRight: string;
  readonly confirmHeading: string;
  readonly confirmBody: string;
  readonly confirmNote: string;
  readonly back: string;
  readonly waitingHeading: string;
  readonly waitingBody: string;
  readonly declinedHeading: string;
  readonly declinedBody: string;
  readonly paidHeadingNamed: string;
  readonly paidHeadingAnon: string;
  readonly paidBody: string;
  readonly paidVia: string;
  readonly methodCash: string;
  readonly methodCard: string;
  readonly receiptQuestion: string;
  readonly emailMe: string;
  readonly textMe: string;
  readonly textNotOffered: string;
  readonly noReceipt: string;
  readonly clearsSoon: string;
  readonly contactHeading: string;
  readonly contactEmailLabel: string;
  readonly contactEmailPlaceholder: string;
  readonly contactSend: string;
  readonly contactNote: string;
  readonly sentHeading: string;
  readonly sentBody: string;
  readonly sentSkipped: string;
  readonly refusalInvalidEmail: string;
  readonly refusalNotPaid: string;
  readonly refusalSendFailed: string;
  readonly refusalUnavailable: string;
  readonly readUnavailable: string;
  readonly notAllowed: string;
};

export function customerDisplayCopy(t: Translator): CustomerDisplayCopy {
  return {
    title: t("dashboard.pos.display.title"),
    idleWelcome: t("dashboard.pos.display.idleWelcome"),
    idleBody: t("dashboard.pos.display.idleBody"),
    reviewHeadingNamed: t("dashboard.pos.display.reviewHeadingNamed"),
    reviewHeadingAnon: t("dashboard.pos.display.reviewHeadingAnon"),
    subtotal: t("dashboard.pos.display.subtotal"),
    discount: t("dashboard.pos.display.discount"),
    depositPaid: t("dashboard.pos.display.depositPaid"),
    toPay: t("dashboard.pos.display.toPay"),
    tipNotOffered: t("dashboard.pos.display.tipNotOffered"),
    reviewNote: t("dashboard.pos.display.reviewNote"),
    looksRight: t("dashboard.pos.display.looksRight"),
    confirmHeading: t("dashboard.pos.display.confirmHeading"),
    confirmBody: t("dashboard.pos.display.confirmBody"),
    confirmNote: t("dashboard.pos.display.confirmNote"),
    back: t("dashboard.pos.display.back"),
    waitingHeading: t("dashboard.pos.display.waitingHeading"),
    waitingBody: t("dashboard.pos.display.waitingBody"),
    declinedHeading: t("dashboard.pos.display.declinedHeading"),
    declinedBody: t("dashboard.pos.display.declinedBody"),
    paidHeadingNamed: t("dashboard.pos.display.paidHeadingNamed"),
    paidHeadingAnon: t("dashboard.pos.display.paidHeadingAnon"),
    paidBody: t("dashboard.pos.display.paidBody"),
    paidVia: t("dashboard.pos.display.paidVia"),
    methodCash: t("dashboard.pos.display.methodCash"),
    methodCard: t("dashboard.pos.display.methodCard"),
    receiptQuestion: t("dashboard.pos.display.receiptQuestion"),
    emailMe: t("dashboard.pos.display.emailMe"),
    textMe: t("dashboard.pos.display.textMe"),
    textNotOffered: t("dashboard.pos.display.textNotOffered"),
    noReceipt: t("dashboard.pos.display.noReceipt"),
    clearsSoon: t("dashboard.pos.display.clearsSoon"),
    contactHeading: t("dashboard.pos.display.contactHeading"),
    contactEmailLabel: t("dashboard.pos.display.contactEmailLabel"),
    contactEmailPlaceholder: t("dashboard.pos.display.contactEmailPlaceholder"),
    contactSend: t("dashboard.pos.display.contactSend"),
    contactNote: t("dashboard.pos.display.contactNote"),
    sentHeading: t("dashboard.pos.display.sentHeading"),
    sentBody: t("dashboard.pos.display.sentBody"),
    sentSkipped: t("dashboard.pos.display.sentSkipped"),
    refusalInvalidEmail: t("dashboard.pos.display.refusalInvalidEmail"),
    refusalNotPaid: t("dashboard.pos.display.refusalNotPaid"),
    refusalSendFailed: t("dashboard.pos.display.refusalSendFailed"),
    refusalUnavailable: t("dashboard.pos.display.refusalUnavailable"),
    readUnavailable: t("dashboard.pos.display.readUnavailable"),
    notAllowed: t("dashboard.pos.display.notAllowed"),
  };
}

/** The counter-side link to the display, on the rail. */
export function customerDisplayLinkCopy(t: Translator): { label: string; hint: string } {
  return {
    label: t("dashboard.pos.display.openLink"),
    hint: t("dashboard.pos.display.openHint"),
  };
}

export type ScanCopy = {
  readonly ready: string;
  readonly added: string;
  readonly addedDetail: string;
  readonly noMatch: string;
  readonly unavailable: string;
  readonly dismiss: string;
  readonly undo: string;
};

/** The scanner's chip and toasts on the Sell screen (C23, C24). */
export function scanCopy(t: Translator): ScanCopy {
  return {
    ready: t("dashboard.pos.counter.scan.ready"),
    added: t("dashboard.pos.counter.scan.added"),
    addedDetail: t("dashboard.pos.counter.scan.addedDetail"),
    noMatch: t("dashboard.pos.counter.scan.noMatch"),
    unavailable: t("dashboard.pos.counter.scan.unavailable"),
    dismiss: t("dashboard.pos.counter.scan.dismiss"),
    undo: t("dashboard.pos.counter.scan.undo"),
  };
}
