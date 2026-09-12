"use client";

/**
 * FloorSidePanel — the 320px column on the left of the map (`POSLiveFloor`):
 * `Arriving N · Waiting N · Seated N`, one row per party with its time, its
 * name and size, one line of detail, and a state pill. Arriving and Waiting
 * are tonight's book (`data.book`); Seated is the occupied tables, because a
 * walk-in seated straight onto a table has no booking row.
 */

import { interpolate } from "@/i18n/interpolate";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";
import { POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK } from "../pos/pos-classes";

import type { FloorBoardCopy } from "./floor-copy";
import { arrivingEntries, bookName, isWaiting, seatedEntryFor, seatedTables, tableCode, tableLabel, type FloorBookEntry } from "./floor-model";
import { FLOOR_PILL, PILL_CONFIRMED, PILL_LATE, PILL_SEATED, PILL_WAITING } from "./floor-tones";
import type { FloorBoardData, FloorWaitlistEntry } from "./floor-types";
import { moneyFor } from "./FloorViews";

export type PanelTab = "arriving" | "waiting" | "seated";

export type FloorSidePanelProps = {
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly tab: PanelTab;
  readonly onTabChange: (tab: PanelTab) => void;
  /** A booking row: seat it (Arriving) or offer it a table (Waiting). */
  readonly onPickEntry: (entry: FloorBookEntry) => void;
  readonly onPickWaitlist: (entry: FloorWaitlistEntry) => void;
  /** A seated row: open that table. */
  readonly onPickTable: (table: FloorTable) => void;
  readonly selectedId: string | null;
  readonly className?: string;
};

const ROW =
  "flex w-full items-center gap-2.5 border-t border-admin-border-soft px-3.5 py-3 text-left transition-colors hover:bg-admin-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand";

export function panelCounts(data: FloorBoardData): Record<PanelTab, number> {
  return {
    arriving: arrivingEntries(data.book).length,
    waiting: data.partyWaitlist.length,
    seated: seatedTables(data.tables).length,
  };
}

export function FloorSidePanel({ data, copy, tab, onTabChange, onPickEntry, onPickWaitlist, onPickTable, selectedId, className }: FloorSidePanelProps) {
  const nowMs = Date.parse(data.nowIso);
  const counts = panelCounts(data);
  const p = copy.panel;
  const tabs: Array<[PanelTab, string]> = [
    ["arriving", p.arriving],
    ["waiting", p.waiting],
    ["seated", p.seated],
  ];

  function entryRow(entry: FloorBookEntry) {
    const waiting = isWaiting(entry);
    const late = entry.state === "late";
    const detail = waiting
      ? interpolate(p.waitingFor, { n: Math.max(0, Math.round((nowMs - Date.parse(entry.startsAtIso)) / 60_000)) })
      : entry.spaceCode
        ? interpolate(p.table, { code: entry.spaceCode })
        : p.noTableYet;
    const pill = waiting
      ? { label: p.stateWaiting, tone: PILL_WAITING }
      : late
        ? { label: interpolate(p.late, { n: entry.lateMinutes }), tone: PILL_LATE }
        : entry.state === "arriving"
          ? { label: p.stateArriving, tone: PILL_CONFIRMED }
          : { label: p.stateConfirmed, tone: PILL_CONFIRMED };
    return (
      <li key={entry.admissionId}>
        <button type="button" data-floor-party={entry.admissionId} className={ROW} onClick={() => onPickEntry(entry)}>
          <span className="w-11 shrink-0 text-[14px] tabular-nums text-admin-ink-muted">
            {venueHhmm(entry.startsAtIso, data.timeZone, data.locale)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-admin-ink">
              {bookName(entry, p.walkIn)} · {entry.partySize}
            </span>
            <span className="block truncate text-[13.5px] text-admin-ink-muted">{detail}</span>
          </span>
          <span className={cn(FLOOR_PILL, pill.tone)}>{pill.label}</span>
        </button>
      </li>
    );
  }

  function seatedRow(table: FloorTable) {
    const entry = seatedEntryFor(table, data.book);
    const name = entry?.holderName ?? p.walkIn;
    const n = table.partySize ?? entry?.partySize ?? 0;
    const line = interpolate(p.seatedLine, {
      n: table.elapsedMinutes ?? 0,
      amount: table.orderId ? moneyFor(table, data) : copy.tile.noCheck,
    });
    return (
      <li key={table.spaceId}>
        <button
          type="button"
          data-floor-seated={tableCode(table)}
          aria-pressed={selectedId === table.spaceId}
          className={cn(ROW, selectedId === table.spaceId && "bg-admin-surface-alt")}
          onClick={() => onPickTable(table)}
        >
          <span className="w-11 shrink-0 text-[14px] font-bold text-admin-ink">{tableLabel(table, data.tables)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-admin-ink">
              {name} · {n}
            </span>
            <span className="block truncate text-[13.5px] text-admin-ink-muted">{line}</span>
          </span>
          <span className={cn(FLOOR_PILL, PILL_SEATED)}>{p.stateSeated}</span>
        </button>
      </li>
    );
  }

  function waitlistRow(entry: FloorWaitlistEntry) {
    return (
      <li key={entry.id}>
        <button type="button" data-floor-waiting={entry.id} className={ROW} onClick={() => onPickWaitlist(entry)}>
          <span className="w-11 shrink-0 text-[14px] tabular-nums text-admin-ink-muted">
            {venueHhmm(entry.joinedAtIso, data.timeZone, data.locale)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-admin-ink">
              {entry.holderName || p.walkIn} · {entry.partySize}
            </span>
            <span className="block truncate text-[13.5px] text-admin-ink-muted">
              {interpolate(p.waitingFor, { n: Math.max(0, Math.round((nowMs - Date.parse(entry.joinedAtIso)) / 60_000)) })}
            </span>
          </span>
          <span className={cn(FLOOR_PILL, PILL_WAITING)}>{p.stateWaiting}</span>
        </button>
      </li>
    );
  }

  const arriving = arrivingEntries(data.book);
  const seated = seatedTables(data.tables);
  const empty =
    tab === "arriving" ? p.emptyArriving : tab === "waiting" ? p.emptyWaiting : p.emptySeated;
  const rows =
    tab === "arriving" ? arriving.map(entryRow) : tab === "waiting" ? data.partyWaitlist.map(waitlistRow) : seated.map(seatedRow);

  return (
    <aside data-floor-panel={tab} className={cn("flex min-h-0 w-[320px] shrink-0 flex-col border-r border-admin-border bg-admin-card", className)}>
      <div className="px-3.5 pb-2 pt-3.5">
        <div role="tablist" className={POS_SEGMENT_TRACK}>
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => onTabChange(id)}
              className={cn(POS_SEGMENT, "px-4", tab === id ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}
            >
              {label} {counts[id]}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="m-0 border-t border-admin-border-soft px-3.5 py-4 text-[14px] text-admin-ink-muted">{empty}</p>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">{rows}</ul>
      )}
    </aside>
  );
}
