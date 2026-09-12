/**
 * floor-copy.ts — every word the floor board says, in one builder.
 *
 * One builder, used by the Tables mode of the point of sale, by the
 * workspace's Live Floor (the Reservations destination) and by the render
 * tests, so a test cannot pass by rebuilding a mapping the screens do not
 * use. Every sentence is a catalogue entry under `dashboard.pos.floor.board`
 * (`web/messages/{en,es,fr}.json`); the refusal sentences are the SAME
 * entries the workspace Spaces page prints (`dashboard.tables.refusal.*`),
 * because both call the same engine and must say the same thing when it
 * refuses.
 *
 * A control the engine has no writer for is drawn disabled over one
 * sentence (`*Reason` keys): never a control that silently does nothing.
 */

import type { Translator } from "../pos/translator";
import { floorEngineCopy, floorEngineRefusals, type FloorEngineCopy } from "./floor-copy-engine";

const K = "dashboard.pos.floor.board";

/** Every code the floor's actions can answer with. */
export type FloorRefusalKey =
  | "not_found"
  | "wrong_tenant"
  | "already_open"
  | "invalid"
  | "party_too_small"
  | "party_too_large"
  | "not_combinable"
  | "joined_unavailable"
  | "joined_visit"
  | "not_open"
  // The engine's table operations (`visit_transfer`, `visit_merge_checks`, ...).
  | "space_occupied"
  | "lines_paid"
  | "conflict"
  | "outstanding"
  | "already_closed"
  | "version_conflict"
  | "not_allowed"
  | "unavailable"
  | "reservation_not_found"
  | "reservation_other_table"
  | "reservation_not_valid"
  | "reservation_already_seated"
  | "kitchen_empty"
  | "kitchen_not_found"
  // The walk-in queue (`reservationsTakeWalkIn`).
  | "walkins_off"
  | "party_below_minimum"
  | "party_above_maximum"
  | "no_band_fits_this_party"
  | "sold_out"
  | "capacity_unavailable"
  | "engine_error"
  | "reservations_off"
  // A staff reservation (`floorCreateReservation`).
  | "time_not_offered"
  | "no_offering_configured"
  | "no_contact"
  | "closed"
  | "too_late_today"
  // The party waitlist (`floorJoinWaitlist` / `floorSeatWaitlist` / `floorNotifyWaitlist`).
  | "already_seated"
  | "expired"
  | "waitlist_no_channel";

