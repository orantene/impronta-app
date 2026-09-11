/**
 * The Floor mode's words, in one function.
 *
 * Same rule as `tables/tables-copy.ts`: one builder, used by the page and by
 * the render test, so a test cannot pass by rebuilding a mapping the page
 * does not use. The refusal sentences are the SAME catalogue entries the
 * workspace Spaces page prints (`dashboard.tables.refusal.*`): the floor at
 * the till and the floor in the workspace call the same engine, so they say
 * the same things when it refuses. The two kitchen refusals the till can
 * reach (sending an empty check, sending a check that is gone) are the
 * floor's own.
 */

import { tablesCopy } from "../tables/tables-copy";
import type { FloorCopy } from "./floor-client";

export function floorCopy(tr: (key: string) => string): FloorCopy {
  const tables = tablesCopy(tr);
  return {
    railLabel: tr("dashboard.pos.floor.rail.label"),
    rail: {
      tables: tr("dashboard.pos.floor.rail.tables"),
      seating: tr("dashboard.pos.floor.rail.seating"),
    },
    title: tr("dashboard.pos.floor.title"),
    summary: tr("dashboard.pos.floor.summary"),
    emptyFloor: tr("dashboard.pos.floor.emptyFloor"),
    emptySeated: tr("dashboard.pos.floor.emptySeated"),
    tapHint: tr("dashboard.pos.floor.tapHint"),
    sheetHeading: tr("dashboard.pos.floor.sheetHeading"),
    closeSheet: tr("dashboard.pos.floor.closeSheet"),
    guests: tr("dashboard.pos.floor.guests"),
    fewerGuests: tr("dashboard.pos.floor.fewerGuests"),
    moreGuests: tr("dashboard.pos.floor.moreGuests"),
    seatHere: tr("dashboard.pos.floor.seatHere"),
    seatAcross: tr("dashboard.pos.floor.seatAcross"),
    joinOffer: tr("dashboard.pos.floor.joinOffer"),
    noJoinOptions: tr("dashboard.pos.floor.noJoinOptions"),
    openCheck: tr("dashboard.pos.floor.openCheck"),
    sendKitchen: tr("dashboard.pos.floor.sendKitchen"),
    movePartyHeading: tr("dashboard.pos.floor.movePartyHeading"),
    noFreeTables: tr("dashboard.pos.floor.noFreeTables"),
    endVisit: tr("dashboard.pos.floor.endVisit"),
    markReady: tr("dashboard.pos.floor.markReady"),
    kitchenNone: tr("dashboard.pos.floor.kitchenNone"),
    kitchenQueued: tr("dashboard.pos.floor.kitchenQueued"),
    kitchenAcknowledged: tr("dashboard.pos.floor.kitchenAcknowledged"),
    kitchenReady: tr("dashboard.pos.floor.kitchenReady"),
    sentToKitchen: tr("dashboard.pos.floor.sentToKitchen"),
    amendedInKitchen: tr("dashboard.pos.floor.amendedInKitchen"),
    checkTotal: tr("dashboard.pos.floor.checkTotal"),
    noCheckYet: tr("dashboard.pos.floor.noCheckYet"),
    seatedNotMarked: tr("dashboard.pos.floor.seatedNotMarked"),
    state: {
      free: tables.free,
      held: tables.held,
      occupied: tables.occupied,
      needsReset: tables.needsReset,
      tableCheck: tables.tableCheck,
      tabCheck: tables.tabCheck,
    },
    card: {
      partySizeShort: tables.partySizeShort,
      elapsedMinutes: tables.elapsedMinutes,
      dueBy: tables.dueBy,
      overdueBy: tables.overdueBy,
      heldForNamed: tables.heldForNamed,
      heldUnnamed: tables.heldUnnamed,
      heldArriving: tables.heldArriving,
      joinedWith: tables.joinedWith,
      needsResetSince: tables.needsResetSince,
    },
    refusal: {
      ...tables.refusal,
      kitchen_empty: tr("dashboard.pos.floor.refusal.kitchenEmpty"),
      kitchen_not_found: tr("dashboard.pos.floor.refusal.kitchenNotFound"),
    },
  };
}
