/**
 * The floor's words, in one function.
 *
 * WHY IT IS NOT INLINE IN `page.tsx`. A render test that rebuilt this mapping
 * for itself would be testing its own copy of the wiring: the page could point
 * `refusal.party_too_large` at the wrong catalog key and the test would still
 * pass, which is the exact class of bug the i18n key guard exists for one
 * layer down. One builder, used by the page and by the tests.
 */

import type { TablesCopy } from "./tables-client";

export function tablesCopy(tr: (key: string) => string): TablesCopy {
  return {
    empty: tr("dashboard.tables.empty"),
    close: tr("dashboard.tables.close"),
    sale: tr("dashboard.tables.sale"),
    occupied: tr("dashboard.tables.occupied"),
    free: tr("dashboard.tables.free"),
    held: tr("dashboard.tables.held"),
    tableCheck: tr("dashboard.tables.tableCheck"),
    tabCheck: tr("dashboard.tables.tabCheck"),
    minSpend: tr("dashboard.tables.minSpend"),
    move: tr("dashboard.tables.move"),
    openTab: tr("dashboard.tables.openTab"),
    seatParty: tr("dashboard.tables.seatParty"),
    partySizeLabel: tr("dashboard.tables.partySizeLabel"),
    confirmSeat: tr("dashboard.tables.confirmSeat"),
    cancel: tr("dashboard.tables.cancel"),
    heldForNamed: tr("dashboard.tables.heldForNamed"),
    heldUnnamed: tr("dashboard.tables.heldUnnamed"),
    heldArriving: tr("dashboard.tables.heldArriving"),
    heldLate: tr("dashboard.tables.heldLate"),
    partySizeShort: tr("dashboard.tables.partySizeShort"),
    elapsedMinutes: tr("dashboard.tables.elapsedMinutes"),
    dueBy: tr("dashboard.tables.dueBy"),
    overdueBy: tr("dashboard.tables.overdueBy"),
    turnMinutesLabel: tr("dashboard.tables.turnMinutesLabel"),
    moveHeading: tr("dashboard.tables.moveHeading"),
    joinHeading: tr("dashboard.tables.joinHeading"),
    joinNeeded: tr("dashboard.tables.joinNeeded"),
    noFreeTables: tr("dashboard.tables.noFreeTables"),
    noJoinOptions: tr("dashboard.tables.noJoinOptions"),
    joinedWith: tr("dashboard.tables.joinedWith"),
    needsReset: tr("dashboard.tables.needsReset"),
    needsResetSince: tr("dashboard.tables.needsResetSince"),
    markReset: tr("dashboard.tables.markReset"),
    seatedNotMarked: tr("dashboard.tables.seatedNotMarked"),
    refusal: {
      not_found: tr("dashboard.tables.refusal.notFound"),
      wrong_tenant: tr("dashboard.tables.refusal.wrongTenant"),
      already_open: tr("dashboard.tables.refusal.alreadyOpen"),
      invalid: tr("dashboard.tables.refusal.invalid"),
      party_too_small: tr("dashboard.tables.refusal.partyTooSmall"),
      party_too_large: tr("dashboard.tables.refusal.partyTooLarge"),
      not_combinable: tr("dashboard.tables.refusal.notCombinable"),
      joined_unavailable: tr("dashboard.tables.refusal.joinedUnavailable"),
      joined_visit: tr("dashboard.tables.refusal.joinedVisit"),
      not_open: tr("dashboard.tables.refusal.notOpen"),
      outstanding: tr("dashboard.tables.refusal.outstanding"),
      already_closed: tr("dashboard.tables.refusal.alreadyClosed"),
      version_conflict: tr("dashboard.tables.refusal.versionConflict"),
      not_allowed: tr("dashboard.tables.refusal.notAllowed"),
      unavailable: tr("dashboard.tables.refusal.unavailable"),
      reservation_not_found: tr("dashboard.tables.refusal.reservationNotFound"),
      reservation_other_table: tr("dashboard.tables.refusal.reservationOtherTable"),
      reservation_not_valid: tr("dashboard.tables.refusal.reservationNotValid"),
      reservation_already_seated: tr("dashboard.tables.refusal.reservationAlreadySeated"),
    },
  };
}
