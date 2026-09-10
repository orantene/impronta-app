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
};

type Props = {
  locale: string;
  copy: HostStandCopy;
  data: {
    venueName: string;
    timeZone: string;
    onDate: string;
    entries: Entry[];
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

function hhmm(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
}

function Counter({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="min-w-[96px] rounded-[10px] bg-muted px-3.5 py-3">
      <div className={`text-2xl font-semibold leading-tight tabular-nums ${tone ?? "text-foreground"}`}>{n}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function HostStandBoard({ locale, copy, data }: Props) {
  const { summary, entries, timeZone } = data;

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
      <p className="mb-[18px] text-[13.5px] text-muted-foreground">
        {data.venueName} &middot; {data.onDate}
        {data.windows.length > 0 ? (
          <>
            {" "}
            &middot;{" "}
            {data.windows
              .map((w) => `${w.key} ${hhmm(w.startsAtIso, timeZone, locale)} to ${hhmm(w.endsAtIso, timeZone, locale)}`)
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
                <tr key={e.admissionId}>
                  <td className="whitespace-nowrap border-b border-border py-[11px] pr-3 text-sm tabular-nums text-foreground">
                    {hhmm(e.startsAtIso, timeZone, locale)}
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
