"use client";

/**
 * WalkInSheet — T07 "Walk-in" (`POSWalkIn`): party size with the three
 * common sizes, a name, the mobile (no text is sent: said), the needs (not
 * stored on a visit: said), then RIGHT NOW: every free table that fits with
 * `Seat now` (the same `seatParty` the tile uses), and the waiting list with
 * `Add to waitlist` (`takeWalkIn`, the host stand's own writer: an admission
 * for now with no table, which the Waiting list then shows).
 *
 * WaitingSheet — T08 "Waiting list" (`POSWaitlistOffer`): the parties on
 * the list with how long they have waited; `Seat now` opens the seat sheet
 * for that party. Offering a table by text and removing a party have no
 * writer on the till (said, disabled).
 */

import { Clock, Plus } from "lucide-react";
import { useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_INPUT, POS_LABEL, POS_NOTE, POS_OUTLINE_ACTION, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { fits, isSeatable, tableCode, waitingEntries, type FloorBookEntry } from "./floor-model";
import { FLOOR_EYEBROW } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";

const COMMON = [2, 4, 6] as const;

export type WalkInSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSeatNow: (table: FloorTable, partySize: number) => void;
  readonly onAddToWaitlist: (input: { holderName: string; partySize: number }) => void;
};

function Stepper({ value, onChange, busy, copy }: { value: number; onChange: (n: number) => void; busy: boolean; copy: FloorBoardCopy }) {
  return (
    <div className="flex h-[52px] items-stretch overflow-hidden rounded-[12px] border-[1.5px] border-admin-border bg-admin-card">
      <button type="button" aria-label={copy.seat.fewer} disabled={busy || value <= 1} onClick={() => onChange(Math.max(1, value - 1))} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
        −
      </button>
      <output data-floor-party className="flex flex-1 items-center justify-center gap-1.5 border-x border-admin-border text-[18px] font-semibold text-admin-ink">
        {value}
        <span className="text-[13px] font-normal text-admin-ink-muted">{copy.walkIn.guests}</span>
      </output>
      <button type="button" aria-label={copy.seat.more} disabled={busy} onClick={() => onChange(Math.min(200, value + 1))} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
        +
      </button>
    </div>
  );
}

