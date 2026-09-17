/**
 * floor-copy-reservation.ts — the sentences of the till's staff reservation
 * (R01 `New reservation`, R02 unavailable, R03 reserved). Read through the
 * same translator as `floor-copy.ts`, in its own file so that one stays
 * under the size cap (as `floor-copy-engine.ts` does for Package 1).
 */

import type { Translator } from "../pos/translator";

const K = "dashboard.pos.floor.board";

export type FloorReservationCopy = {
  readonly title: string;
  readonly subtitle: string;
  readonly date: string;
  readonly time: string;
  readonly party: string;
  readonly duration: string;
  /** `{time} · party of {n}` */
  readonly durationValue: string;
  readonly durationReason: string;
  readonly customer: string;
  readonly occasion: string;
  readonly occasionReason: string;
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

export function floorReservationCopy(t: Translator): FloorReservationCopy {
  return {
    title: t(`${K}.reservation.title`),
    subtitle: t(`${K}.reservation.subtitle`),
    date: t(`${K}.reservation.date`),
    time: t(`${K}.reservation.time`),
    party: t(`${K}.reservation.party`),
    duration: t(`${K}.reservation.duration`),
    durationValue: t(`${K}.reservation.durationValue`),
    durationReason: t(`${K}.reservation.durationReason`),
    customer: t(`${K}.reservation.customer`),
    occasion: t(`${K}.reservation.occasion`),
    occasionReason: t(`${K}.reservation.occasionReason`),
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
  };
}
