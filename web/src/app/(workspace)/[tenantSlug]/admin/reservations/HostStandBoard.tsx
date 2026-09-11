"use client";

/**
 * The host stand, as it is actually used: a phone at a door, in one hand.
 *
 * The four counters and the list must be readable one-thumbed. Rows are time,
 * name, party, table, state — anything else does not fit and does not matter at
 * 21:00 on a Saturday.
 *
 * EVERY DECISION IN HERE WAS MADE IN `lib/reservations/book.ts` AND TESTED
 * THERE. This renders. In particular it does not recompute a state, a covers
 * number or a lateness, because a second implementation of those would be free
 * to disagree with the one the tests cover.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { venueHhmm } from "@/lib/spaces/venue-clock";
import { reservationsSeatBooking, reservationsTakeWalkIn } from "./actions";

type BookState =
  | "booked" | "arriving" | "late" | "part_seated" | "seated" | "no_show" | "completed";

type Entry = {
  admissionId: string;
  startsAtIso: string;
  partySize: number;
  admittedCount: number;
  state: BookState;
  lateMinutes: number;
  isRefunded: boolean;
  isVoid: boolean;
  wasMarkedNoShow: boolean;
  holderName: string | null;
  spaceCode: string | null;
};

/** A table the desk may seat a party on, as the floor sees it. */
export type SeatableTable = {
  spaceId: string;
  label: string;
  partyMin: number;
  partyMax: number;
  /** True when a booking is already holding this table (the host may still override). */
  held: boolean;
};

export type HostStandCopy = {
  coversBooked: string;
  arrived: string;
  arrivingNow: string;
  runningLate: string;
  noTableYet: string;
  empty: string;
  colTime: string;
  colGuest: string;
  colParty: string;
  colTable: string;
  walkIn: string;
  wasNoShow: string;
  refunded: string;
  cancelled: string;
  stateBooked: string;
  stateArriving: string;
  stateLate: string;
  statePartSeated: string;
  stateSeated: string;
  stateNoShow: string;
  stateCompleted: string;
  seat: string;
  takeWalkIn: string;
  takeWalkInHeading: string;
  walkInNameLabel: string;
  walkInPartyLabel: string;
  walkInConfirm: string;
  seatHeading: string;
  seatCancel: string;
  noSeatableTable: string;
  seatedNotMarked: string;
  /** One sentence per refusal `reservationsSeatBooking` can answer with. */
  refusal: Record<string, string>;
};

type Props = {
  locale: string;
  copy: HostStandCopy;
  data: {
    venueName: string;
    timeZone: string;
    onDate: string;
    entries: Entry[];
    /** Free (or merely held) tables the desk can put a party on. */
    seatable: SeatableTable[];
    summary: {
      covers: number;
      arrived: number;
      arrivingNow: number;
      runningLate: number;
      unassigned: number;
    };
    windows: Array<{ key: string; startsAtIso: string; endsAtIso: string }>;
  };
};

const STATE_BADGE: Record<BookState, string> = {
  booked: "border-border bg-muted text-muted-foreground",
  arriving: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  late: "border-orange-700/40 bg-orange-600/10 text-orange-700 dark:text-orange-400",
  part_seated: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  seated: "border-emerald-700/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  no_show: "border-destructive/40 bg-destructive/10 text-destructive",
  completed: "border-border bg-muted text-muted-foreground",
};

