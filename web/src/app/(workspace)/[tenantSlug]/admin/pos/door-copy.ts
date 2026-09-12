/**
 * door-copy.ts — the Door mode's copy, built from a translator once per
 * render, the same way `pos-copy.ts` builds the counter's.
 *
 * Every key is a literal string so `message-key-usage.static.test.ts` can see
 * each call site; a key built from a template would be invisible to that
 * guard rather than checked by it. The verdict sentences are keyed by
 * `DoorVerdictKey` so an outcome the engine gains without a sentence here is
 * a compile error at this map, not an English literal on a tablet.
 *
 * The boards: G01 to G08 (the gate), G06 (the box office), E01 to E07 (a
 * sale), E09, E10, E13 and E15 (the lookup and what can change on a ticket).
 */

import type { Translator } from "@/components/admin/pos";
import { REFUND_DESK_KEY, type RefundDeskOutcome } from "@/lib/orders/refund-desk-copy";
import type { DoorVerdictKey } from "@/lib/pos/door-model";

export type DoorCopy = {
  readonly rail: Readonly<Record<string, string>>;
  readonly railLabel: string;
  readonly clock: string;
  readonly noSessions: string;
  readonly loadFailed: string;
  readonly header: {
    gate: string;
    gateNoEvent: string;
    box: string;
    boxNoEvent: string;
    lookup: string;
    lookupSubtitle: string;
    subtitle: string;
    inChip: string;
    leftTonight: string;
    sharedWithWebsite: string;
    receiptsSubtitle: string;
  };
  readonly pick: { title: string; intro: string; tonight: string; comingUp: string; counts: string; noPool: string; open: string };
  readonly gate: {
    ready: string;
    readyHint: string;
    scanLabel: string;
    scanPlaceholder: string;
    admit: string;
    lookupByName: string;
    switchToBox: string;
    next: string;
    redeemMeal: string;
    redeemMealReason: string;
    letInAnyway: string;
    letInAnywayReason: string;
    exchangeDate: string;
    exchangeDateReason: string;
    lookUpOrder: string;
    detail: Readonly<Record<DoorVerdictKey, string>>;
    headline: Readonly<Record<DoorVerdictKey, string>>;
    noScanOut: string;
  };
  readonly lookup: {
    eyebrow: string;
    placeholder: string;
    hint: string;
    empty: string;
    noMatch: string;
    tonight: string;
    orderLine: string;
    orderCard: string;
    ticketsOf: string;
    ticket: string;
    party: string;
    walkUp: string;
    unnamed: string;
    admitted: string;
    admittedAt: string;
    valid: string;
    validNameAtDoor: string;
    refunded: string;
    cancelled: string;
    noShow: string;
    partial: string;
    admitTicket: string;
    admitMany: string;
    resendAll: string;
    resendAllReason: string;
    lookupNote: string;
    change: string;
    delivery: string;
  };
  readonly manual: {
    title: string;
    subtitle: string;
    right: string;
    entrance: string;
    entranceValue: string;
    counts: string;
    countsValue: string;
    after: string;
    afterValue: string;
    reason: string;
    reasonReason: string;
    authorizedBy: string;
    authorizedByReason: string;
    footerNote: string;
    cancel: string;
    admit: string;
    close: string;
  };
  readonly box: {
    eyebrowEvents: string;
    eyebrowDates: string;
    eventNights: string;
    onSale: string;
    tonight: string;
    selected: string;
    left: string;
    noPool: string;
    continueDate: string;
    pickDate: string;
    tierLeft: string;
    tierNoPool: string;
    tierSoldOut: string;
    noTiers: string;
    minus: string;
    plus: string;
    buyer: string;
    buyerSet: string;
    notHeldYet: string;
    namesAtGate: string;
    fees: string;
    feesIncluded: string;
    total: string;
    continueTickets: string;
    continueHint: string;
    charge: string;
    scan: string;
    findOrder: string;
    recent: string;
    recentEmpty: string;
    drawerOpen: string;
    drawerNone: string;
    soldChip: string;
    cancelSale: string;
    back: string;
  };
  readonly attendees: {
    title: string;
    subtitle: string;
    buyerEyebrow: string;
    buyerHint: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone: string;
    contactHint: string;
    eyebrow: string;
    attendeeNumber: string;
    attendeePlaceholder: string;
    attendeeHint: string;
    sameAsBuyer: string;
    review: string;
    releaseBack: string;
  };
  readonly issued: {
    title: string;
    titleMany: string;
    subtitle: string;
    paid: string;
    ticketsIssued: string;
    sentByEmail: string;
    sentByEmailReason: string;
    eyebrow: string;
    named: string;
    unnamed: string;
    code: string;
    codeUnavailable: string;
    print: string;
    printReason: string;
    text: string;
    textReason: string;
    resend: string;
    resendReason: string;
    receipt: string;
    next: string;
    pendingTitle: string;
    pendingHeadline: string;
    pendingDetail: string;
    pendingPill: string;
    tryAgain: string;
    paperConfirmation: string;
    paperConfirmationReason: string;
    ifFails: string;
    places: string;
    placesValue: string;
    gate: string;
    gateValue: string;
    issue: string;
    issueValue: string;
    never: string;
    neverValue: string;
  };
  readonly change: {
    title: string;
    subtitle: string;
    transfer: string;
    transferNote: string;
    transferReason: string;
    transferAction: string;
    transferToName: string;
    transferToEmail: string;
    transferred: string;
    exchange: string;
    exchangeNote: string;
    exchangeReason: string;
    exchangeAction: string;
    exchangeNight: string;
    exchanged: string;
    noOtherNight: string;
    cancel: string;
    cancelNote: string;
    cancelAction: string;
    cancelConfirm: string;
    cancelDone: string;
    name: string;
    nameNote: string;
    nameNoteNamed: string;
    nameAction: string;
    namePlaceholder: string;
    nameSave: string;
    nameDone: string;
    nameAlready: string;
    nameNotValid: string;
    footnote: string;
    back: string;
  };
  /** The refunds desk's own sentences, one per outcome (E10 Cancel & refund). */
  readonly refundOutcome: Readonly<Record<RefundDeskOutcome, string>>;
  readonly deliveryPanel: {
    title: string;
    subtitle: string;
    email: string;
    emailNone: string;
    emailStatus: string;
    resend: string;
    resendReason: string;
    sms: string;
    smsStatus: string;
    printed: string;
    printedStatus: string;
    wallet: string;
    walletStatus: string;
    notAvailable: string;
    footnote: string;
    back: string;
  };
};

