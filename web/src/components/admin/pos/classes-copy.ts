/**
 * classes-copy.ts — every sentence the Classes mode shows, built from a
 * translator once per render (the same contract as `pos-copy.ts`).
 *
 * Keys are literal strings on purpose: `message-key-usage.static.test.ts`
 * can only see a call shaped like `t("dashboard.pos.classes.rail.today")`.
 *
 * WHERE A SENTENCE ALREADY EXISTS, IT IS REUSED, NOT REWRITTEN. The
 * reschedule and the waitlist promote are the Appointments page's own proven
 * actions, so their refusals and confirmations come from
 * `dashboard.adminAppointments.*` — the same words the board says, so an
 * operator moving a booking from the till and from the board reads one
 * vocabulary. Only what this mode does on its own lives under
 * `dashboard.pos.classes.*`.
 */

import type { ClassesRefusalKey } from "@/lib/pos/classes/refusals";
import type { ClassesAppointmentState } from "@/lib/pos/classes/day";
import type { RescheduleRefusalKey } from "@/lib/scheduling/reschedule-refusal";
import type {
  AcceptWaitlistRefusalKey,
  PromoteWaitlistRefusalKey,
} from "@/lib/scheduling/session-waitlist";
import type { JoinWaitlistRefusalKey } from "@/lib/scheduling/waitlist-desk";

import { bookingCopy, moveCopy, type ClassesBookingCopy, type ClassesMoveCopy } from "./classes-copy-flows";
import type { Translator } from "./translator";

export type ClassesRailCopy = Readonly<Record<string, string>>;

export function classesRailCopy(t: Translator): ClassesRailCopy {
  return {
    today: t("dashboard.pos.classes.rail.today"),
    sessions: t("dashboard.pos.classes.rail.sessions"),
    walkin: t("dashboard.pos.classes.rail.walkin"),
    waitlist: t("dashboard.pos.classes.rail.waitlist"),
    messages: t("dashboard.pos.messages.title"),
  };
}

export function classesRailNavLabel(t: Translator): string {
  return t("dashboard.pos.classes.rail.label");
}

