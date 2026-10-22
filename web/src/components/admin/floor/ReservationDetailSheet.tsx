"use client";

/**
 * ReservationDetailSheet: a table reservation, opened from the Arriving list
 * (TUL-1757). Holder, party, time, table, status and contact, and the three
 * things a host does with a party that is not seated yet: SEAT it, mark it a
 * NO-SHOW once its time has passed, or CANCEL it.
 *
 * It used to be that a late party with no table opened the WAITING-LIST sheet
 * (a different list, empty for a booking), and a booking had no detail view
 * at all. Both destructive moves ask once before they write; the board runs
 * the write and says the refusal in the reader's language.
 */

import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import { POS_DANGER_ACTION, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { bookName, canCancelReservation, canMarkNoShow, type FloorBookEntry } from "./floor-model";
import type { FloorActions, FloorBoardData } from "./floor-types";

export type ReservationDetailSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly actions: Pick<FloorActions, "markNoShow" | "cancelReservation">;
  readonly entry: FloorBookEntry;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSeat: (entry: FloorBookEntry) => void;
  readonly onNoShow: (entry: FloorBookEntry) => void;
  readonly onCancel: (entry: FloorBookEntry) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-admin-border-soft py-3 first:border-t-0">
      <dt className="text-[14px] text-admin-ink-muted">{label}</dt>
      <dd className="m-0 text-right text-[15px] font-semibold text-admin-ink">{children}</dd>
    </div>
  );
}

export function ReservationDetailSheet(props: ReservationDetailSheetProps) {
  const { data, copy, entry, busy } = props;
  const b = copy.booking;
  const [confirm, setConfirm] = useState<"noshow" | "cancel" | null>(null);
  const nowMs = Date.parse(data.nowIso);
  const name = bookName(entry, copy.panel.walkIn);
  const noShowOk = Boolean(props.actions.markNoShow) && canMarkNoShow(entry, nowMs);
  const cancelOk = Boolean(props.actions.cancelReservation) && canCancelReservation(entry);
  const status =
    entry.state === "late"
      ? interpolate(b.stateLate, { n: entry.lateMinutes })
      : entry.state === "arriving"
        ? b.stateArriving
        : b.stateBooked;

  if (confirm) {
    const noShow = confirm === "noshow";
    return (
      <PosSheet
        open={props.open}
        name={noShow ? "reservation-no-show" : "reservation-cancel"}
        title={noShow ? interpolate(b.confirmNoShowTitle, { name }) : b.confirmCancelTitle}
        subtitle={interpolate(b.subtitle, { name, n: entry.partySize })}
        closeLabel={copy.popover.close}
        onClose={props.onClose}
        footerStart={
          <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={() => setConfirm(null)}>
            {b.keep}
          </button>
        }
        footerEnd={
          <button
            type="button"
            data-floor-reservation-confirm={noShow ? "no-show" : "cancel"}
            className={POS_DANGER_ACTION}
            disabled={busy}
            onClick={() => (noShow ? props.onNoShow(entry) : props.onCancel(entry))}
          >
            {noShow ? b.confirmNoShow : b.confirmCancel}
          </button>
        }
      >
        <p className="m-0 text-[15px] leading-relaxed text-admin-ink-muted">{noShow ? b.confirmNoShowBody : b.confirmCancelBody}</p>
      </PosSheet>
    );
  }

  return (
    <PosSheet
      open={props.open}
      name="reservation-detail"
      title={b.title}
      subtitle={interpolate(b.subtitle, { name, n: entry.partySize })}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {b.close}
        </button>
      }
      footerEnd={
        <div className="flex flex-wrap justify-end gap-2">
          {cancelOk && (
            <button type="button" data-floor-reservation-cancel className={POS_OUTLINE_ACTION} disabled={busy} onClick={() => setConfirm("cancel")}>
              {b.cancel}
            </button>
          )}
          {noShowOk && (
            <button type="button" data-floor-reservation-no-show className={POS_DANGER_ACTION} disabled={busy} onClick={() => setConfirm("noshow")}>
              {b.noShow}
            </button>
          )}
          <button type="button" data-floor-reservation-seat className={POS_PRIMARY_ACTION} disabled={busy} onClick={() => props.onSeat(entry)}>
            {b.seat}
          </button>
        </div>
      }
    >
      <dl data-floor-reservation-detail={entry.admissionId} className="m-0">
        <Row label={b.guest}>{name}</Row>
        <Row label={b.party}>{interpolate(b.partyValue, { n: entry.partySize })}</Row>
        <Row label={b.time}>{venueHhmm(entry.startsAtIso, data.timeZone, data.locale)}</Row>
        <Row label={b.status}>{status}</Row>
        <Row label={b.table}>{entry.spaceCode ?? b.noTable}</Row>
        <Row label={b.contact}>{entry.holderEmail ?? b.noContact}</Row>
      </dl>
      {!noShowOk && Boolean(props.actions.markNoShow) && <p className="m-0 mt-4 text-[13px] text-admin-ink-muted">{b.noShowHint}</p>}
    </PosSheet>
  );
}