function Counter({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="min-w-[96px] rounded-[10px] bg-muted px-3.5 py-3">
      <div className={`text-2xl font-semibold leading-tight tabular-nums ${tone ?? "text-foreground"}`}>{n}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/** A refusal code as a sentence. An unknown code reads generic, never raw. */
export function deskRefusalText(copy: HostStandCopy, code: string): string {
  return copy.refusal[code] ?? copy.refusal.unavailable;
}

/** States where a party has not yet been put on a table by this desk. */
const SEATABLE_STATES: ReadonlySet<BookState> = new Set<BookState>([
  "booked",
  "arriving",
  "late",
  "no_show",
]);

export function HostStandBoard({ locale, copy, data }: Props) {
  const { summary, entries, timeZone, seatable } = data;
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [seatFor, setSeatFor] = React.useState<string | null>(null);
  const [walkInOpen, setWalkInOpen] = React.useState(false);
  const [walkInName, setWalkInName] = React.useState("");
  const [walkInParty, setWalkInParty] = React.useState("2");

  /**
   * Run one of the desk's writes and ALWAYS hand the screen back.
   *
   * A server action that crashes (the request itself failing, not a refusal
   * it chose to return) rejects the promise. Seen on the QA host: the tap
   * left "Add a walk-in" greyed out for good and said nothing, because
   * `setBusy(false)` sat after the await and never ran. A crash is a refusal
   * the host has to be told about in words, like every other one.
   */
  async function attempt<T extends { ok: boolean }>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setMsg(null);
    try {
      return await fn();
    } catch {
      setMsg(deskRefusalText(copy, "unavailable"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function takeWalkIn() {
    const r = await attempt(() =>
      reservationsTakeWalkIn({
        holderName: walkInName.trim(),
        partySize: Math.max(1, Math.trunc(Number(walkInParty) || 0)),
      }),
    );
    if (r === null) return;
    if (!r.ok) {
      setMsg(deskRefusalText(copy, r.reason));
      return;
    }
    setWalkInOpen(false);
    setWalkInName("");
    router.refresh();
  }

  async function seat(entry: Entry, spaceId: string) {
    const r = await attempt(() =>
      reservationsSeatBooking({
        admissionId: entry.admissionId,
        spaceId,
        // The whole party. `check_in` refuses anything past the remainder, and a
        // part-seated arrival is the door's business, not this one tap's.
        partySize: entry.partySize,
      }),
    );
    if (r === null) return;
    if (!r.ok) {
      setMsg(deskRefusalText(copy, r.reason));
      return;
    }
    setSeatFor(null);
    if (r.reservationWarning) {
      setMsg(`${copy.seatedNotMarked} ${deskRefusalText(copy, r.reservationWarning)}`);
    }
    router.refresh();
  }

  const stateLabel: Record<BookState, string> = {
    booked: copy.stateBooked,
    arriving: copy.stateArriving,
    late: copy.stateLate,
    part_seated: copy.statePartSeated,
    seated: copy.stateSeated,
    no_show: copy.stateNoShow,
    completed: copy.stateCompleted,
  };

  return (
    <div className="mt-2">
      {msg ? (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {msg}
        </p>
      ) : null}
      <div className="mb-3">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
          onClick={() => {
            setWalkInOpen((open) => !open);
            setMsg(null);
          }}
        >
          {copy.takeWalkIn}
        </button>
        {walkInOpen ? (
          <div className="mt-2 max-w-[520px] rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">{copy.takeWalkInHeading}</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {copy.walkInNameLabel}
                <input
                  type="text"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  className="h-11 w-52 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {copy.walkInPartyLabel}
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={walkInParty}
                  onChange={(e) => setWalkInParty(e.target.value)}
                  className="h-11 w-20 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                disabled={busy || walkInName.trim().length === 0}
                className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
                onClick={() => void takeWalkIn()}
              >
                {copy.walkInConfirm}
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => setWalkInOpen(false)}
              >
                {copy.seatCancel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <p className="mb-[18px] text-[13.5px] text-muted-foreground">
        {data.venueName} &middot; {data.onDate}
        {data.windows.length > 0 ? (
          <>
            {" "}
            &middot;{" "}
            {data.windows
              .map((w) => `${w.key} ${venueHhmm(w.startsAtIso, timeZone, locale)} to ${venueHhmm(w.endsAtIso, timeZone, locale)}`)
              .join(" · ")}
          </>
        ) : null}
      </p>

      {/* Covers and arrived are TWO numbers on purpose. Party size alone counts
          no-shows as diners; admitted_count alone reports an empty room at
          18:00. A restaurant wants the first before service and the second
          after it. */}
      <div className="mb-[22px] flex flex-wrap gap-2">
        <Counter n={summary.covers} label={copy.coversBooked} />
        <Counter n={summary.arrived} label={copy.arrived} tone="text-emerald-700 dark:text-emerald-400" />
        <Counter n={summary.arrivingNow} label={copy.arrivingNow} tone="text-amber-700 dark:text-amber-400" />
        <Counter n={summary.runningLate} label={copy.runningLate} tone="text-orange-700 dark:text-orange-400" />
        <Counter n={summary.unassigned} label={copy.noTableYet} />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr>
                {[copy.colTime, copy.colGuest, copy.colParty, copy.colTable, ""].map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-border py-0 pb-2 pr-3 text-left text-[11px] font-medium uppercase tracking-[.08em] text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <React.Fragment key={e.admissionId}>
                <tr>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-sm tabular-nums text-foreground">
                    {venueHhmm(e.startsAtIso, timeZone, locale)}
                  </td>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-sm text-foreground">
                    {e.holderName ?? <span className="text-muted-foreground">{copy.walkIn}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-sm tabular-nums text-foreground">
                    {/* Part-seated shows both numbers, because "2 of 4" is the
                        fact a host needs and "4" is a lie until the rest arrive. */}
                    {e.admittedCount > 0 && e.admittedCount < e.partySize
                      ? `${e.admittedCount} of ${e.partySize}`
                      : e.partySize}
                  </td>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-sm tabular-nums text-foreground">
                    {e.spaceCode ?? <span className="text-muted-foreground">&mdash;</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-right text-sm">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_BADGE[e.state]}`}
                    >
                      {stateLabel[e.state]}
                      {e.state === "late" && e.lateMinutes > 0 ? ` ${e.lateMinutes}m` : ""}
                    </span>
                    {/* Commercial state and the no-show history render BESIDE
                        the state, never folded into it. "Seated, then refunded"
                        is a real sentence about one reservation, and a guest who
                        was marked a no-show and then arrived may already have a
                        fee on their bill — this is the only place a human can
                        explain it. */}
                    {e.wasMarkedNoShow ? (
                      <span
                        className={`ml-1.5 inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_BADGE.no_show}`}
                      >
                        {copy.wasNoShow}
                      </span>
                    ) : null}
                    {e.isRefunded ? (
                      <span className="ml-1.5 inline-block whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {copy.refunded}
                      </span>
                    ) : null}
                    {e.isVoid ? (
                      <span className="ml-1.5 inline-block whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {copy.cancelled}
                      </span>
                    ) : null}
                    {/* SEAT. Offered for a party nobody has put on a table yet
                        — including one already stamped a no-show, because a
                        guest who was written off and then walked in is the
                        case the whole no-show/arrival split exists for. A
                        cancelled or refunded booking is not offered a table. */}
                    {SEATABLE_STATES.has(e.state) && !e.isVoid && !e.isRefunded ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="ml-1.5 min-h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
                        onClick={() => {
                          setSeatFor(seatFor === e.admissionId ? null : e.admissionId);
                          setMsg(null);
                        }}
                      >
                        {copy.seat}
                      </button>
                    ) : null}
                  </td>
                </tr>
                {seatFor === e.admissionId ? (
                  <tr>
                    <td colSpan={5} className="border-b border-border px-0 py-2">
                      <div className="rounded-lg border border-border bg-muted/40 p-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.seatHeading}</p>
                        {(() => {
                          // The same fit rule the floor uses, applied before a
                          // table is even offered: a host should not have to
                          // tap a deuce to be told a party of six will not fit.
                          const fits = seatable.filter(
                            (t) => e.partySize >= t.partyMin && e.partySize <= t.partyMax,
                          );
                          if (fits.length === 0) {
                            return <p className="text-xs text-muted-foreground">{copy.noSeatableTable}</p>;
                          }
                          return (
                            <div className="flex flex-wrap gap-2">
                              {fits.map((t) => (
                                <button
                                  key={t.spaceId}
                                  type="button"
                                  disabled={busy}
                                  className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground hover:bg-accent disabled:opacity-40"
                                  onClick={() => void seat(e, t.spaceId)}
                                >
                                  {t.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-accent"
                                onClick={() => setSeatFor(null)}
                              >
                                {copy.seatCancel}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