export function doorCopy(t: Translator): DoorCopy {
  return {
    rail: {
      tickets: t("dashboard.pos.door.rail.tickets"),
      checkin: t("dashboard.pos.door.rail.checkin"),
      lookup: t("dashboard.pos.door.rail.lookup"),
      receipts: t("dashboard.pos.door.rail.receipts"),
      issues: t("dashboard.pos.door.rail.issues"),
    },
    railLabel: t("dashboard.pos.door.rail.label"),
    clock: t("dashboard.pos.door.clock"),
    noSessions: t("dashboard.pos.door.noSessions"),
    loadFailed: t("dashboard.pos.door.loadFailed"),
    header: {
      gate: t("dashboard.pos.door.header.gate"),
      gateNoEvent: t("dashboard.pos.door.header.gateNoEvent"),
      box: t("dashboard.pos.door.header.box"),
      boxNoEvent: t("dashboard.pos.door.header.boxNoEvent"),
      lookup: t("dashboard.pos.door.header.lookup"),
      lookupSubtitle: t("dashboard.pos.door.header.lookupSubtitle"),
      subtitle: t("dashboard.pos.door.header.subtitle"),
      inChip: t("dashboard.pos.door.header.inChip"),
      leftTonight: t("dashboard.pos.door.header.leftTonight"),
      sharedWithWebsite: t("dashboard.pos.door.header.sharedWithWebsite"),
      receiptsSubtitle: t("dashboard.pos.door.header.receiptsSubtitle"),
    },
    pick: {
      title: t("dashboard.pos.door.pick.title"),
      intro: t("dashboard.pos.door.pick.intro"),
      tonight: t("dashboard.pos.door.pick.tonight"),
      comingUp: t("dashboard.pos.door.pick.comingUp"),
      counts: t("dashboard.pos.door.pick.counts"),
      noPool: t("dashboard.pos.door.pick.noPool"),
      open: t("dashboard.pos.door.pick.open"),
    },
    gate: {
      ready: t("dashboard.pos.door.gate.ready"),
      readyHint: t("dashboard.pos.door.gate.readyHint"),
      scanLabel: t("dashboard.pos.door.gate.scanLabel"),
      scanPlaceholder: t("dashboard.pos.door.gate.scanPlaceholder"),
      admit: t("dashboard.pos.door.gate.admit"),
      lookupByName: t("dashboard.pos.door.gate.lookupByName"),
      switchToBox: t("dashboard.pos.door.gate.switchToBox"),
      next: t("dashboard.pos.door.gate.next"),
      redeemMeal: t("dashboard.pos.door.gate.redeemMeal"),
      redeemMealReason: t("dashboard.pos.door.gate.redeemMealReason"),
      letInAnyway: t("dashboard.pos.door.gate.letInAnyway"),
      letInAnywayReason: t("dashboard.pos.door.gate.letInAnywayReason"),
      exchangeDate: t("dashboard.pos.door.gate.exchangeDate"),
      exchangeDateReason: t("dashboard.pos.door.gate.exchangeDateReason"),
      lookUpOrder: t("dashboard.pos.door.gate.lookUpOrder"),
      headline: {
        admitted: t("dashboard.pos.door.gate.headline.admitted"),
        admittedParty: t("dashboard.pos.door.gate.headline.admittedParty"),
        admittedWasNoShow: t("dashboard.pos.door.gate.headline.admittedWasNoShow"),
        alreadyIn: t("dashboard.pos.door.gate.headline.alreadyIn"),
        superseded: t("dashboard.pos.door.gate.headline.superseded"),
        wrongNightDated: t("dashboard.pos.door.gate.headline.wrongNightDated"),
        wrongNight: t("dashboard.pos.door.gate.headline.wrongNight"),
        refunded: t("dashboard.pos.door.gate.headline.refunded"),
        cancelled: t("dashboard.pos.door.gate.headline.cancelled"),
        forged: t("dashboard.pos.door.gate.headline.forged"),
        unknown: t("dashboard.pos.door.gate.headline.unknown"),
        tooMany: t("dashboard.pos.door.gate.headline.tooMany"),
        misconfigured: t("dashboard.pos.door.gate.headline.misconfigured"),
        engineError: t("dashboard.pos.door.gate.headline.engineError"),
      },
      detail: {
        admitted: t("dashboard.pos.door.gate.detail.admitted"),
        admittedParty: t("dashboard.pos.door.gate.detail.admittedParty"),
        admittedWasNoShow: t("dashboard.pos.door.gate.detail.admittedWasNoShow"),
        alreadyIn: t("dashboard.pos.door.gate.detail.alreadyIn"),
        superseded: t("dashboard.pos.door.gate.detail.superseded"),
        wrongNightDated: t("dashboard.pos.door.gate.detail.wrongNightDated"),
        wrongNight: t("dashboard.pos.door.gate.detail.wrongNight"),
        refunded: t("dashboard.pos.door.gate.detail.refunded"),
        cancelled: t("dashboard.pos.door.gate.detail.cancelled"),
        forged: t("dashboard.pos.door.gate.detail.forged"),
        unknown: t("dashboard.pos.door.gate.detail.unknown"),
        tooMany: t("dashboard.pos.door.gate.detail.tooMany"),
        misconfigured: t("dashboard.pos.door.gate.detail.misconfigured"),
        engineError: t("dashboard.pos.door.gate.detail.engineError"),
      },
      noScanOut: t("dashboard.pos.door.gate.noScanOut"),
    },
    lookup: {
      eyebrow: t("dashboard.pos.door.lookup.eyebrow"),
      placeholder: t("dashboard.pos.door.lookup.placeholder"),
      hint: t("dashboard.pos.door.lookup.hint"),
      empty: t("dashboard.pos.door.lookup.empty"),
      noMatch: t("dashboard.pos.door.lookup.noMatch"),
      tonight: t("dashboard.pos.door.lookup.tonight"),
      orderLine: t("dashboard.pos.door.lookup.orderLine"),
      orderCard: t("dashboard.pos.door.lookup.orderCard"),
      ticketsOf: t("dashboard.pos.door.lookup.ticketsOf"),
      ticket: t("dashboard.pos.door.lookup.ticket"),
      party: t("dashboard.pos.door.lookup.party"),
      walkUp: t("dashboard.pos.door.lookup.walkUp"),
      unnamed: t("dashboard.pos.door.lookup.unnamed"),
      admitted: t("dashboard.pos.door.lookup.admitted"),
      admittedAt: t("dashboard.pos.door.lookup.admittedAt"),
      valid: t("dashboard.pos.door.lookup.valid"),
      validNameAtDoor: t("dashboard.pos.door.lookup.validNameAtDoor"),
      refunded: t("dashboard.pos.door.lookup.refunded"),
      cancelled: t("dashboard.pos.door.lookup.cancelled"),
      noShow: t("dashboard.pos.door.lookup.noShow"),
      partial: t("dashboard.pos.door.lookup.partial"),
      admitTicket: t("dashboard.pos.door.lookup.admitTicket"),
      admitMany: t("dashboard.pos.door.lookup.admitMany"),
      resendAll: t("dashboard.pos.door.lookup.resendAll"),
      resendAllReason: t("dashboard.pos.door.lookup.resendAllReason"),
      lookupNote: t("dashboard.pos.door.lookup.note"),
      change: t("dashboard.pos.door.lookup.change"),
      delivery: t("dashboard.pos.door.lookup.delivery"),
    },
    manual: {
      title: t("dashboard.pos.door.manual.title"),
      subtitle: t("dashboard.pos.door.manual.subtitle"),
      right: t("dashboard.pos.door.manual.right"),
      entrance: t("dashboard.pos.door.manual.entrance"),
      entranceValue: t("dashboard.pos.door.manual.entranceValue"),
      counts: t("dashboard.pos.door.manual.counts"),
      countsValue: t("dashboard.pos.door.manual.countsValue"),
      after: t("dashboard.pos.door.manual.after"),
      afterValue: t("dashboard.pos.door.manual.afterValue"),
      reason: t("dashboard.pos.door.manual.reason"),
      reasonReason: t("dashboard.pos.door.manual.reasonReason"),
      authorizedBy: t("dashboard.pos.door.manual.authorizedBy"),
      authorizedByReason: t("dashboard.pos.door.manual.authorizedByReason"),
      footerNote: t("dashboard.pos.door.manual.footerNote"),
      cancel: t("dashboard.pos.door.manual.cancel"),
      admit: t("dashboard.pos.door.manual.admit"),
      close: t("dashboard.pos.door.manual.close"),
    },
    box: {
      eyebrowEvents: t("dashboard.pos.door.box.eyebrowEvents"),
      eyebrowDates: t("dashboard.pos.door.box.eyebrowDates"),
      eventNights: t("dashboard.pos.door.box.eventNights"),
      onSale: t("dashboard.pos.door.box.onSale"),
      tonight: t("dashboard.pos.door.box.tonight"),
      selected: t("dashboard.pos.door.box.selected"),
      left: t("dashboard.pos.door.box.left"),
      noPool: t("dashboard.pos.door.box.noPool"),
      continueDate: t("dashboard.pos.door.box.continueDate"),
      pickDate: t("dashboard.pos.door.box.pickDate"),
      tierLeft: t("dashboard.pos.door.box.tierLeft"),
      tierNoPool: t("dashboard.pos.door.box.tierNoPool"),
      tierSoldOut: t("dashboard.pos.door.box.tierSoldOut"),
      noTiers: t("dashboard.pos.door.box.noTiers"),
      minus: t("dashboard.pos.door.box.minus"),
      plus: t("dashboard.pos.door.box.plus"),
      buyer: t("dashboard.pos.door.box.buyer"),
      buyerSet: t("dashboard.pos.door.box.buyerSet"),
      notHeldYet: t("dashboard.pos.door.box.notHeldYet"),
      namesAtGate: t("dashboard.pos.door.box.namesAtGate"),
      fees: t("dashboard.pos.door.box.fees"),
      feesIncluded: t("dashboard.pos.door.box.feesIncluded"),
      total: t("dashboard.pos.door.box.total"),
      continueTickets: t("dashboard.pos.door.box.continueTickets"),
      continueHint: t("dashboard.pos.door.box.continueHint"),
      charge: t("dashboard.pos.door.box.charge"),
      scan: t("dashboard.pos.door.box.scan"),
      findOrder: t("dashboard.pos.door.box.findOrder"),
      recent: t("dashboard.pos.door.box.recent"),
      recentEmpty: t("dashboard.pos.door.box.recentEmpty"),
      drawerOpen: t("dashboard.pos.door.box.drawerOpen"),
      drawerNone: t("dashboard.pos.door.box.drawerNone"),
      soldChip: t("dashboard.pos.door.box.soldChip"),
      cancelSale: t("dashboard.pos.door.box.cancelSale"),
      back: t("dashboard.pos.door.box.back"),
    },
    attendees: {
      title: t("dashboard.pos.door.attendees.title"),
      subtitle: t("dashboard.pos.door.attendees.subtitle"),
      buyerEyebrow: t("dashboard.pos.door.attendees.buyerEyebrow"),
      buyerHint: t("dashboard.pos.door.attendees.buyerHint"),
      buyerName: t("dashboard.pos.door.attendees.buyerName"),
      buyerEmail: t("dashboard.pos.door.attendees.buyerEmail"),
      buyerPhone: t("dashboard.pos.door.attendees.buyerPhone"),
      contactHint: t("dashboard.pos.door.attendees.contactHint"),
      eyebrow: t("dashboard.pos.door.attendees.eyebrow"),
      attendeeNumber: t("dashboard.pos.door.attendees.attendeeNumber"),
      attendeePlaceholder: t("dashboard.pos.door.attendees.attendeePlaceholder"),
      attendeeHint: t("dashboard.pos.door.attendees.attendeeHint"),
      sameAsBuyer: t("dashboard.pos.door.attendees.sameAsBuyer"),
      review: t("dashboard.pos.door.attendees.review"),
      releaseBack: t("dashboard.pos.door.attendees.releaseBack"),
    },
    issued: {
      title: t("dashboard.pos.door.issued.title"),
      titleMany: t("dashboard.pos.door.issued.titleMany"),
      subtitle: t("dashboard.pos.door.issued.subtitle"),
      paid: t("dashboard.pos.door.issued.paid"),
      ticketsIssued: t("dashboard.pos.door.issued.ticketsIssued"),
      sentByEmail: t("dashboard.pos.door.issued.sentByEmail"),
      sentByEmailReason: t("dashboard.pos.door.issued.sentByEmailReason"),
      eyebrow: t("dashboard.pos.door.issued.eyebrow"),
      named: t("dashboard.pos.door.issued.named"),
      unnamed: t("dashboard.pos.door.issued.unnamed"),
      code: t("dashboard.pos.door.issued.code"),
      codeUnavailable: t("dashboard.pos.door.issued.codeUnavailable"),
      print: t("dashboard.pos.door.issued.print"),
      printReason: t("dashboard.pos.door.issued.printReason"),
      text: t("dashboard.pos.door.issued.text"),
      textReason: t("dashboard.pos.door.issued.textReason"),
      resend: t("dashboard.pos.door.issued.resend"),
      resendReason: t("dashboard.pos.door.issued.resendReason"),
      receipt: t("dashboard.pos.door.issued.receipt"),
      next: t("dashboard.pos.door.issued.next"),
      pendingTitle: t("dashboard.pos.door.issued.pendingTitle"),
      pendingHeadline: t("dashboard.pos.door.issued.pendingHeadline"),
      pendingDetail: t("dashboard.pos.door.issued.pendingDetail"),
      pendingPill: t("dashboard.pos.door.issued.pendingPill"),
      tryAgain: t("dashboard.pos.door.issued.tryAgain"),
      paperConfirmation: t("dashboard.pos.door.issued.paperConfirmation"),
      paperConfirmationReason: t("dashboard.pos.door.issued.paperConfirmationReason"),
      ifFails: t("dashboard.pos.door.issued.ifFails"),
      places: t("dashboard.pos.door.issued.places"),
      placesValue: t("dashboard.pos.door.issued.placesValue"),
      gate: t("dashboard.pos.door.issued.gate"),
      gateValue: t("dashboard.pos.door.issued.gateValue"),
      issue: t("dashboard.pos.door.issued.issue"),
      issueValue: t("dashboard.pos.door.issued.issueValue"),
      never: t("dashboard.pos.door.issued.never"),
      neverValue: t("dashboard.pos.door.issued.neverValue"),
    },
    change: {
      title: t("dashboard.pos.door.change.title"),
      subtitle: t("dashboard.pos.door.change.subtitle"),
      transfer: t("dashboard.pos.door.change.transfer"),
      transferNote: t("dashboard.pos.door.change.transferNote"),
      transferReason: t("dashboard.pos.door.change.transferReason"),
      transferAction: t("dashboard.pos.door.change.transferAction"),
      transferToName: t("dashboard.pos.door.change.transferToName"),
      transferToEmail: t("dashboard.pos.door.change.transferToEmail"),
      transferred: t("dashboard.pos.door.change.transferred"),
      exchange: t("dashboard.pos.door.change.exchange"),
      exchangeNote: t("dashboard.pos.door.change.exchangeNote"),
      exchangeReason: t("dashboard.pos.door.change.exchangeReason"),
      exchangeAction: t("dashboard.pos.door.change.exchangeAction"),
      exchangeNight: t("dashboard.pos.door.change.exchangeNight"),
      exchanged: t("dashboard.pos.door.change.exchanged"),
      noOtherNight: t("dashboard.pos.door.change.noOtherNight"),
      cancel: t("dashboard.pos.door.change.cancel"),
      cancelNote: t("dashboard.pos.door.change.cancelNote"),
      cancelAction: t("dashboard.pos.door.change.cancelAction"),
      cancelConfirm: t("dashboard.pos.door.change.cancelConfirm"),
      cancelDone: t("dashboard.pos.door.change.cancelDone"),
      name: t("dashboard.pos.door.change.name"),
      nameNote: t("dashboard.pos.door.change.nameNote"),
      nameNoteNamed: t("dashboard.pos.door.change.nameNoteNamed"),
      nameAction: t("dashboard.pos.door.change.nameAction"),
      namePlaceholder: t("dashboard.pos.door.change.namePlaceholder"),
      nameSave: t("dashboard.pos.door.change.nameSave"),
      nameDone: t("dashboard.pos.door.change.nameDone"),
      nameAlready: t("dashboard.pos.door.change.nameAlready"),
      nameNotValid: t("dashboard.pos.door.change.nameNotValid"),
      footnote: t("dashboard.pos.door.change.footnote"),
      back: t("dashboard.pos.door.change.back"),
    },
    refundOutcome: {
      refunded: t(REFUND_DESK_KEY.refunded),
      pick_a_line: t(REFUND_DESK_KEY.pick_a_line),
      not_allowed: t(REFUND_DESK_KEY.not_allowed),
      invalid: t(REFUND_DESK_KEY.invalid),
      not_found: t(REFUND_DESK_KEY.not_found),
      nothing_to_refund: t(REFUND_DESK_KEY.nothing_to_refund),
      line_already_refunded: t(REFUND_DESK_KEY.line_already_refunded),
      exceeds_captured: t(REFUND_DESK_KEY.exceeds_captured),
      no_provider_charge: t(REFUND_DESK_KEY.no_provider_charge),
      provider_refused: t(REFUND_DESK_KEY.provider_refused),
      partial_failure: t(REFUND_DESK_KEY.partial_failure),
      unavailable: t(REFUND_DESK_KEY.unavailable),
    },
    deliveryPanel: {
      title: t("dashboard.pos.door.delivery.title"),
      subtitle: t("dashboard.pos.door.delivery.subtitle"),
      email: t("dashboard.pos.door.delivery.email"),
      emailNone: t("dashboard.pos.door.delivery.emailNone"),
      emailStatus: t("dashboard.pos.door.delivery.emailStatus"),
      resend: t("dashboard.pos.door.delivery.resend"),
      resendReason: t("dashboard.pos.door.delivery.resendReason"),
      sms: t("dashboard.pos.door.delivery.sms"),
      smsStatus: t("dashboard.pos.door.delivery.smsStatus"),
      printed: t("dashboard.pos.door.delivery.printed"),
      printedStatus: t("dashboard.pos.door.delivery.printedStatus"),
      wallet: t("dashboard.pos.door.delivery.wallet"),
      walletStatus: t("dashboard.pos.door.delivery.walletStatus"),
      notAvailable: t("dashboard.pos.door.delivery.notAvailable"),
      footnote: t("dashboard.pos.door.delivery.footnote"),
      back: t("dashboard.pos.door.delivery.back"),
    },
  };
}