export type FloorBoardCopy = {
  readonly railLabel: string;
  readonly rail: Readonly<Record<string, string>>;
  readonly title: string;
  readonly titleTimeline: string;
  readonly titleList: string;
  readonly titleOrders: string;
  /** `{service} · {seated} of {total} tables seated · {arriving} arriving · {waiting} waiting` */
  readonly subtitle: string;
  /** `{service} · now {time}` */
  readonly subtitleTimeline: string;
  /** `{n} open checks on the floor` */
  readonly subtitleOrders: string;
  /** `{label} {start}–{end}` */
  readonly service: string;
  readonly serviceNone: string;
  readonly live: string;
  readonly zoneNote: string;
  readonly views: { readonly floor: string; readonly timeline: string; readonly list: string };
  readonly panel: {
    readonly arriving: string;
    readonly waiting: string;
    readonly seated: string;
    readonly emptyArriving: string;
    readonly emptyWaiting: string;
    readonly emptySeated: string;
    readonly noTableYet: string;
    /** `Table {code}` */
    readonly table: string;
    readonly walkIn: string;
    /** `Late {n} min` */
    readonly late: string;
    /** `Waiting {n} min` */
    readonly waitingFor: string;
    /** `{n} min · {amount}` */
    readonly seatedLine: string;
    readonly stateConfirmed: string;
    readonly stateArriving: string;
    readonly stateLate: string;
    readonly stateWaiting: string;
    readonly stateSeated: string;
    readonly statePartSeated: string;
  };
  readonly legend: {
    readonly free: string;
    readonly arriving: string;
    readonly held: string;
    readonly seated: string;
    readonly needsReset: string;
    readonly blocked: string;
  };
  readonly tile: {
    /** `Free · {n}` */
    readonly free: string;
    /** `{n} · {min} min` */
    readonly seated: string;
    /** `{name} {n} · {min} min` */
    readonly seatedNamed: string;
    readonly late: string;
    /** `{name} · {n} · {time}` */
    readonly held: string;
    /** `Walk-in hold · {n}` */
    readonly heldUnnamed: string;
    readonly needsReset: string;
    readonly blocked: string;
    /** `Bill open · {amount}` */
    readonly billOpen: string;
    /** `Joined with {code}` */
    readonly joinedWith: string;
    /** `Party of {n}` */
    readonly partyOf: string;
    /** `Vacated {time}` */
    readonly vacated: string;
    /** `Check {amount}` */
    readonly check: string;
    readonly noCheck: string;
    readonly tabCheck: string;
  };
  readonly groups: { readonly tables: string; readonly booths: string; readonly cabanas: string };
  /** `{code} {n} min over` */
  readonly overrun: string;
  readonly overrunHint: string;
  readonly emptyFloor: string;
  readonly list: {
    readonly table: string;
    readonly state: string;
    readonly party: string;
    readonly seated: string;
    readonly server: string;
    readonly unpaid: string;
    readonly next: string;
    readonly open: string;
    readonly stateSeated: string;
    /** `Over by {n}` */
    readonly stateOver: string;
    readonly stateArriving: string;
    readonly stateHeld: string;
    readonly stateNeedsReset: string;
    readonly stateBlocked: string;
    readonly stateFree: string;
    /** `{n} min` */
    readonly minutes: string;
    /** `until {time}` */
    readonly until: string;
    readonly serverNone: string;
  };
  readonly timeline: {
    readonly footer: string;
    readonly seated: string;
    readonly over: string;
    readonly reset: string;
    /** `{n} · booked to {time}` */
    readonly bookedTo: string;
    readonly empty: string;
  };
  readonly actions: {
    readonly walkIn: string;
    readonly newReservation: string;
    readonly pauseOnline: string;
    readonly pauseOnlineReason: string;
  };
  readonly popover: {
    /** `Seated · {n} min` */
    readonly seatedFor: string;
    /** `Free · seats {min}–{max}` */
    readonly freeSeats: string;
    readonly heldPill: string;
    readonly needsResetPill: string;
    readonly blockedPill: string;
    /** `{n} guests` */
    readonly guests: string;
    /** `{amount} unpaid` */
    readonly unpaid: string;
    readonly noCheck: string;
    readonly close: string;
    readonly openOrder: string;
    readonly addItems: string;
    /** `Collect {amount}` */
    readonly collect: string;
    readonly sendKitchen: string;
    readonly fireStarters: string;
    readonly fireMains: string;
    readonly fireDessert: string;
    readonly moveOrJoin: string;
    readonly changeServer: string;
    readonly changeServerReason: string;
    readonly extendTime: string;
    readonly extendTimeReason: string;
    readonly partyLeft: string;
    readonly seatParty: string;
    readonly markReady: string;
    readonly block: string;
    readonly blockReason: string;
    readonly split: string;
    readonly splitReason: string;
    readonly kitchenNone: string;
    readonly kitchenQueued: string;
    readonly kitchenAcknowledged: string;
    readonly kitchenReady: string;
  };
  readonly seat: {
    /** `Seat {name} · {n}` */
    readonly title: string;
    /** `Seat a party at {code}` */
    readonly titleWalkIn: string;
    /** `{time} · booked for {n}` */
    readonly subtitleHeld: string;
    readonly subtitleWalkIn: string;
    readonly assigned: string;
    readonly alsoFits: string;
    /** `{code} · seats {min}–{max}` */
    readonly seats: string;
    /** `{a} + {b} · joined · seats {min}–{max}` */
    readonly joinedSeats: string;
    readonly freeNow: string;
    readonly needsReset: string;
    /** `Held for {name} · {time}` */
    readonly heldFor: string;
    readonly guestsHereNow: string;
    /** `of {n}` */
    readonly of: string;
    readonly fewer: string;
    readonly more: string;
    readonly server: string;
    readonly serverReason: string;
    readonly note: string;
    readonly notHereYet: string;
    readonly noShow: string;
    readonly noShowReason: string;
    /** `Seat {n} guests at {code}` */
    readonly confirm: string;
    readonly noFit: string;
  };
  readonly walkIn: {
    readonly title: string;
    readonly subtitle: string;
    readonly partySize: string;
    readonly guests: string;
    readonly common: string;
    readonly name: string;
    readonly mobile: string;
    readonly optional: string;
    readonly mobileReason: string;
    readonly highChair: string;
    readonly stepFree: string;
    readonly quietArea: string;
    readonly needsReason: string;
    readonly rightNow: string;
    readonly seatNow: string;
    /** `{code} · seats {n} · free` */
    readonly freeFits: string;
    readonly noFreeFits: string;
    readonly waitlist: string;
    /** `{n} parties ahead` */
    readonly waitlistSub: string;
    readonly addToWaitlist: string;
    readonly cancel: string;
    readonly added: string;
  };
  readonly waiting: {
    /** `Waiting · {n}` */
    readonly title: string;
    readonly subtitle: string;
    /** `{time} · waiting {n} min` */
    readonly told: string;
    readonly seatNow: string;
    readonly offerTable: string;
    readonly offerReason: string;
    readonly offered: string;
    readonly notifyNone: string;
    readonly remove: string;
    readonly removeReason: string;
    readonly close: string;
    readonly addParty: string;
    readonly empty: string;
  };
  readonly change: {
    /** `{code} · {party}` */
    readonly title: string;
    readonly subtitle: string;
    readonly moveTitle: string;
    readonly moveBody: string;
    readonly moveCta: string;
    readonly joinTitle: string;
    readonly joinBody: string;
    readonly joinCta: string;
    readonly joinReason: string;
    readonly mergeTitle: string;
    readonly mergeBody: string;
    readonly mergeCta: string;
    readonly mergeReason: string;
    readonly cancel: string;
  };
  readonly move: {
    /** `{code} › Move` */
    readonly crumb: string;
    /** `Move {party} to...` */
    readonly title: string;
    readonly subtitle: string;
    readonly free: string;
    readonly tooSmall: string;
    readonly tooLarge: string;
    readonly occupied: string;
    readonly needsReset: string;
    readonly held: string;
    readonly blocked: string;
    /** `seats {min}–{max}` */
    readonly seats: string;
    readonly goesWithThem: string;
    /** `{amount} check · {n} kitchen ticket` */
    readonly goesValue: string;
    readonly goesNothing: string;
    /** `{code} after` */
    readonly after: string;
    readonly afterValue: string;
    readonly why: string;
    readonly whyReason: string;
    readonly back: string;
    /** `Move to {code}` */
    readonly confirm: string;
    readonly none: string;
    /** `{party} moved to {code}.` */
    readonly done: string;
  };
  readonly departed: {
    /** `Party left {code} · bill still open` */
    readonly title: string;
    /** `Party left {code}` */
    readonly titlePaid: string;
    /** `{amount} unpaid · {min} min` */
    readonly subtitle: string;
    /** `Check settled · {min} min` */
    readonly subtitlePaid: string;
    readonly keepOpen: string;
    readonly keepOpenSub: string;
    readonly keepOpenReason: string;
    readonly paidOther: string;
    readonly paidOtherSub: string;
    readonly paidOtherReason: string;
    readonly walkOut: string;
    readonly walkOutSub: string;
    readonly walkOutReason: string;
    readonly back: string;
    readonly confirm: string;
  };
  readonly reset: {
    /** `{code} · needs reset` */
    readonly title: string;
    /** `Party left {time}` */
    readonly subtitle: string;
    readonly cleared: string;
    /** `Reset for {n}` */
    readonly resetFor: string;
    readonly candle: string;
    readonly note: string;
    readonly notYet: string;
    /** `{code} is ready` */
    readonly confirm: string;
  };
  readonly reservation: {
    readonly title: string;
    readonly subtitle: string;
    readonly date: string;
    readonly time: string;
    readonly party: string;
    readonly customer: string;
    readonly email: string;
    readonly phone: string;
    readonly note: string;
    readonly noteReason: string;
    readonly where: string;
    readonly whereReason: string;
    readonly money: string;
    /** `Deposit {amount}` */
    readonly deposit: string;
    readonly depositSub: string;
    readonly noDeposit: string;
    readonly noDepositSub: string;
    /** `AVAILABILITY · {date} · {n}` */
    readonly availability: string;
    readonly loading: string;
    readonly pickTime: string;
    readonly lastSeating: string;
    readonly upsize: string;
    /** `Confirm · collect {amount} deposit` */
    readonly confirmDeposit: string;
    readonly confirm: string;
    readonly cancel: string;
    /** `Reserved · {time} · {name} · {n}` */
    readonly done: string;
    readonly collectNext: string;
    readonly contactNeeded: string;
  };
  readonly notices: {
    /** `Sent to the kitchen as ticket revision {n}.` */
    readonly sentToKitchen: string;
    readonly amendedInKitchen: string;
    readonly seatedNotMarked: string;
  };
  readonly refusal: Readonly<Record<FloorRefusalKey, string>>;
  /** T16 / T17 / T18 and the multi-check popover (`floor-copy-engine.ts`). */
  readonly engine: FloorEngineCopy;
};

