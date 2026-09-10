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

import type { Translator } from "./translator";

export type ClassesRailCopy = Readonly<Record<string, string>>;

export function classesRailCopy(t: Translator): ClassesRailCopy {
  return {
    today: t("dashboard.pos.classes.rail.today"),
    sessions: t("dashboard.pos.classes.rail.sessions"),
    walkin: t("dashboard.pos.classes.rail.walkin"),
    waitlist: t("dashboard.pos.classes.rail.waitlist"),
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
    },
  };
}