export function WalkInSheet(props: WalkInSheetProps) {
  const { data, copy, busy } = props;
  const w = copy.walkIn;
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const fitting = data.tables.filter((t) => isSeatable(t) && !t.joinedFromSpaceId && fits(t, party) && !t.needsResetSinceIso);
  const ahead = waitingEntries(data.book).length;

  return (
    <PosSheet
      open={props.open}
      name="walk-in"
      title={w.title}
      subtitle={w.subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {w.cancel}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className={POS_LABEL}>{w.partySize}</span>
            <Stepper value={party} onChange={setParty} busy={busy} copy={copy} />
          </div>
          <div>
            <span className={POS_LABEL}>{w.common}</span>
            <div className="grid grid-cols-3 gap-2">
              {COMMON.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={party === n}
                  disabled={busy}
                  onClick={() => setParty(n)}
                  className={cn(
                    "h-[52px] rounded-[12px] border-[1.5px] text-[18px] font-semibold transition-colors",
                    party === n ? "border-admin-brand bg-admin-brand-soft text-admin-brand" : "border-admin-border bg-admin-card text-admin-ink hover:bg-admin-surface-alt",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="floor-walkin-name" className={POS_LABEL}>
              {w.name}
            </label>
            <input id="floor-walkin-name" data-floor-walkin-name className={POS_INPUT} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} autoComplete="off" />
            <p className="m-0 mt-1 text-[12.5px] text-admin-ink-muted">{w.optional}</p>
          </div>
          <div>
            <label htmlFor="floor-walkin-mobile" className={POS_LABEL}>
              {w.mobile}
            </label>
            <input id="floor-walkin-mobile" className={POS_INPUT} disabled title={w.mobileReason} aria-describedby="floor-walkin-mobile-reason" />
            <p id="floor-walkin-mobile-reason" className="m-0 mt-1 text-[12.5px] text-admin-ink-muted">
              {w.mobileReason}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2" title={w.needsReason}>
          {[w.highChair, w.stepFree, w.quietArea].map((label) => (
            <label key={label} className="flex items-center gap-2 text-[15px] text-admin-ink-dim">
              <input type="checkbox" disabled className="h-5 w-5 rounded-[6px] border-[1.5px] border-admin-border" />
              {label}
            </label>
          ))}
          <span className="basis-full text-[12.5px] text-admin-ink-muted">{w.needsReason}</span>
        </div>
        <section className="flex flex-col gap-2.5">
          <p className={cn("m-0", FLOOR_EYEBROW)}>{w.rightNow}</p>
          {fitting.length === 0 ? (
            <p className={cn("m-0", POS_NOTE)}>{w.noFreeFits}</p>
          ) : (
            fitting.map((t) => (
              <div key={t.spaceId} data-floor-walkin-fit={tableCode(t)} className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-admin-ink">
                    {interpolate(w.freeFits, { code: tableCode(t), n: t.partyMax })}
                  </span>
                </span>
                <button type="button" className={POS_OUTLINE_ACTION} disabled={busy} onClick={() => props.onSeatNow(t, party)}>
                  {w.seatNow}
                </button>
              </div>
            ))
          )}
          <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-admin-ink">{w.waitlist}</span>
              <span className="block text-[14px] text-admin-ink-muted">{interpolate(w.waitlistSub, { n: ahead })}</span>
            </span>
            <button
              type="button"
              data-floor-walkin-waitlist
              className={cn(POS_PRIMARY_ACTION, "h-12 text-[15px]")}
              disabled={busy}
              onClick={() => props.onAddToWaitlist({ holderName: name.trim(), partySize: party })}
            >
              {w.addToWaitlist}
            </button>
          </div>
        </section>
      </div>
    </PosSheet>
  );
}

export type WaitingSheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSeat: (entry: FloorBookEntry) => void;
  readonly onAddParty: () => void;
};

export function WaitingSheet(props: WaitingSheetProps) {
  const { data, copy, busy } = props;
  const w = copy.waiting;
  const nowMs = Date.parse(data.nowIso);
  const waiting = waitingEntries(data.book);
  return (
    <PosSheet
      open={props.open}
      name="waiting"
      title={interpolate(w.title, { n: waiting.length })}
      subtitle={w.subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
          {w.close}
        </button>
      }
      footerEnd={
        <button type="button" className={POS_OUTLINE_ACTION} disabled={busy} onClick={props.onAddParty}>
          <Plus aria-hidden size={18} strokeWidth={1.75} />
          {w.addParty}
        </button>
      }
    >
      {waiting.length === 0 ? (
        <p className="m-0 text-[15px] text-admin-ink-muted">{w.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {waiting.map((entry) => (
            <li key={entry.admissionId} data-floor-waiting={entry.admissionId} className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-admin-border bg-admin-card px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-admin-ink">
                    {entry.holderName ?? copy.panel.walkIn} · {entry.partySize}
                  </span>
                  <span className="block text-[14px] text-admin-ink-muted">
                    {interpolate(w.told, {
                      time: venueHhmm(entry.startsAtIso, data.timeZone, data.locale),
                      n: Math.max(0, Math.round((nowMs - Date.parse(entry.startsAtIso)) / 60_000)),
                    })}
                  </span>
                </span>
                <Clock aria-hidden size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-admin-ink-dim" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={cn(POS_PRIMARY_ACTION, "h-12 text-[15px]")} disabled={busy} onClick={() => props.onSeat(entry)}>
                  {w.seatNow}
                </button>
                <button type="button" className={POS_OUTLINE_ACTION} disabled title={w.offerReason}>
                  {w.offerTable}
                </button>
                <button type="button" className={POS_SECONDARY_ACTION} disabled title={w.removeReason}>
                  {w.remove}
                </button>
              </div>
              <p className="m-0 text-[12.5px] text-admin-ink-muted">{w.offerReason}</p>
            </li>
          ))}
        </ul>
      )}
    </PosSheet>
  );
}
