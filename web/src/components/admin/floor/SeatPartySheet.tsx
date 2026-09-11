"use client";

/**
 * SeatPartySheet — T05 "Seat party" (`POSSeatParty`) with T15's join folded
 * in: ASSIGNED (the table the host tapped, or the one the booking holds),
 * ALSO FITS (every other free table that fits, and every free pair the
 * combination rules allow), the guests-here-now stepper, the server (not
 * tracked on a visit, said), and `Seat N guests at X`. The seating itself is
 * `actions.seatParty`, which the ENGINE refuses when the party does not fit:
 * an option that does not fit is not hidden and not disabled (a host may
 * override a two-top with a high chair), it is marked, and the refusal is a
 * sentence in the banner with the join the rules allow already on the screen.
 */

import { Check } from "lucide-react";
import { useMemo, useState } from "react";

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_DANGER_ACTION, POS_INPUT, POS_LABEL, POS_NOTE_INFO, POS_PRIMARY_ACTION, POS_SECONDARY_ACTION } from "../pos/pos-classes";
import { PosSheet } from "../pos/PosSheet";

import type { FloorBoardCopy } from "./floor-copy";
import { fits, isSeatable, tableCode, type FloorBookEntry } from "./floor-model";
import { FLOOR_EYEBROW, OPTION_CARD, OPTION_CARD_ACTIVE, OPTION_CARD_IDLE, OPTION_CARD_OFF } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";

/** One place a party can be seated: a table alone, or a table with a joined partner. */
export type SeatOption = {
  readonly id: string;
  readonly spaceId: string;
  readonly joinedSpaceId?: string;
  readonly label: string;
  readonly partyMin: number;
  readonly partyMax: number;
  readonly detail: string;
  readonly fits: boolean;
};

export type SeatPartySheetProps = {
  readonly open: boolean;
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  /** The table the host tapped, when the sheet came from a tile. */
  readonly table: FloorTable | null;
  /** The booking being seated, when the sheet came from the Arriving list or a held tile. */
  readonly entry: FloorBookEntry | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSeat: (input: { spaceId: string; joinedSpaceId?: string; partySize: number; admissionId?: string }) => void;
};

/** Every seatable table and pair, the assigned one first. */
export function seatOptions(
  tables: readonly FloorTable[],
  assignedId: string | null,
  n: number,
  copy: FloorBoardCopy,
  data: FloorBoardData,
): SeatOption[] {
  const s = copy.seat;
  const seatable = tables.filter((t) => isSeatable(t) && !t.joinedFromSpaceId);
  const options: SeatOption[] = [];
  for (const t of seatable) {
    const detail = t.needsResetSinceIso
      ? s.needsReset
      : t.held
        ? interpolate(s.heldFor, { name: t.held.holderName ?? copy.panel.walkIn, time: venueHhmm(t.held.startsAtIso, data.timeZone, data.locale) })
        : s.freeNow;
    options.push({
      id: t.spaceId,
      spaceId: t.spaceId,
      label: interpolate(s.seats, { code: tableCode(t), min: t.partyMin, max: t.partyMax }),
      partyMin: t.partyMin,
      partyMax: t.partyMax,
      detail,
      fits: fits(t, n),
    });
    for (const c of t.combinableWith) {
      const other = tables.find((x) => x.spaceId === c.spaceId);
      if (!other || !isSeatable(other)) continue;
      options.push({
        id: `${t.spaceId}+${c.spaceId}`,
        spaceId: t.spaceId,
        joinedSpaceId: c.spaceId,
        label: interpolate(s.joinedSeats, { a: tableCode(t), b: tableCode(other), min: c.partyMin, max: c.partyMax }),
        partyMin: c.partyMin,
        partyMax: c.partyMax,
        detail: s.freeNow,
        fits: n >= c.partyMin && n <= c.partyMax,
      });
    }
  }
  options.sort((a, b) => {
    const aa = a.spaceId === assignedId ? 0 : 1;
    const bb = b.spaceId === assignedId ? 0 : 1;
    if (aa !== bb) return aa - bb;
    if (a.fits !== b.fits) return a.fits ? -1 : 1;
    return 0;
  });
  return options;
}