export type ClassesCopy = {
  readonly title: string;
  readonly day: {
    readonly today: string;
    readonly tomorrow: string;
    readonly yesterday: string;
    /** "{date} · {zone} time" */
    readonly clock: string;
    readonly prev: string;
    readonly next: string;
    readonly backToToday: string;
    readonly reload: string;
  };
  readonly state: Readonly<Record<ClassesAppointmentState, string>>;
  readonly today: {
    readonly heading: string;
    readonly empty: string;
    readonly checkIn: string;
    readonly checkingIn: string;
    readonly arrived: string;
    readonly move: string;
    readonly owed: string;
    readonly collect: string;
    readonly paid: string;
    readonly noOrder: string;
    readonly nobody: string;
  };
  readonly reschedule: {
    readonly heading: string;
    readonly newStart: string;
    readonly submit: string;
    readonly submitting: string;
    readonly cancel: string;
    readonly moved: string;
    readonly already: string;
    readonly needStart: string;
    readonly nonexistentTime: string;
    readonly refusal: Readonly<Record<RescheduleRefusalKey, string>>;
  };
  readonly sessions: {
    readonly heading: string;
    readonly empty: string;
    readonly seats: string;
    readonly seatsFull: string;
    readonly seatsUnknown: string;
    readonly seatsUncounted: string;
    readonly roster: string;
    readonly rosterEmpty: string;
    /** A ticket sold with no name on it. */
    readonly unnamed: string;
    readonly mark: string;
    readonly marking: string;
    readonly here: string;
    readonly partOfParty: string;
    readonly fromList: string;
    readonly fromListHint: string;
    readonly notValid: string;
    readonly bookSeat: string;
    readonly openQueue: string;
  };
  readonly walkin: {
    readonly heading: string;
    readonly kindAppointment: string;
    readonly kindSeat: string;
    readonly service: string;
    readonly noServices: string;
    readonly withPerson: string;
    readonly minutes: string;
    readonly pickTime: string;
    readonly loadingTimes: string;
    readonly noTimes: string;
    readonly session: string;
    readonly noSessions: string;
    readonly tier: string;
    readonly name: string;
    readonly email: string;
    readonly phone: string;
    readonly book: string;
    readonly booking: string;
    readonly booked: string;
    readonly seatBooked: string;
    readonly collect: string;
    readonly collecting: string;
    readonly collected: string;
    readonly nothingToCollect: string;
    readonly startAgain: string;
    readonly mustPayOnlineHint: string;
  };
  readonly waitlist: {
    readonly heading: string;
    readonly empty: string;
    readonly position: string;
    readonly nextInLine: string;
    readonly promote: string;
    readonly promoting: string;
    readonly promoted: string;
    readonly alreadyOffered: string;
    readonly accept: string;
    readonly accepting: string;
    readonly accepted: string;
    readonly decline: string;
    /** `{name}'s offer was withdrawn; the place goes to the next in line.` */
    readonly declined: string;
    readonly offerUntil: string;
    readonly state: Readonly<Record<"waiting" | "offered" | "expired" | "accepted" | "withdrawn", string>>;
    readonly join: {
      readonly heading: string;
      readonly name: string;
      readonly email: string;
      readonly submit: string;
      readonly submitting: string;
      readonly joined: string;
    };
    readonly promoteRefusal: Readonly<Record<PromoteWaitlistRefusalKey, string>>;
    readonly acceptRefusal: Readonly<Record<AcceptWaitlistRefusalKey, string>>;
    readonly joinRefusal: Readonly<Record<JoinWaitlistRefusalKey, string>>;
  };
  readonly refusal: Readonly<Record<ClassesRefusalKey, string>>;
  /**
   * The boards' own words (B01 Today, B02 Add extra, B04 Walk-in, B05 Class
   * check-in, B06 A place opened up). A control the engine has no action for
   * carries its reason here too, so the screen never draws a dead button.
   */
  readonly board: {
    readonly header: {
      /** "{date} · {appointments} appointments · {classes} classes" */
      readonly summary: string;
      readonly location: string;
      readonly operator: string;
    };
    readonly list: {
      readonly tabToday: string;
      readonly tabDue: string;
      readonly tabDone: string;
      readonly segAppts: string;
      readonly segClasses: string;
      readonly emptyDue: string;
      readonly emptyDone: string;
      readonly walkIn: string;
      readonly book: string;
      readonly pickOne: string;
      readonly pickSession: string;
      readonly classChip: string;
      readonly full: string;
      readonly here: string;
    };
    readonly detail: {
      readonly booked: string;
      readonly addedToday: string;
      readonly linesLoading: string;
      readonly linesUnreadable: string;
      readonly noLines: string;
      readonly addService: string;
      readonly product: string;
      readonly usePass: string;
      readonly usePassOff: string;
      readonly services: string;
      readonly retail: string;
      readonly depositPaid: string;
      readonly balanceDue: string;
      readonly whoDidWhat: string;
      readonly whoDidWhatOff: string;
      readonly sendLink: string;
      readonly sendLinkOff: string;
      readonly rebook: string;
      readonly rebookOff: string;
      readonly serviceDone: string;
      readonly checkedIn: string;
      readonly paidChip: string;
      readonly addOff: string;
      readonly lineDone: string;
      readonly lineAdded: string;
      readonly lineProduct: string;
      /** B03: `Linked from sale {reference} · payment only` */
      readonly linkedFrom: string;
      /** `From sale {reference}` */
      readonly fromSale: string;
      readonly linkedPayment: string;
      /** `Sale {reference} (linked)` */
      readonly linkedSale: string;
      /** `sale {reference} linked for payment` */
      readonly linkedChip: string;
    };
    readonly extra: {
      /** "Add to {name}'s appointment" */
      readonly title: string;
      readonly subtitle: string;
      readonly search: string;
      readonly noMatch: string;
      readonly minutes: string;
      readonly noTime: string;
      readonly timeNotReplanned: string;
      readonly timeNotReplannedShort: string;
      readonly newEndTime: string;
      /** "{time} · unchanged" */
      readonly endUnchanged: string;
      readonly newBalance: string;
      readonly who: string;
      /** "Add {item} · +{amount}" */
      readonly add: string;
      readonly adding: string;
      readonly added: string;
      readonly cancel: string;
    };
    readonly checkin: {
      readonly startsIn: string;
      readonly startedAgo: string;
      readonly fullChip: string;
      readonly bookedChip: string;
      readonly hereChip: string;
      readonly waitlistChip: string;
      readonly search: string;
      readonly tabAll: string;
      readonly tabNotHere: string;
      readonly tabProblems: string;
      readonly hereState: string;
      readonly bookedState: string;
      readonly cantAttend: string;
      readonly check: string;
      readonly undo: string;
      readonly undoOff: string;
      readonly fix: string;
      readonly fixOff: string;
      readonly places: string;
      readonly here: string;
      readonly waitlist: string;
      readonly positions: string;
      readonly positionsOff: string;
      readonly scanPass: string;
      readonly scanPassOff: string;
      readonly sellDropIn: string;
      readonly sellDropInFull: string;
      readonly sellDropInOff: string;
      readonly addToWaitlist: string;
      readonly substitute: string;
      readonly substituteOff: string;
      readonly closeCheckin: string;
      readonly closeCheckinOff: string;
      readonly nobody: string;
      readonly notValidNotice: string;
    };
    readonly opened: {
      readonly title: string;
      /** "{free} free · {waiting} waiting" */
      readonly subtitle: string;
      /** "Offer it to {name} (waitlist #{n})" */
      readonly offerTo: string;
      /** "They get {minutes} min to say yes" */
      readonly offerHint: string;
      readonly sellDropIn: string;
      readonly sellHint: string;
      readonly leaveEmpty: string;
      readonly later: string;
      /** "Offer to {name}" */
      readonly offerButton: string;
      readonly policyNote: string;
    };
    /** A01 to A06 (the New booking flow) and A09 (the move): `classes-copy-flows.ts`. */
    readonly booking: ClassesBookingCopy;
    readonly move: ClassesMoveCopy;
    readonly sheet: {
      readonly title: string;
      readonly subtitle: string;
      readonly bookTitle: string;
      readonly bookSubtitle: string;
      readonly customer: string;
      readonly customerHint: string;
      readonly nextFree: string;
      readonly pay: string;
      /** "At the end · {amount}" */
      readonly payAtEnd: string;
      readonly payNothing: string;
      readonly payHint: string;
      /** "Book {name} · {time}" */
      readonly bookNow: string;
      /** "Now · {time}", the first free card of a walk-in */
      readonly nowAt: string;
      readonly close: string;
      readonly withPerson: string;
    };
  };
};

