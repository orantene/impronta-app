/**
 * classes-copy-flows.ts — the words of the Front desk's two multi-step
 * sheets: the New booking flow (boards A01 to A06) and the Move sheet (A09).
 * Split from `classes-copy.ts` so that file stays under the line budget;
 * same contract (literal keys, one translator call per leaf), and the same
 * static test walks these bags in the three languages.
 */

import type { Translator } from "./translator";

export type ClassesBookingCopy = {
  readonly titleBooked: string;
  readonly titleReview: string;
  readonly at: string;
  readonly itineraryEnd: string;
  readonly subtitleBooked: string;
  readonly preferred: string;
  readonly preferredOff: string;
  readonly personLine: string;
  readonly filterLabel: string;
  readonly filterMorning: string;
  readonly filterAfternoon: string;
  readonly filterAny: string;
  readonly slotEnds: string;
  readonly slotsNote: string;
  readonly itineraryPick: string;
  readonly seesNote: string;
  readonly theCustomer: string;
  readonly depositNow: string;
  readonly guaranteedLine: string;
  readonly intake: string;
  readonly intakeOff: string;
  readonly notesStaff: string;
  readonly notesCustomer: string;
  readonly remindersSms: string;
  readonly remindersEmail: string;
  readonly balanceRow: string;
  readonly cancelFreeRow: string;
  readonly cancelFreeNone: string;
  readonly saveDraft: string;
  readonly saveDraftOff: string;
  readonly hold: string;
  readonly holdOff: string;
  readonly payHow: string;
  readonly cardNow: string;
  readonly cardNowOff: string;
  readonly paymentLink: string;
  readonly paymentLinkOff: string;
  readonly cash: string;
  readonly cashLine: string;
  readonly noDeposit: string;
  readonly noDepositOff: string;
  readonly confirmFootnote: string;
  readonly confirmSms: string;
  readonly alsoEmail: string;
  readonly livesRecord: string;
  readonly livesRecordValue: string;
  readonly livesPersonToday: string;
  readonly livesPersonTodayValue: string;
  readonly livesNote: string;
  readonly title: string;
  readonly subtitleNew: string;
  readonly subtitleNamed: string;
  readonly search: string;
  readonly noServices: string;
  readonly serviceLine: string;
  readonly oneServiceNote: string;
  readonly thisBooking: string;
  readonly nothingYet: string;
  readonly customerTime: string;
  readonly total: string;
  readonly deposit: string;
  readonly depositNone: string;
  readonly continuePeople: string;
  readonly findTimes: string;
  readonly chooseTime: string;
  readonly chooseTimeNone: string;
  readonly reviewBooking: string;
  readonly confirm: string;
  readonly back: string;
  readonly professional: string;
  readonly guaranteed: string;
  readonly professionalHint: string;
  readonly where: string;
  readonly whereHint: string;
  readonly needed: string;
  readonly neededPeople: string;
  readonly neededPeopleValue: string;
  readonly neededRooms: string;
  readonly neededRoomsValue: string;
  readonly neededBuffers: string;
  readonly neededBuffersValue: string;
  readonly days: string;
  readonly itinerary: string;
  readonly itineraryLine: string;
  readonly itineraryNone: string;
  readonly customer: string;
  readonly whoIsItFor: string;
  readonly whoIsItForValue: string;
  readonly notes: string;
  readonly notesOff: string;
  readonly reminders: string;
  readonly remindersOff: string;
  readonly reviewLines: string;
  readonly reviewWhen: string;
  readonly reviewWith: string;
  readonly reviewPay: string;
  readonly reviewPayValue: string;
  readonly reviewNote: string;
  readonly bookedTitle: string;
  readonly bookedLine: string;
  readonly payDue: string;
  readonly payNothing: string;
  readonly chipConfirmed: string;
  readonly chipPaid: string;
  readonly chipUnpaid: string;
  readonly lives: string;
  readonly livesCalendar: string;
  readonly livesCalendarValue: string;
  readonly livesSales: string;
  readonly livesSalesValue: string;
  readonly livesSalesNone: string;
  readonly livesCustomer: string;
  readonly livesCustomerValue: string;
  readonly confirmationOff: string;
  readonly collectNow: string;
  readonly done: string;
  readonly another: string;
  readonly step: Readonly<
    Record<"service" | "people" | "time" | "details" | "review", string>
  >;
};
export type ClassesMoveCopy = {
  /** "Move {name}'s booking" */
  readonly title: string;
  /** "The {time} stays until the new time is confirmed" */
  readonly subtitle: string;
  readonly days: string;
  readonly loading: string;
  /** "{name} · free" */
  readonly withPerson: string;
  readonly anotherTime: string;
  readonly anotherTimeHint: string;
  readonly new: string;
  readonly newNone: string;
  readonly price: string;
  readonly priceUnchanged: string;
  readonly priceNone: string;
  readonly deposit: string;
  readonly depositStays: string;
  readonly depositNone: string;
  readonly policy: string;
  readonly policyOff: string;
  readonly oldSlot: string;
  readonly oldSlotRule: string;
  /** "Keep {time}" */
  readonly keep: string;
  /** "Move to {time}" */
  readonly moveTo: string;
  readonly moveNone: string;
};

