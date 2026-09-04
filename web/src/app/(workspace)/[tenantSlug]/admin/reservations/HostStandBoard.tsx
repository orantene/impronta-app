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

type Props = {
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

const C = {
  ink: "#0B0B0D",
  muted: "rgba(11,11,13,0.55)",
  dim: "rgba(11,11,13,0.35)",
  line: "rgba(24,24,27,0.10)",
  soft: "rgba(24,24,27,0.05)",
  card: "#ffffff",
  seated: "#0F4F3E",
  seatedBg: "rgba(15,79,62,0.08)",
  arriving: "#8A6A00",
  arrivingBg: "rgba(138,106,0,0.10)",
  late: "#A8471B",
  lateBg: "rgba(168,71,27,0.10)",
  gone: "#7A2E2E",
  goneBg: "rgba(122,46,46,0.10)",
} as const;

const STATE_LABEL: Record<BookState, string> = {
  booked: "Booked",
  arriving: "Arriving",
  late: "Late",
  part_seated: "Part seated",
  seated: "Seated",
  no_show: "No-show",
  completed: "Done",
};

const STATE_STYLE: Record<BookState, React.CSSProperties> = {
  booked: { background: C.soft, color: C.muted },
  arriving: { background: C.arrivingBg, color: C.arriving },
  late: { background: C.lateBg, color: C.late },
  part_seated: { background: C.arrivingBg, color: C.arriving },
  seated: { background: C.seatedBg, color: C.seated },
  no_show: { background: C.goneBg, color: C.gone },
  completed: { background: C.soft, color: C.dim },
};

function hhmm(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
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
    <div style={{ background: C.soft, padding: "12px 14px", borderRadius: 10, minWidth: 96 }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: tone ?? C.ink,
          lineHeight: 1.1,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function HostStandBoard({ data }: Props) {
  const { summary, entries, timeZone } = data;

  return (
    <div style={{ marginTop: 8 }}>
      <p style={{ color: C.muted, fontSize: 13.5, margin: "0 0 18px" }}>
        {data.venueName} &middot; {data.onDate}
        {data.windows.length > 0 ? (
          <>
            {" "}
            &middot;{" "}
            {data.windows
              .map((w) => `${w.key} ${hhmm(w.startsAtIso, timeZone)} to ${hhmm(w.endsAtIso, timeZone)}`)
              .join(" · ")}
          </>
        ) : null}
      </p>

      {/* Covers and arrived are TWO numbers on purpose. Party size alone counts
          no-shows as diners; admitted_count alone reports an empty room at
          18:00. A restaurant wants the first before service and the second
          after it. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
        <Counter n={summary.covers} label="covers booked" />
        <Counter n={summary.arrived} label="arrived" tone={C.seated} />
        <Counter n={summary.arrivingNow} label="arriving now" tone={C.arriving} />
        <Counter n={summary.runningLate} label="running late" tone={C.late} />
        <Counter n={summary.unassigned} label="no table yet" />
      </div>

      {entries.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 14 }}>
          Nobody is booked for this service yet.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <thead>
              <tr>
                {["Time", "Guest", "Party", "Table", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: C.dim,
                      fontWeight: 500,
                      padding: "0 12px 8px 0",
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.admissionId}>
                  <td style={cell(true)}>{hhmm(e.startsAtIso, timeZone)}</td>
                  <td style={cell()}>
                    {e.holderName ?? <span style={{ color: C.dim }}>Walk-in</span>}
                  </td>
                  <td style={cell(true)}>
                    {/* Part-seated shows both numbers, because "2 of 4" is the
                        fact a host needs and "4" is a lie until the rest arrive. */}
                    {e.admittedCount > 0 && e.admittedCount < e.partySize
                      ? `${e.admittedCount} of ${e.partySize}`
                      : e.partySize}
                  </td>
                  <td style={cell(true)}>
                    {e.spaceCode ?? <span style={{ color: C.dim }}>&mdash;</span>}
                  </td>
                  <td style={{ ...cell(), textAlign: "right" }}>
                    <span style={{ ...badge, ...STATE_STYLE[e.state] }}>
                      {STATE_LABEL[e.state]}
                      {e.state === "late" && e.lateMinutes > 0 ? ` ${e.lateMinutes}m` : ""}
                    </span>
                    {/* Commercial state and the no-show history render BESIDE
                        the state, never folded into it. "Seated, then refunded"
                        is a real sentence, and a guest who was marked a no-show
                        and then arrived may already have a fee on their bill —
                        this is the only place a human can explain it. */}
                    {e.wasMarkedNoShow ? (
                      <span style={{ ...badge, ...STATE_STYLE.no_show, marginLeft: 6 }}>
                        was no-show
                      </span>
                    ) : null}
                    {e.isRefunded ? (
                      <span style={{ ...badge, background: C.soft, color: C.muted, marginLeft: 6 }}>
                        refunded
                      </span>
                    ) : null}
                    {e.isVoid ? (
                      <span style={{ ...badge, background: C.soft, color: C.muted, marginLeft: 6 }}>
                        cancelled
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

function cell(numeric = false): React.CSSProperties {
  return {
    padding: "11px 12px 11px 0",
    borderBottom: `1px solid ${C.soft}`,
    fontSize: 14,
    color: C.ink,
    fontVariantNumeric: numeric ? "tabular-nums" : "normal",
    whiteSpace: "nowrap",
  };
}

const badge: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 8px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};