export function SeatPartySheet(props: SeatPartySheetProps) {
  const { data, copy, table, entry, busy } = props;
  const s = copy.seat;
  const bookedFor = entry?.partySize ?? table?.held?.partySize ?? null;
  const [party, setParty] = useState<number>(bookedFor ?? Math.max(1, table?.partyMin ?? 2));
  const assignedId = table?.spaceId ?? (entry?.spaceCode ? (data.tables.find((t) => tableCode(t) === entry.spaceCode)?.spaceId ?? null) : null);
  const options = useMemo(() => seatOptions(data.tables, assignedId, party, copy, data), [data, assignedId, party, copy]);
  const [choice, setChoice] = useState<string | null>(null);
  // The tapped table stays the choice even when the party does not fit it:
  // the host may still ask, and the ENGINE refuses in a sentence. The join
  // the rules allow is on the same screen as the next option.
  const chosen =
    options.find((o) => o.id === choice) ??
    options.find((o) => o.spaceId === assignedId && !o.joinedSpaceId) ??
    options.find((o) => o.fits) ??
    null;
  // ASSIGNED is the tapped (or held) table and its pairs, fit or not: the
  // host may still ask and the engine answers. ALSO FITS is exactly that:
  // a party of three is never offered a two-top it did not tap.
  const assigned = options.filter((o) => o.spaceId === assignedId);
  const others = options.filter((o) => o.spaceId !== assignedId && o.fits);
  const name = entry?.holderName ?? table?.held?.holderName ?? null;
  const admissionId = entry?.admissionId ?? table?.held?.admissionId;
  const code = chosen ? chosen.label.split(" · ")[0] : (table ? tableCode(table) : "");

  const title = name && bookedFor ? interpolate(s.title, { name, n: bookedFor }) : interpolate(s.titleWalkIn, { code: table ? tableCode(table) : "" });
  const whenIso = entry?.startsAtIso ?? table?.held?.startsAtIso ?? null;
  const subtitle = whenIso && bookedFor ? interpolate(s.subtitleHeld, { time: venueHhmm(whenIso, data.timeZone, data.locale), n: bookedFor }) : s.subtitleWalkIn;

  function option(o: SeatOption) {
    const active = chosen?.id === o.id;
    return (
      <li key={o.id}>
        <button
          type="button"
          role="radio"
          aria-checked={active}
          data-floor-seat-option={o.id}
          disabled={busy}
          onClick={() => setChoice(o.id)}
          className={cn(OPTION_CARD, active ? OPTION_CARD_ACTIVE : o.fits ? OPTION_CARD_IDLE : OPTION_CARD_OFF)}
        >
          <span
            aria-hidden
            className={cn(
              "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
              active ? "border-admin-brand bg-admin-brand text-admin-card" : "border-admin-border-strong bg-admin-card",
            )}
          >
            {active && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">{o.label}</span>
            <span className={cn("block text-[14px]", o.fits ? "text-admin-ink-muted" : "text-admin-coral-deep")}>{o.fits ? o.detail : s.noFit}</span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <PosSheet
      open={props.open}
      name="seat-party"
      title={title}
      subtitle={subtitle}
      closeLabel={copy.popover.close}
      onClose={props.onClose}
      footerStart={
        <>
          <button type="button" className={POS_SECONDARY_ACTION} disabled={busy} onClick={props.onClose}>
            {s.notHereYet}
          </button>
          {admissionId && (
            <button type="button" className={POS_DANGER_ACTION} disabled title={s.noShowReason}>
              {s.noShow}
            </button>
          )}
        </>
      }
      footerEnd={
        <button
          type="button"
          data-floor-seat-confirm
          className={POS_PRIMARY_ACTION}
          disabled={busy || !chosen}
          onClick={() => chosen && props.onSeat({ spaceId: chosen.spaceId, joinedSpaceId: chosen.joinedSpaceId, partySize: party, admissionId })}
        >
          {interpolate(s.confirm, { n: party, code })}
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        {assigned.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <p className={cn("m-0", FLOOR_EYEBROW)}>{s.assigned}</p>
            <ul role="radiogroup" aria-label={s.assigned} className="m-0 flex list-none flex-col gap-2.5 p-0">
              {assigned.map(option)}
            </ul>
          </section>
        )}
        <section className="flex flex-col gap-2.5">
          <p className={cn("m-0", FLOOR_EYEBROW)}>{s.alsoFits}</p>
          {others.length === 0 ? (
            <p className="m-0 text-[14px] text-admin-ink-muted">{s.noFit}</p>
          ) : (
            <ul role="radiogroup" aria-label={s.alsoFits} className="m-0 flex list-none flex-col gap-2.5 p-0">
              {others.map(option)}
            </ul>
          )}
        </section>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span id="floor-seat-guests" className={POS_LABEL}>
              {s.guestsHereNow}
            </span>
            <div className="flex h-[52px] items-stretch overflow-hidden rounded-[12px] border-[1.5px] border-admin-border bg-admin-card">
              <button type="button" aria-label={s.fewer} disabled={busy || party <= 1} onClick={() => setParty((n) => Math.max(1, n - 1))} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
                −
              </button>
              <output aria-labelledby="floor-seat-guests" data-floor-party className="flex flex-1 items-center justify-center gap-1.5 border-x border-admin-border text-[18px] font-semibold text-admin-ink">
                {party}
                {bookedFor ? <span className="text-[13px] font-normal text-admin-ink-muted">{interpolate(s.of, { n: bookedFor })}</span> : null}
              </output>
              <button type="button" aria-label={s.more} disabled={busy} onClick={() => setParty((n) => Math.min(200, n + 1))} className="w-[52px] text-[22px] text-admin-ink hover:bg-admin-surface-alt disabled:opacity-40">
                +
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="floor-seat-server" className={POS_LABEL}>
              {s.server}
            </label>
            <input id="floor-seat-server" className={POS_INPUT} disabled value={copy.list.serverNone} readOnly title={s.serverReason} aria-describedby="floor-seat-server-reason" />
            <p id="floor-seat-server-reason" className="m-0 mt-1 text-[12.5px] text-admin-ink-muted">
              {s.serverReason}
            </p>
          </div>
        </div>
        <p className={cn("m-0", POS_NOTE_INFO)}>
          <Check aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          {s.note}
        </p>
      </div>
    </PosSheet>
  );
}