export function bookingCopy(t: Translator): ClassesBookingCopy {
  return {
    titleBooked: t("dashboard.pos.classes.board.booking.titleBooked"),
    titleReview: t("dashboard.pos.classes.board.booking.titleReview"),
    at: t("dashboard.pos.classes.board.booking.at"),
    itineraryEnd: t("dashboard.pos.classes.board.booking.itineraryEnd"),
    subtitleBooked: t("dashboard.pos.classes.board.booking.subtitleBooked"),
    preferred: t("dashboard.pos.classes.board.booking.preferred"),
    preferredOff: t("dashboard.pos.classes.board.booking.preferredOff"),
    personLine: t("dashboard.pos.classes.board.booking.personLine"),
    filterLabel: t("dashboard.pos.classes.board.booking.filterLabel"),
    filterMorning: t("dashboard.pos.classes.board.booking.filterMorning"),
    filterAfternoon: t("dashboard.pos.classes.board.booking.filterAfternoon"),
    filterAny: t("dashboard.pos.classes.board.booking.filterAny"),
    slotEnds: t("dashboard.pos.classes.board.booking.slotEnds"),
    slotsNote: t("dashboard.pos.classes.board.booking.slotsNote"),
    itineraryPick: t("dashboard.pos.classes.board.booking.itineraryPick"),
    seesNote: t("dashboard.pos.classes.board.booking.seesNote"),
    theCustomer: t("dashboard.pos.classes.board.booking.theCustomer"),
    depositNow: t("dashboard.pos.classes.board.booking.depositNow"),
    guaranteedLine: t("dashboard.pos.classes.board.booking.guaranteedLine"),
    intake: t("dashboard.pos.classes.board.booking.intake"),
    intakeOff: t("dashboard.pos.classes.board.booking.intakeOff"),
    notesStaff: t("dashboard.pos.classes.board.booking.notesStaff"),
    notesCustomer: t("dashboard.pos.classes.board.booking.notesCustomer"),
    remindersSms: t("dashboard.pos.classes.board.booking.remindersSms"),
    remindersEmail: t("dashboard.pos.classes.board.booking.remindersEmail"),
    balanceRow: t("dashboard.pos.classes.board.booking.balanceRow"),
    cancelFreeRow: t("dashboard.pos.classes.board.booking.cancelFreeRow"),
    cancelFreeNone: t("dashboard.pos.classes.board.booking.cancelFreeNone"),
    saveDraft: t("dashboard.pos.classes.board.booking.saveDraft"),
    saveDraftOff: t("dashboard.pos.classes.board.booking.saveDraftOff"),
    hold: t("dashboard.pos.classes.board.booking.hold"),
    holdOff: t("dashboard.pos.classes.board.booking.holdOff"),
    payHow: t("dashboard.pos.classes.board.booking.payHow"),
    cardNow: t("dashboard.pos.classes.board.booking.cardNow"),
    cardNowOff: t("dashboard.pos.classes.board.booking.cardNowOff"),
    paymentLink: t("dashboard.pos.classes.board.booking.paymentLink"),
    paymentLinkOff: t("dashboard.pos.classes.board.booking.paymentLinkOff"),
    cash: t("dashboard.pos.classes.board.booking.cash"),
    cashLine: t("dashboard.pos.classes.board.booking.cashLine"),
    noDeposit: t("dashboard.pos.classes.board.booking.noDeposit"),
    noDepositOff: t("dashboard.pos.classes.board.booking.noDepositOff"),
    confirmFootnote: t("dashboard.pos.classes.board.booking.confirmFootnote"),
    confirmSms: t("dashboard.pos.classes.board.booking.confirmSms"),
    alsoEmail: t("dashboard.pos.classes.board.booking.alsoEmail"),
    livesRecord: t("dashboard.pos.classes.board.booking.livesRecord"),
    livesRecordValue: t("dashboard.pos.classes.board.booking.livesRecordValue"),
    livesPersonToday: t("dashboard.pos.classes.board.booking.livesPersonToday"),
    livesPersonTodayValue: t("dashboard.pos.classes.board.booking.livesPersonTodayValue"),
    livesNote: t("dashboard.pos.classes.board.booking.livesNote"),
    title: t("dashboard.pos.classes.board.booking.title"),
    subtitleNew: t("dashboard.pos.classes.board.booking.subtitleNew"),
    subtitleNamed: t("dashboard.pos.classes.board.booking.subtitleNamed"),
    search: t("dashboard.pos.classes.board.booking.search"),
    noServices: t("dashboard.pos.classes.board.booking.noServices"),
    serviceLine: t("dashboard.pos.classes.board.booking.serviceLine"),
    oneServiceNote: t("dashboard.pos.classes.board.booking.oneServiceNote"),
    thisBooking: t("dashboard.pos.classes.board.booking.thisBooking"),
    nothingYet: t("dashboard.pos.classes.board.booking.nothingYet"),
    customerTime: t("dashboard.pos.classes.board.booking.customerTime"),
    total: t("dashboard.pos.classes.board.booking.total"),
    deposit: t("dashboard.pos.classes.board.booking.deposit"),
    depositNone: t("dashboard.pos.classes.board.booking.depositNone"),
    continuePeople: t("dashboard.pos.classes.board.booking.continuePeople"),
    findTimes: t("dashboard.pos.classes.board.booking.findTimes"),
    chooseTime: t("dashboard.pos.classes.board.booking.chooseTime"),
    chooseTimeNone: t("dashboard.pos.classes.board.booking.chooseTimeNone"),
    reviewBooking: t("dashboard.pos.classes.board.booking.reviewBooking"),
    confirm: t("dashboard.pos.classes.board.booking.confirm"),
    back: t("dashboard.pos.classes.board.booking.back"),
    professional: t("dashboard.pos.classes.board.booking.professional"),
    guaranteed: t("dashboard.pos.classes.board.booking.guaranteed"),
    professionalHint: t("dashboard.pos.classes.board.booking.professionalHint"),
    where: t("dashboard.pos.classes.board.booking.where"),
    whereHint: t("dashboard.pos.classes.board.booking.whereHint"),
    needed: t("dashboard.pos.classes.board.booking.needed"),
    neededPeople: t("dashboard.pos.classes.board.booking.neededPeople"),
    neededPeopleValue: t(
      "dashboard.pos.classes.board.booking.neededPeopleValue",
    ),
    neededRooms: t("dashboard.pos.classes.board.booking.neededRooms"),
    neededRoomsValue: t("dashboard.pos.classes.board.booking.neededRoomsValue"),
    neededBuffers: t("dashboard.pos.classes.board.booking.neededBuffers"),
    neededBuffersValue: t(
      "dashboard.pos.classes.board.booking.neededBuffersValue",
    ),
    days: t("dashboard.pos.classes.board.booking.days"),
    itinerary: t("dashboard.pos.classes.board.booking.itinerary"),
    itineraryLine: t("dashboard.pos.classes.board.booking.itineraryLine"),
    itineraryNone: t("dashboard.pos.classes.board.booking.itineraryNone"),
    customer: t("dashboard.pos.classes.board.booking.customer"),
    whoIsItFor: t("dashboard.pos.classes.board.booking.whoIsItFor"),
    whoIsItForValue: t("dashboard.pos.classes.board.booking.whoIsItForValue"),
    notes: t("dashboard.pos.classes.board.booking.notes"),
    notesOff: t("dashboard.pos.classes.board.booking.notesOff"),
    reminders: t("dashboard.pos.classes.board.booking.reminders"),
    remindersOff: t("dashboard.pos.classes.board.booking.remindersOff"),
    reviewLines: t("dashboard.pos.classes.board.booking.reviewLines"),
    reviewWhen: t("dashboard.pos.classes.board.booking.reviewWhen"),
    reviewWith: t("dashboard.pos.classes.board.booking.reviewWith"),
    reviewPay: t("dashboard.pos.classes.board.booking.reviewPay"),
    reviewPayValue: t("dashboard.pos.classes.board.booking.reviewPayValue"),
    reviewNote: t("dashboard.pos.classes.board.booking.reviewNote"),
    bookedTitle: t("dashboard.pos.classes.board.booking.bookedTitle"),
    bookedLine: t("dashboard.pos.classes.board.booking.bookedLine"),
    payDue: t("dashboard.pos.classes.board.booking.payDue"),
    payNothing: t("dashboard.pos.classes.board.booking.payNothing"),
    chipConfirmed: t("dashboard.pos.classes.board.booking.chipConfirmed"),
    chipPaid: t("dashboard.pos.classes.board.booking.chipPaid"),
    chipUnpaid: t("dashboard.pos.classes.board.booking.chipUnpaid"),
    lives: t("dashboard.pos.classes.board.booking.lives"),
    livesCalendar: t("dashboard.pos.classes.board.booking.livesCalendar"),
    livesCalendarValue: t(
      "dashboard.pos.classes.board.booking.livesCalendarValue",
    ),
    livesSales: t("dashboard.pos.classes.board.booking.livesSales"),
    livesSalesValue: t("dashboard.pos.classes.board.booking.livesSalesValue"),
    livesSalesNone: t("dashboard.pos.classes.board.booking.livesSalesNone"),
    livesCustomer: t("dashboard.pos.classes.board.booking.livesCustomer"),
    livesCustomerValue: t(
      "dashboard.pos.classes.board.booking.livesCustomerValue",
    ),
    confirmationOff: t("dashboard.pos.classes.board.booking.confirmationOff"),
    collectNow: t("dashboard.pos.classes.board.booking.collectNow"),
    done: t("dashboard.pos.classes.board.booking.done"),
    another: t("dashboard.pos.classes.board.booking.another"),
    step: {
      service: t("dashboard.pos.classes.board.booking.step.service"),
      people: t("dashboard.pos.classes.board.booking.step.people"),
      time: t("dashboard.pos.classes.board.booking.step.time"),
      details: t("dashboard.pos.classes.board.booking.step.details"),
      review: t("dashboard.pos.classes.board.booking.step.review"),
    },
  };
}
export function moveCopy(t: Translator): ClassesMoveCopy {
  return {
    title: t("dashboard.pos.classes.board.move.title"),
    subtitle: t("dashboard.pos.classes.board.move.subtitle"),
    days: t("dashboard.pos.classes.board.move.days"),
    loading: t("dashboard.pos.classes.board.move.loading"),
    withPerson: t("dashboard.pos.classes.board.move.withPerson"),
    anotherTime: t("dashboard.pos.classes.board.move.anotherTime"),
    anotherTimeHint: t("dashboard.pos.classes.board.move.anotherTimeHint"),
    new: t("dashboard.pos.classes.board.move.new"),
    newNone: t("dashboard.pos.classes.board.move.newNone"),
    price: t("dashboard.pos.classes.board.move.price"),
    priceUnchanged: t("dashboard.pos.classes.board.move.priceUnchanged"),
    priceNone: t("dashboard.pos.classes.board.move.priceNone"),
    deposit: t("dashboard.pos.classes.board.move.deposit"),
    depositStays: t("dashboard.pos.classes.board.move.depositStays"),
    depositNone: t("dashboard.pos.classes.board.move.depositNone"),
    policy: t("dashboard.pos.classes.board.move.policy"),
    policyOff: t("dashboard.pos.classes.board.move.policyOff"),
    oldSlot: t("dashboard.pos.classes.board.move.oldSlot"),
    oldSlotRule: t("dashboard.pos.classes.board.move.oldSlotRule"),
    keep: t("dashboard.pos.classes.board.move.keep"),
    moveTo: t("dashboard.pos.classes.board.move.moveTo"),
    moveNone: t("dashboard.pos.classes.board.move.moveNone"),
  };
}