export function classesCopy(t: Translator): ClassesCopy {
  return {
    title: t("dashboard.pos.classes.title"),
    day: {
      today: t("dashboard.pos.classes.day.today"),
      tomorrow: t("dashboard.pos.classes.day.tomorrow"),
      yesterday: t("dashboard.pos.classes.day.yesterday"),
      clock: t("dashboard.pos.classes.day.clock"),
      prev: t("dashboard.pos.classes.day.prev"),
      next: t("dashboard.pos.classes.day.next"),
      backToToday: t("dashboard.pos.classes.day.backToToday"),
      reload: t("dashboard.pos.classes.day.reload"),
    },
    state: {
      draft: t("dashboard.adminAppointments.state.draft"),
      tentative: t("dashboard.adminAppointments.state.tentative"),
      confirmed: t("dashboard.adminAppointments.state.confirmed"),
      in_progress: t("dashboard.adminAppointments.state.in_progress"),
      completed: t("dashboard.adminAppointments.state.completed"),
      cancelled: t("dashboard.adminAppointments.state.cancelled"),
      archived: t("dashboard.adminAppointments.state.archived"),
      unknown: t("dashboard.adminAppointments.state.unknown"),
    },
    today: {
      heading: t("dashboard.pos.classes.today.heading"),
      empty: t("dashboard.pos.classes.today.empty"),
      checkIn: t("dashboard.pos.classes.today.checkIn"),
      checkingIn: t("dashboard.pos.classes.today.checkingIn"),
      arrived: t("dashboard.pos.classes.today.arrived"),
      move: t("dashboard.adminAppointments.action.reschedule"),
      owed: t("dashboard.pos.classes.today.owed"),
      collect: t("dashboard.pos.classes.today.collect"),
      paid: t("dashboard.pos.classes.today.paid"),
      noOrder: t("dashboard.pos.classes.today.noOrder"),
      nobody: t("dashboard.adminAppointments.unknownCustomer"),
    },
    reschedule: {
      heading: t("dashboard.adminAppointments.reschedule.heading"),
      newStart: t("dashboard.adminAppointments.reschedule.newStart"),
      submit: t("dashboard.adminAppointments.reschedule.submit"),
      submitting: t("dashboard.adminAppointments.reschedule.submitting"),
      cancel: t("dashboard.adminAppointments.reschedule.cancel"),
      moved: t("dashboard.adminAppointments.reschedule.moved"),
      already: t("dashboard.adminAppointments.reschedule.already"),
      needStart: t("dashboard.adminAppointments.reschedule.needStart"),
      nonexistentTime: t("dashboard.adminAppointments.reschedule.refusal.nonexistentTime"),
      refusal: {
        slotTakenNamed: t("dashboard.adminAppointments.reschedule.refusal.slotTakenNamed"),
        slotTaken: t("dashboard.adminAppointments.reschedule.refusal.slotTaken"),
        roomFullNamed: t("dashboard.adminAppointments.reschedule.refusal.roomFullNamed"),
        roomFull: t("dashboard.adminAppointments.reschedule.refusal.roomFull"),
        ancestorFullNamed: t("dashboard.adminAppointments.reschedule.refusal.ancestorFullNamed"),
        ancestorFull: t("dashboard.adminAppointments.reschedule.refusal.ancestorFull"),
        changedSinceOpened: t("dashboard.adminAppointments.reschedule.refusal.changedSinceOpened"),
        notReschedulable: t("dashboard.adminAppointments.reschedule.refusal.notReschedulable"),
        notFound: t("dashboard.adminAppointments.reschedule.refusal.notFound"),
        invalidWindow: t("dashboard.adminAppointments.reschedule.refusal.invalidWindow"),
        tryAgain: t("dashboard.adminAppointments.reschedule.refusal.tryAgain"),
        unavailable: t("dashboard.adminAppointments.reschedule.refusal.unavailable"),
      },
    },
    sessions: {
      heading: t("dashboard.pos.classes.sessions.heading"),
      empty: t("dashboard.pos.classes.sessions.empty"),
      seats: t("dashboard.pos.classes.sessions.seats"),
      seatsFull: t("dashboard.adminAppointments.waitlist.full"),
      seatsUnknown: t("dashboard.adminAppointments.waitlist.seatsUnknown"),
      seatsUncounted: t("dashboard.adminAppointments.waitlist.noPool"),
      roster: t("dashboard.pos.classes.sessions.roster"),
      rosterEmpty: t("dashboard.pos.classes.sessions.rosterEmpty"),
      unnamed: t("dashboard.pos.classes.sessions.unnamed"),
      mark: t("dashboard.pos.classes.sessions.mark"),
      marking: t("dashboard.pos.classes.sessions.marking"),
      here: t("dashboard.pos.classes.sessions.here"),
      partOfParty: t("dashboard.pos.classes.sessions.partOfParty"),
      fromList: t("dashboard.pos.classes.sessions.fromList"),
      fromListHint: t("dashboard.pos.classes.sessions.fromListHint"),
      notValid: t("dashboard.pos.classes.sessions.notValid"),
      bookSeat: t("dashboard.pos.classes.sessions.bookSeat"),
      openQueue: t("dashboard.adminAppointments.waitlist.openFromSession"),
    },
    walkin: {
      heading: t("dashboard.pos.classes.walkin.heading"),
      kindAppointment: t("dashboard.pos.classes.walkin.kindAppointment"),
      kindSeat: t("dashboard.pos.classes.walkin.kindSeat"),
      service: t("dashboard.pos.classes.walkin.service"),
      noServices: t("dashboard.pos.classes.walkin.noServices"),
      withPerson: t("dashboard.pos.classes.walkin.withPerson"),
      minutes: t("dashboard.pos.classes.walkin.minutes"),
      pickTime: t("dashboard.pos.classes.walkin.pickTime"),
      loadingTimes: t("dashboard.pos.classes.walkin.loadingTimes"),
      noTimes: t("dashboard.pos.classes.walkin.noTimes"),
      session: t("dashboard.pos.classes.walkin.session"),
      noSessions: t("dashboard.pos.classes.walkin.noSessions"),
      tier: t("dashboard.pos.classes.walkin.tier"),
      name: t("dashboard.pos.classes.walkin.name"),
      email: t("dashboard.pos.email"),
      phone: t("dashboard.pos.phone"),
      book: t("dashboard.pos.classes.walkin.book"),
      booking: t("dashboard.pos.classes.walkin.booking"),
      booked: t("dashboard.pos.classes.walkin.booked"),
      seatBooked: t("dashboard.pos.classes.walkin.seatBooked"),
      collect: t("dashboard.pos.classes.walkin.collect"),
      collecting: t("dashboard.pos.classes.walkin.collecting"),
      collected: t("dashboard.pos.classes.walkin.collected"),
      nothingToCollect: t("dashboard.pos.classes.walkin.nothingToCollect"),
      startAgain: t("dashboard.pos.classes.walkin.startAgain"),
      mustPayOnlineHint: t("dashboard.pos.classes.walkin.mustPayOnlineHint"),
    },
    waitlist: {
      heading: t("dashboard.pos.classes.waitlist.heading"),
      empty: t("dashboard.pos.classes.waitlist.empty"),
      position: t("dashboard.adminAppointments.waitlist.position"),
      nextInLine: t("dashboard.adminAppointments.waitlist.nextInLine"),
      promote: t("dashboard.adminAppointments.waitlist.promote"),
      promoting: t("dashboard.adminAppointments.waitlist.promoting"),
      promoted: t("dashboard.adminAppointments.waitlist.promoted"),
      alreadyOffered: t("dashboard.adminAppointments.waitlist.alreadyOffered"),
      accept: t("dashboard.adminAppointments.waitlist.accept"),
      decline: t("dashboard.pos.classes.waitlist.decline"),
      declined: t("dashboard.pos.classes.waitlist.declined"),
      accepting: t("dashboard.adminAppointments.waitlist.accepting"),
      accepted: t("dashboard.adminAppointments.waitlist.accepted"),
      offerUntil: t("dashboard.adminAppointments.waitlist.offerUntil"),
      state: {
        waiting: t("dashboard.adminAppointments.waitlist.state.waiting"),
        offered: t("dashboard.adminAppointments.waitlist.state.offered"),
        expired: t("dashboard.adminAppointments.waitlist.state.expired"),
        accepted: t("dashboard.adminAppointments.waitlist.state.accepted"),
        withdrawn: t("dashboard.adminAppointments.waitlist.state.withdrawn"),
      },
      join: {
        heading: t("dashboard.adminAppointments.waitlist.join.heading"),
        name: t("dashboard.adminAppointments.waitlist.join.name"),
        email: t("dashboard.adminAppointments.waitlist.join.email"),
        submit: t("dashboard.adminAppointments.waitlist.join.submit"),
        submitting: t("dashboard.adminAppointments.waitlist.join.submitting"),
        joined: t("dashboard.adminAppointments.waitlist.join.joined"),
      },
      promoteRefusal: {
        invalid: t("dashboard.adminAppointments.waitlist.refusal.invalid"),
        notFound: t("dashboard.adminAppointments.waitlist.refusal.notFound"),
        changedSinceOpened: t("dashboard.adminAppointments.waitlist.refusal.changedSinceOpened"),
        notPromotable: t("dashboard.adminAppointments.waitlist.refusal.notPromotable"),
        sessionMissing: t("dashboard.adminAppointments.waitlist.refusal.sessionMissing"),
        sessionNotOpen: t("dashboard.adminAppointments.waitlist.refusal.sessionNotOpen"),
        noPool: t("dashboard.adminAppointments.waitlist.refusal.noPool"),
        sessionFull: t("dashboard.adminAppointments.waitlist.refusal.sessionFull"),
        unavailable: t("dashboard.adminAppointments.waitlist.refusal.unavailable"),
      },
      acceptRefusal: {
        invalid: t("dashboard.adminAppointments.waitlist.refusal.invalid"),
        notFound: t("dashboard.adminAppointments.waitlist.refusal.notFound"),
        changedSinceOpened: t("dashboard.adminAppointments.waitlist.refusal.changedSinceOpened"),
        notOffered: t("dashboard.adminAppointments.waitlist.refusal.notOffered"),
        offerExpired: t("dashboard.adminAppointments.waitlist.refusal.offerExpired"),
        notPromotable: t("dashboard.adminAppointments.waitlist.refusal.notPromotable"),
        sessionMissing: t("dashboard.adminAppointments.waitlist.refusal.sessionMissing"),
        sessionNotOpen: t("dashboard.adminAppointments.waitlist.refusal.sessionNotOpen"),
        noPool: t("dashboard.adminAppointments.waitlist.refusal.noPool"),
        seatJustTaken: t("dashboard.adminAppointments.waitlist.refusal.seatJustTaken"),
        unavailable: t("dashboard.adminAppointments.waitlist.refusal.unavailable"),
      },
      joinRefusal: {
        nameRequired: t("dashboard.adminAppointments.waitlist.refusal.nameRequired"),
        alreadyWaiting: t("dashboard.adminAppointments.waitlist.refusal.alreadyWaiting"),
        seatsAvailable: t("dashboard.adminAppointments.waitlist.refusal.seatsAvailable"),
        noSeatsSet: t("dashboard.adminAppointments.waitlist.refusal.noSeatsSet"),
        notFound: t("dashboard.adminAppointments.waitlist.refusal.sessionMissing"),
        sessionNotOpen: t("dashboard.adminAppointments.waitlist.refusal.sessionNotOpen"),
        unavailable: t("dashboard.adminAppointments.waitlist.refusal.unavailable"),
      },
    },
    refusal: {
      notAllowed: t("dashboard.pos.classes.refusal.notAllowed"),
      invalid: t("dashboard.pos.classes.refusal.invalid"),
      unavailable: t("dashboard.pos.classes.refusal.unavailable"),
      bookingNotFound: t("dashboard.pos.classes.refusal.bookingNotFound"),
      bookingChanged: t("dashboard.pos.classes.refusal.bookingChanged"),
      alreadyCheckedIn: t("dashboard.pos.classes.refusal.alreadyCheckedIn"),
      bookingCancelled: t("dashboard.pos.classes.refusal.bookingCancelled"),
      bookingCompleted: t("dashboard.pos.classes.refusal.bookingCompleted"),
      bookingNotCheckinable: t("dashboard.pos.classes.refusal.bookingNotCheckinable"),
      placeGone: t("dashboard.pos.classes.refusal.placeGone"),
      attendanceAlreadyMarked: t("dashboard.pos.classes.refusal.attendanceAlreadyMarked"),
      placeNotValid: t("dashboard.pos.classes.refusal.placeNotValid"),
      serviceNotFound: t("dashboard.pos.classes.refusal.serviceNotFound"),
      noBookingHours: t("dashboard.pos.classes.refusal.noBookingHours"),
      hoursUnreadable: t("dashboard.pos.classes.refusal.hoursUnreadable"),
      closedToday: t("dashboard.pos.classes.refusal.closedToday"),
      fullyBookedToday: t("dashboard.pos.classes.refusal.fullyBookedToday"),
      nameRequired: t("dashboard.pos.classes.refusal.nameRequired"),
      timeTaken: t("dashboard.pos.classes.refusal.timeTaken"),
      roomFull: t("dashboard.pos.classes.refusal.roomFull"),
      mustPayOnline: t("dashboard.pos.classes.refusal.mustPayOnline"),
      needsAccount: t("dashboard.pos.classes.refusal.needsAccount"),
      needsContact: t("dashboard.pos.classes.refusal.needsContact"),
      notForSale: t("dashboard.pos.classes.refusal.notForSale"),
      couldNotBook: t("dashboard.pos.classes.refusal.couldNotBook"),
      bookingNoPerson: t("dashboard.pos.classes.refusal.bookingNoPerson"),
    },
    board: {
      header: {
        summary: t("dashboard.pos.classes.board.header.summary"),
        location: t("dashboard.pos.classes.board.header.location"),
        operator: t("dashboard.pos.classes.board.header.operator"),
      },
      list: {
        tabToday: t("dashboard.pos.classes.board.list.tabToday"),
        tabDue: t("dashboard.pos.classes.board.list.tabDue"),
        tabDone: t("dashboard.pos.classes.board.list.tabDone"),
        segAppts: t("dashboard.pos.classes.board.list.segAppts"),
        segClasses: t("dashboard.pos.classes.board.list.segClasses"),
        emptyDue: t("dashboard.pos.classes.board.list.emptyDue"),
        emptyDone: t("dashboard.pos.classes.board.list.emptyDone"),
        walkIn: t("dashboard.pos.classes.board.list.walkIn"),
        book: t("dashboard.pos.classes.board.list.book"),
        pickOne: t("dashboard.pos.classes.board.list.pickOne"),
        pickSession: t("dashboard.pos.classes.board.list.pickSession"),
        classChip: t("dashboard.pos.classes.board.list.classChip"),
        full: t("dashboard.pos.classes.board.list.full"),
        here: t("dashboard.pos.classes.board.list.here"),
      },
      detail: {
        booked: t("dashboard.pos.classes.board.detail.booked"),
        addedToday: t("dashboard.pos.classes.board.detail.addedToday"),
        linesLoading: t("dashboard.pos.classes.board.detail.linesLoading"),
        linesUnreadable: t("dashboard.pos.classes.board.detail.linesUnreadable"),
        noLines: t("dashboard.pos.classes.board.detail.noLines"),
        addService: t("dashboard.pos.classes.board.detail.addService"),
        product: t("dashboard.pos.classes.board.detail.product"),
        usePass: t("dashboard.pos.classes.board.detail.usePass"),
        usePassOff: t("dashboard.pos.classes.board.detail.usePassOff"),
        services: t("dashboard.pos.classes.board.detail.services"),
        retail: t("dashboard.pos.classes.board.detail.retail"),
        depositPaid: t("dashboard.pos.classes.board.detail.depositPaid"),
        balanceDue: t("dashboard.pos.classes.board.detail.balanceDue"),
        whoDidWhat: t("dashboard.pos.classes.board.detail.whoDidWhat"),
        whoDidWhatOff: t("dashboard.pos.classes.board.detail.whoDidWhatOff"),
        sendLink: t("dashboard.pos.classes.board.detail.sendLink"),
        sendLinkOff: t("dashboard.pos.classes.board.detail.sendLinkOff"),
        rebook: t("dashboard.pos.classes.board.detail.rebook"),
        rebookOff: t("dashboard.pos.classes.board.detail.rebookOff"),
        serviceDone: t("dashboard.pos.classes.board.detail.serviceDone"),
        checkedIn: t("dashboard.pos.classes.board.detail.checkedIn"),
        paidChip: t("dashboard.pos.classes.board.detail.paidChip"),
        addOff: t("dashboard.pos.classes.board.detail.addOff"),
        lineDone: t("dashboard.pos.classes.board.detail.lineDone"),
        lineAdded: t("dashboard.pos.classes.board.detail.lineAdded"),
        lineProduct: t("dashboard.pos.classes.board.detail.lineProduct"),
        linkedFrom: t("dashboard.pos.classes.board.detail.linkedFrom"),
        fromSale: t("dashboard.pos.classes.board.detail.fromSale"),
        linkedPayment: t("dashboard.pos.classes.board.detail.linkedPayment"),
        linkedSale: t("dashboard.pos.classes.board.detail.linkedSale"),
        linkedChip: t("dashboard.pos.classes.board.detail.linkedChip"),
      },
      extra: {
        title: t("dashboard.pos.classes.board.extra.title"),
        subtitle: t("dashboard.pos.classes.board.extra.subtitle"),
        search: t("dashboard.pos.classes.board.extra.search"),
        noMatch: t("dashboard.pos.classes.board.extra.noMatch"),
        minutes: t("dashboard.pos.classes.board.extra.minutes"),
        noTime: t("dashboard.pos.classes.board.extra.noTime"),
        timeNotReplanned: t("dashboard.pos.classes.board.extra.timeNotReplanned"),
        timeNotReplannedShort: t("dashboard.pos.classes.board.extra.timeNotReplannedShort"),
        newEndTime: t("dashboard.pos.classes.board.extra.newEndTime"),
        endUnchanged: t("dashboard.pos.classes.board.extra.endUnchanged"),
        newBalance: t("dashboard.pos.classes.board.extra.newBalance"),
        who: t("dashboard.pos.classes.board.extra.who"),
        add: t("dashboard.pos.classes.board.extra.add"),
        adding: t("dashboard.pos.classes.board.extra.adding"),
        added: t("dashboard.pos.classes.board.extra.added"),
        cancel: t("dashboard.pos.classes.board.extra.cancel"),
      },
      checkin: {
        startsIn: t("dashboard.pos.classes.board.checkin.startsIn"),
        startedAgo: t("dashboard.pos.classes.board.checkin.startedAgo"),
        fullChip: t("dashboard.pos.classes.board.checkin.fullChip"),
        bookedChip: t("dashboard.pos.classes.board.checkin.bookedChip"),
        hereChip: t("dashboard.pos.classes.board.checkin.hereChip"),
        waitlistChip: t("dashboard.pos.classes.board.checkin.waitlistChip"),
        search: t("dashboard.pos.classes.board.checkin.search"),
        tabAll: t("dashboard.pos.classes.board.checkin.tabAll"),
        tabNotHere: t("dashboard.pos.classes.board.checkin.tabNotHere"),
        tabProblems: t("dashboard.pos.classes.board.checkin.tabProblems"),
        hereState: t("dashboard.pos.classes.board.checkin.hereState"),
        bookedState: t("dashboard.pos.classes.board.checkin.bookedState"),
        cantAttend: t("dashboard.pos.classes.board.checkin.cantAttend"),
        check: t("dashboard.pos.classes.board.checkin.check"),
        undo: t("dashboard.pos.classes.board.checkin.undo"),
        undoOff: t("dashboard.pos.classes.board.checkin.undoOff"),
        fix: t("dashboard.pos.classes.board.checkin.fix"),
        fixOff: t("dashboard.pos.classes.board.checkin.fixOff"),
        places: t("dashboard.pos.classes.board.checkin.places"),
        here: t("dashboard.pos.classes.board.checkin.here"),
        waitlist: t("dashboard.pos.classes.board.checkin.waitlist"),
        positions: t("dashboard.pos.classes.board.checkin.positions"),
        positionsOff: t("dashboard.pos.classes.board.checkin.positionsOff"),
        scanPass: t("dashboard.pos.classes.board.checkin.scanPass"),
        scanPassOff: t("dashboard.pos.classes.board.checkin.scanPassOff"),
        sellDropIn: t("dashboard.pos.classes.board.checkin.sellDropIn"),
        sellDropInFull: t("dashboard.pos.classes.board.checkin.sellDropInFull"),
        sellDropInOff: t("dashboard.pos.classes.board.checkin.sellDropInOff"),
        addToWaitlist: t("dashboard.pos.classes.board.checkin.addToWaitlist"),
        substitute: t("dashboard.pos.classes.board.checkin.substitute"),
        substituteOff: t("dashboard.pos.classes.board.checkin.substituteOff"),
        closeCheckin: t("dashboard.pos.classes.board.checkin.closeCheckin"),
        closeCheckinOff: t("dashboard.pos.classes.board.checkin.closeCheckinOff"),
        nobody: t("dashboard.pos.classes.board.checkin.nobody"),
        notValidNotice: t("dashboard.pos.classes.board.checkin.notValidNotice"),
      },
      opened: {
        title: t("dashboard.pos.classes.board.opened.title"),
        subtitle: t("dashboard.pos.classes.board.opened.subtitle"),
        offerTo: t("dashboard.pos.classes.board.opened.offerTo"),
        offerHint: t("dashboard.pos.classes.board.opened.offerHint"),
        sellDropIn: t("dashboard.pos.classes.board.opened.sellDropIn"),
        sellHint: t("dashboard.pos.classes.board.opened.sellHint"),
        leaveEmpty: t("dashboard.pos.classes.board.opened.leaveEmpty"),
        later: t("dashboard.pos.classes.board.opened.later"),
        offerButton: t("dashboard.pos.classes.board.opened.offerButton"),
        policyNote: t("dashboard.pos.classes.board.opened.policyNote"),
      },
      booking: bookingCopy(t),
      move: moveCopy(t),
      sheet: {
        title: t("dashboard.pos.classes.board.sheet.title"),
        subtitle: t("dashboard.pos.classes.board.sheet.subtitle"),
        bookTitle: t("dashboard.pos.classes.board.sheet.bookTitle"),
        bookSubtitle: t("dashboard.pos.classes.board.sheet.bookSubtitle"),
        customer: t("dashboard.pos.classes.board.sheet.customer"),
        customerHint: t("dashboard.pos.classes.board.sheet.customerHint"),
        nextFree: t("dashboard.pos.classes.board.sheet.nextFree"),
        pay: t("dashboard.pos.classes.board.sheet.pay"),
        payAtEnd: t("dashboard.pos.classes.board.sheet.payAtEnd"),
        payNothing: t("dashboard.pos.classes.board.sheet.payNothing"),
        payHint: t("dashboard.pos.classes.board.sheet.payHint"),
        bookNow: t("dashboard.pos.classes.board.sheet.bookNow"),
        nowAt: t("dashboard.pos.classes.board.sheet.nowAt"),
        close: t("dashboard.pos.classes.board.sheet.close"),
        withPerson: t("dashboard.pos.classes.board.sheet.withPerson"),
      },
    },
  };
}