export function floorBoardCopy(t: Translator): FloorBoardCopy {
  const R = "dashboard.tables.refusal";
  const D = "dashboard.reservationsDesk.refusal";
  return {
    railLabel: t("dashboard.pos.floor.rail.label"),
    rail: {
      tables: t("dashboard.pos.floor.rail.tables"),
      orders: t(`${K}.rail.orders`),
      prep: t(`${K}.rail.prep`),
      receipts: t(`${K}.rail.receipts`),
      issues: t(`${K}.rail.issues`),
      messages: t("dashboard.pos.messages.title"),
    },
    title: t(`${K}.title`),
    titleTimeline: t(`${K}.titleTimeline`),
    titleList: t(`${K}.titleList`),
    titleOrders: t(`${K}.titleOrders`),
    subtitle: t(`${K}.subtitle`),
    subtitleTimeline: t(`${K}.subtitleTimeline`),
    subtitleOrders: t(`${K}.subtitleOrders`),
    service: t(`${K}.service`),
    serviceNone: t(`${K}.serviceNone`),
    live: t(`${K}.live`),
    zoneNote: t("dashboard.tables.timesInZone"),
    views: { floor: t(`${K}.views.floor`), timeline: t(`${K}.views.timeline`), list: t(`${K}.views.list`) },
    panel: {
      arriving: t(`${K}.panel.arriving`),
      waiting: t(`${K}.panel.waiting`),
      seated: t(`${K}.panel.seated`),
      emptyArriving: t(`${K}.panel.emptyArriving`),
      emptyWaiting: t(`${K}.panel.emptyWaiting`),
      emptySeated: t(`${K}.panel.emptySeated`),
      noTableYet: t(`${K}.panel.noTableYet`),
      table: t(`${K}.panel.table`),
      walkIn: t(`${K}.panel.walkIn`),
      late: t(`${K}.panel.late`),
      waitingFor: t(`${K}.panel.waitingFor`),
      seatedLine: t(`${K}.panel.seatedLine`),
      stateConfirmed: t(`${K}.panel.stateConfirmed`),
      stateArriving: t(`${K}.panel.stateArriving`),
      stateLate: t(`${K}.panel.stateLate`),
      stateWaiting: t(`${K}.panel.stateWaiting`),
      stateSeated: t(`${K}.panel.stateSeated`),
      statePartSeated: t(`${K}.panel.statePartSeated`),
    },
    legend: {
      free: t(`${K}.legend.free`),
      arriving: t(`${K}.legend.arriving`),
      held: t(`${K}.legend.held`),
      seated: t(`${K}.legend.seated`),
      needsReset: t(`${K}.legend.needsReset`),
      blocked: t(`${K}.legend.blocked`),
    },
    tile: {
      free: t(`${K}.tile.free`),
      seated: t(`${K}.tile.seated`),
      seatedNamed: t(`${K}.tile.seatedNamed`),
      late: t(`${K}.tile.late`),
      held: t(`${K}.tile.held`),
      heldUnnamed: t(`${K}.tile.heldUnnamed`),
      needsReset: t(`${K}.tile.needsReset`),
      blocked: t(`${K}.tile.blocked`),
      billOpen: t(`${K}.tile.billOpen`),
      joinedWith: t("dashboard.tables.joinedWith"),
      partyOf: t("dashboard.tables.partySizeShort"),
      vacated: t("dashboard.tables.needsResetSince"),
      check: t("dashboard.pos.floor.checkTotal"),
      noCheck: t("dashboard.pos.floor.noCheckYet"),
      tabCheck: t("dashboard.tables.tabCheck"),
    },
    groups: { tables: t(`${K}.groups.tables`), booths: t(`${K}.groups.booths`), cabanas: t(`${K}.groups.cabanas`) },
    overrun: t(`${K}.overrun`),
    overrunHint: t(`${K}.overrunHint`),
    emptyFloor: t("dashboard.pos.floor.emptyFloor"),
    list: {
      table: t(`${K}.list.table`),
      state: t(`${K}.list.state`),
      party: t(`${K}.list.party`),
      seated: t(`${K}.list.seated`),
      server: t(`${K}.list.server`),
      unpaid: t(`${K}.list.unpaid`),
      next: t(`${K}.list.next`),
      open: t(`${K}.list.open`),
      stateSeated: t(`${K}.list.stateSeated`),
      stateOver: t(`${K}.list.stateOver`),
      stateArriving: t(`${K}.list.stateArriving`),
      stateHeld: t(`${K}.list.stateHeld`),
      stateNeedsReset: t(`${K}.list.stateNeedsReset`),
      stateBlocked: t(`${K}.list.stateBlocked`),
      stateFree: t(`${K}.list.stateFree`),
      minutes: t(`${K}.list.minutes`),
      until: t(`${K}.list.until`),
      serverNone: t(`${K}.list.serverNone`),
    },
    timeline: {
      footer: t(`${K}.timeline.footer`),
      seated: t(`${K}.timeline.seated`),
      over: t(`${K}.timeline.over`),
      reset: t(`${K}.timeline.reset`),
      bookedTo: t(`${K}.timeline.bookedTo`),
      empty: t(`${K}.timeline.empty`),
    },
    actions: {
      walkIn: t(`${K}.actions.walkIn`),
      newReservation: t(`${K}.actions.newReservation`),
      pauseOnline: t(`${K}.actions.pauseOnline`),
      pauseOnlineReason: t(`${K}.actions.pauseOnlineReason`),
    },
    popover: {
      seatedFor: t(`${K}.popover.seatedFor`),
      freeSeats: t(`${K}.popover.freeSeats`),
      heldPill: t(`${K}.popover.heldPill`),
      needsResetPill: t(`${K}.popover.needsResetPill`),
      blockedPill: t(`${K}.popover.blockedPill`),
      guests: t(`${K}.popover.guests`),
      unpaid: t(`${K}.popover.unpaid`),
      noCheck: t("dashboard.pos.floor.noCheckYet"),
      close: t("dashboard.pos.floor.closeSheet"),
      openOrder: t(`${K}.popover.openOrder`),
      addItems: t(`${K}.popover.addItems`),
      collect: t(`${K}.popover.collect`),
      sendKitchen: t("dashboard.pos.floor.sendKitchen"),
      fireStarters: t("dashboard.pos.floor.fireStarters"),
      fireMains: t("dashboard.pos.floor.fireMains"),
      fireDessert: t("dashboard.pos.floor.fireDessert"),
      moveOrJoin: t(`${K}.popover.moveOrJoin`),
      changeServer: t(`${K}.popover.changeServer`),
      changeServerReason: t(`${K}.popover.changeServerReason`),
      extendTime: t(`${K}.popover.extendTime`),
      extendTimeReason: t(`${K}.popover.extendTimeReason`),
      partyLeft: t(`${K}.popover.partyLeft`),
      seatParty: t(`${K}.popover.seatParty`),
      markReady: t("dashboard.pos.floor.markReady"),
      block: t(`${K}.popover.block`),
      blockReason: t(`${K}.popover.blockReason`),
      split: t(`${K}.popover.split`),
      splitReason: t(`${K}.popover.splitReason`),
      kitchenNone: t("dashboard.pos.floor.kitchenNone"),
      kitchenQueued: t("dashboard.pos.floor.kitchenQueued"),
      kitchenAcknowledged: t("dashboard.pos.floor.kitchenAcknowledged"),
      kitchenReady: t("dashboard.pos.floor.kitchenReady"),
    },
    seat: {
      title: t(`${K}.seat.title`),
      titleWalkIn: t(`${K}.seat.titleWalkIn`),
      subtitleHeld: t(`${K}.seat.subtitleHeld`),
      subtitleWalkIn: t(`${K}.seat.subtitleWalkIn`),
      assigned: t(`${K}.seat.assigned`),
      alsoFits: t(`${K}.seat.alsoFits`),
      seats: t(`${K}.seat.seats`),
      joinedSeats: t(`${K}.seat.joinedSeats`),
      freeNow: t(`${K}.seat.freeNow`),
      needsReset: t(`${K}.seat.needsReset`),
      heldFor: t(`${K}.seat.heldFor`),
      guestsHereNow: t(`${K}.seat.guestsHereNow`),
      of: t(`${K}.seat.of`),
      fewer: t("dashboard.pos.floor.fewerGuests"),
      more: t("dashboard.pos.floor.moreGuests"),
      server: t(`${K}.seat.server`),
      serverReason: t(`${K}.seat.serverReason`),
      note: t(`${K}.seat.note`),
      notHereYet: t(`${K}.seat.notHereYet`),
      noShow: t(`${K}.seat.noShow`),
      noShowReason: t(`${K}.seat.noShowReason`),
      confirm: t(`${K}.seat.confirm`),
      noFit: t(`${K}.seat.noFit`),
    },
    walkIn: {
      title: t(`${K}.walkIn.title`),
      subtitle: t(`${K}.walkIn.subtitle`),
      partySize: t(`${K}.walkIn.partySize`),
      guests: t(`${K}.walkIn.guests`),
      common: t(`${K}.walkIn.common`),
      name: t(`${K}.walkIn.name`),
      mobile: t(`${K}.walkIn.mobile`),
      optional: t(`${K}.walkIn.optional`),
      mobileReason: t(`${K}.walkIn.mobileReason`),
      highChair: t(`${K}.walkIn.highChair`),
      stepFree: t(`${K}.walkIn.stepFree`),
      quietArea: t(`${K}.walkIn.quietArea`),
      needsReason: t(`${K}.walkIn.needsReason`),
      rightNow: t(`${K}.walkIn.rightNow`),
      seatNow: t(`${K}.walkIn.seatNow`),
      freeFits: t(`${K}.walkIn.freeFits`),
      noFreeFits: t(`${K}.walkIn.noFreeFits`),
      waitlist: t(`${K}.walkIn.waitlist`),
      waitlistSub: t(`${K}.walkIn.waitlistSub`),
      addToWaitlist: t(`${K}.walkIn.addToWaitlist`),
      cancel: t(`${K}.walkIn.cancel`),
      added: t(`${K}.walkIn.added`),
    },
    waiting: {
      title: t(`${K}.waiting.title`),
      subtitle: t(`${K}.waiting.subtitle`),
      told: t(`${K}.waiting.told`),
      seatNow: t(`${K}.waiting.seatNow`),
      offerTable: t(`${K}.waiting.offerTable`),
      offerReason: t(`${K}.waiting.offerReason`),
      offered: t(`${K}.waiting.offered`),
      notifyNone: t(`${K}.waiting.notifyNone`),
      remove: t(`${K}.waiting.remove`),
      removeReason: t(`${K}.waiting.removeReason`),
      close: t(`${K}.waiting.close`),
      addParty: t(`${K}.waiting.addParty`),
      empty: t(`${K}.waiting.empty`),
    },
    change: {
      title: t(`${K}.change.title`),
      subtitle: t(`${K}.change.subtitle`),
      moveTitle: t(`${K}.change.moveTitle`),
      moveBody: t(`${K}.change.moveBody`),
      moveCta: t(`${K}.change.moveCta`),
      joinTitle: t(`${K}.change.joinTitle`),
      joinBody: t(`${K}.change.joinBody`),
      joinCta: t(`${K}.change.joinCta`),
      joinReason: t(`${K}.change.joinReason`),
      mergeTitle: t(`${K}.change.mergeTitle`),
      mergeBody: t(`${K}.change.mergeBody`),
      mergeCta: t(`${K}.change.mergeCta`),
      mergeReason: t(`${K}.change.mergeReason`),
      cancel: t(`${K}.change.cancel`),
    },
    move: {
      crumb: t(`${K}.move.crumb`),
      title: t(`${K}.move.title`),
      subtitle: t(`${K}.move.subtitle`),
      free: t(`${K}.move.free`),
      tooSmall: t(`${K}.move.tooSmall`),
      tooLarge: t(`${K}.move.tooLarge`),
      occupied: t(`${K}.move.occupied`),
      needsReset: t(`${K}.move.needsReset`),
      held: t(`${K}.move.held`),
      blocked: t(`${K}.move.blocked`),
      seats: t(`${K}.move.seats`),
      goesWithThem: t(`${K}.move.goesWithThem`),
      goesValue: t(`${K}.move.goesValue`),
      goesNothing: t(`${K}.move.goesNothing`),
      after: t(`${K}.move.after`),
      afterValue: t(`${K}.move.afterValue`),
      why: t(`${K}.move.why`),
      whyReason: t(`${K}.move.whyReason`),
      back: t(`${K}.move.back`),
      confirm: t(`${K}.move.confirm`),
      none: t("dashboard.pos.floor.noFreeTables"),
      done: t(`${K}.move.done`),
    },
    departed: {
      title: t(`${K}.departed.title`),
      titlePaid: t(`${K}.departed.titlePaid`),
      subtitle: t(`${K}.departed.subtitle`),
      subtitlePaid: t(`${K}.departed.subtitlePaid`),
      keepOpen: t(`${K}.departed.keepOpen`),
      keepOpenSub: t(`${K}.departed.keepOpenSub`),
      keepOpenReason: t(`${K}.departed.keepOpenReason`),
      paidOther: t(`${K}.departed.paidOther`),
      paidOtherSub: t(`${K}.departed.paidOtherSub`),
      paidOtherReason: t(`${K}.departed.paidOtherReason`),
      walkOut: t(`${K}.departed.walkOut`),
      walkOutSub: t(`${K}.departed.walkOutSub`),
      walkOutReason: t(`${K}.departed.walkOutReason`),
      back: t(`${K}.departed.back`),
      confirm: t(`${K}.departed.confirm`),
    },
    reset: {
      title: t(`${K}.reset.title`),
      subtitle: t(`${K}.reset.subtitle`),
      cleared: t(`${K}.reset.cleared`),
      resetFor: t(`${K}.reset.resetFor`),
      candle: t(`${K}.reset.candle`),
      note: t(`${K}.reset.note`),
      notYet: t(`${K}.reset.notYet`),
      confirm: t(`${K}.reset.confirm`),
    },
    reservation: {
      title: t(`${K}.reservation.title`),
      subtitle: t(`${K}.reservation.subtitle`),
      date: t(`${K}.reservation.date`),
      time: t(`${K}.reservation.time`),
      party: t(`${K}.reservation.party`),
      customer: t(`${K}.reservation.customer`),
      email: t(`${K}.reservation.email`),
      phone: t(`${K}.reservation.phone`),
      note: t(`${K}.reservation.note`),
      noteReason: t(`${K}.reservation.noteReason`),
      where: t(`${K}.reservation.where`),
      whereReason: t(`${K}.reservation.whereReason`),
      money: t(`${K}.reservation.money`),
      deposit: t(`${K}.reservation.deposit`),
      depositSub: t(`${K}.reservation.depositSub`),
      noDeposit: t(`${K}.reservation.noDeposit`),
      noDepositSub: t(`${K}.reservation.noDepositSub`),
      availability: t(`${K}.reservation.availability`),
      loading: t(`${K}.reservation.loading`),
      pickTime: t(`${K}.reservation.pickTime`),
      lastSeating: t(`${K}.reservation.lastSeating`),
      upsize: t(`${K}.reservation.upsize`),
      confirmDeposit: t(`${K}.reservation.confirmDeposit`),
      confirm: t(`${K}.reservation.confirm`),
      cancel: t(`${K}.reservation.cancel`),
      done: t(`${K}.reservation.done`),
      collectNext: t(`${K}.reservation.collectNext`),
      contactNeeded: t(`${K}.reservation.contactNeeded`),
    },
    notices: {
      sentToKitchen: t("dashboard.pos.floor.sentToKitchen"),
      amendedInKitchen: t("dashboard.pos.floor.amendedInKitchen"),
      seatedNotMarked: t("dashboard.pos.floor.seatedNotMarked"),
    },
    refusal: {
      not_found: t(`${R}.notFound`),
      wrong_tenant: t(`${R}.wrongTenant`),
      already_open: t(`${R}.alreadyOpen`),
      invalid: t(`${R}.invalid`),
      party_too_small: t(`${R}.partyTooSmall`),
      party_too_large: t(`${R}.partyTooLarge`),
      not_combinable: t(`${R}.notCombinable`),
      joined_unavailable: t(`${R}.joinedUnavailable`),
      joined_visit: t(`${R}.joinedVisit`),
      not_open: t(`${R}.notOpen`),
      outstanding: t(`${R}.outstanding`),
      already_closed: t(`${R}.alreadyClosed`),
      version_conflict: t(`${R}.versionConflict`),
      not_allowed: t(`${R}.notAllowed`),
      unavailable: t(`${R}.unavailable`),
      reservation_not_found: t(`${R}.reservationNotFound`),
      reservation_other_table: t(`${R}.reservationOtherTable`),
      reservation_not_valid: t(`${R}.reservationNotValid`),
      reservation_already_seated: t(`${R}.reservationAlreadySeated`),
      kitchen_empty: t("dashboard.pos.floor.refusal.kitchenEmpty"),
      kitchen_not_found: t("dashboard.pos.floor.refusal.kitchenNotFound"),
      walkins_off: t(`${D}.walkinsOff`),
      party_below_minimum: t(`${D}.partyBelowMinimum`),
      party_above_maximum: t(`${D}.partyAboveMaximum`),
      no_band_fits_this_party: t(`${D}.noBandFits`),
      sold_out: t(`${D}.soldOut`),
      capacity_unavailable: t(`${D}.capacityUnavailable`),
      engine_error: t(`${D}.engineError`),
      reservations_off: t(`${D}.reservationsOff`),
      time_not_offered: t(`${K}.refusal.timeNotOffered`),
      no_offering_configured: t(`${K}.refusal.noOfferingConfigured`),
      no_contact: t(`${K}.refusal.noContact`),
      closed: t(`${K}.refusal.closed`),
      too_late_today: t(`${K}.refusal.tooLateToday`),
      // The engine's table operations (`lines_paid`, and the till's wording for the rest).
      ...floorEngineRefusals(t),
      // The party waitlist's own sentences win where the venue engine names the code too.
      already_seated: t("dashboard.venue.engine.refusal.already_seated"),
      space_occupied: t("dashboard.venue.engine.refusal.space_occupied"),
      expired: t("dashboard.venue.engine.refusal.expired"),
      conflict: t("dashboard.venue.engine.refusal.conflict"),
      waitlist_no_channel: t(`${K}.waiting.notifyNone`),
    },
    engine: floorEngineCopy(t),
  };
}

/** A code as a sentence. An unknown code reads as the generic one, never raw. */
export function floorRefusalText(copy: FloorBoardCopy, code: string): string {
  const table: Readonly<Record<string, string | undefined>> = copy.refusal;
  return table[code] ?? copy.refusal.unavailable;
}
