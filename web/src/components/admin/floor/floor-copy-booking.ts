/**
 * floor-copy-booking.ts: the sentences of the reservation detail sheet
 * (TUL-1757: open a table reservation, mark it a no-show, cancel it). Read
 * through the same translator as `floor-copy.ts`, in its own file so that one
 * stays under the size cap (as `floor-copy-reservation.ts` does).
 */

import type { Translator } from "../pos/translator";

const K = "dashboard.pos.floor.board.booking";

export type FloorBookingCopy = {
  readonly title: string;
  /** `{name} · party of {n}` */
  readonly subtitle: string;
  readonly guest: string;
  readonly party: string;
  /** `{n} guests` */
  readonly partyValue: string;
  readonly time: string;
  readonly status: string;
  readonly table: string;
  readonly noTable: string;
  readonly contact: string;
  readonly noContact: string;
  readonly stateBooked: string;
  readonly stateArriving: string;
  /** `Late by {n} min` */
  readonly stateLate: string;
  readonly seat: string;
  readonly noShow: string;
  readonly noShowHint: string;
  readonly cancel: string;
  readonly close: string;
  readonly keep: string;
  /** `Mark {name} as a no-show?` */
  readonly confirmNoShowTitle: string;
  readonly confirmNoShowBody: string;
  readonly confirmNoShow: string;
  readonly confirmCancelTitle: string;
  readonly confirmCancelBody: string;
  readonly confirmCancel: string;
  /** `{name} marked as a no-show. The table is free again.` */
  readonly noShowDone: string;
  readonly cancelDone: string;
  readonly refusalNotLate: string;
};

export function floorBookingCopy(t: Translator): FloorBookingCopy {
  return {
    title: t(`${K}.title`),
    subtitle: t(`${K}.subtitle`),
    guest: t(`${K}.guest`),
    party: t(`${K}.party`),
    partyValue: t(`${K}.partyValue`),
    time: t(`${K}.time`),
    status: t(`${K}.status`),
    table: t(`${K}.table`),
    noTable: t(`${K}.noTable`),
    contact: t(`${K}.contact`),
    noContact: t(`${K}.noContact`),
    stateBooked: t(`${K}.stateBooked`),
    stateArriving: t(`${K}.stateArriving`),
    stateLate: t(`${K}.stateLate`),
    seat: t(`${K}.seat`),
    noShow: t(`${K}.noShow`),
    noShowHint: t(`${K}.noShowHint`),
    cancel: t(`${K}.cancel`),
    close: t(`${K}.close`),
    keep: t(`${K}.keep`),
    confirmNoShowTitle: t(`${K}.confirmNoShowTitle`),
    confirmNoShowBody: t(`${K}.confirmNoShowBody`),
    confirmNoShow: t(`${K}.confirmNoShow`),
    confirmCancelTitle: t(`${K}.confirmCancelTitle`),
    confirmCancelBody: t(`${K}.confirmCancelBody`),
    confirmCancel: t(`${K}.confirmCancel`),
    noShowDone: t(`${K}.noShowDone`),
    cancelDone: t(`${K}.cancelDone`),
    refusalNotLate: t(`${K}.refusalNotLate`),
  };
}
