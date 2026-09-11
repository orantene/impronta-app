"use client";

/**
 * FloorViews — the three ways of looking at the room (`POSLiveFloor`,
 * `POSFloorTimeline`, `POSFloorList`): the map of tiles grouped by room, the
 * timeline of commitments per table, and the list. All three render the
 * SAME rows (`data.tables`, `data.book`) and select the same table; only the
 * geometry differs.
 */

import { ChevronRight } from "lucide-react";
import type { MouseEvent } from "react";

import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { venueHhmm } from "@/lib/spaces/venue-clock";
import type { FloorTable } from "@/lib/visits/floor";
import { cn } from "@/lib/utils";

import type { FloorBoardCopy } from "./floor-copy";
import {
  floorSummary,
  groupTables,
  nextBookingFor,
  seatedEntryFor,
  tableCode,
  tableLabel,
  tableTone,
  timelineRows,
  timelineTicks,
  type FloorTone,
} from "./floor-model";
import { BLOCK_TONE, FLOOR_EYEBROW, FLOOR_PILL, PILL_BILL_OPEN, PILL_TONE, SWATCH_TONE, TILE_TONE } from "./floor-tones";
import type { FloorBoardData } from "./floor-types";

export type SelectTable = (table: FloorTable, anchor: DOMRect | null) => void;

type ViewProps = {
  readonly data: FloorBoardData;
  readonly copy: FloorBoardCopy;
  readonly selectedId: string | null;
  readonly onSelect: SelectTable;
  readonly busy: boolean;
};

/** The one line under a tile's code, from the board's own vocabulary. */
export function tileLine(table: FloorTable, data: FloorBoardData, copy: FloorBoardCopy): string {
  const t = copy.tile;
  if (table.blocked && table.state !== "occupied") return t.blocked;
  if (table.state === "occupied") {
    const entry = seatedEntryFor(table, data.book);
    const n = table.partySize ?? entry?.partySize ?? null;
    const min = table.elapsedMinutes ?? 0;
    // A visit opened without a party size (an old tab) says only how long.
    const base = entry?.holderName
      ? interpolate(t.seatedNamed, { name: entry.holderName, n: n ?? "", min }).replace("  ", " ")
      : n == null
        ? interpolate(copy.list.minutes, { n: min })
        : interpolate(t.seated, { n, min });
    return table.overdue ? `${base} · ${t.late}` : base;
  }
  if (table.state === "held" && table.held) {
    return table.held.holderName
      ? interpolate(t.held, {
          name: table.held.holderName,
          n: table.held.partySize,
          time: venueHhmm(table.held.startsAtIso, data.timeZone, data.locale),
        })
      : interpolate(t.heldUnnamed, { n: table.held.partySize });
  }
  if (table.needsResetSinceIso) return t.needsReset;
  return interpolate(t.free, { n: table.partyMax });
}

export function moneyFor(table: FloorTable, data: FloorBoardData): string {
  return formatOrderMoney(table.orderTotalCents, table.orderId ? (data.currencies[table.orderId] ?? "USD") : "USD");
}

function anchorOf(event: MouseEvent<HTMLElement>): DOMRect {
  return event.currentTarget.getBoundingClientRect();
}

/** The six-swatch legend the map carries above itself. */
export function FloorLegend({ copy }: { copy: FloorBoardCopy }) {
  const items: Array<[FloorTone, string]> = [
    ["free", copy.legend.free],
    ["arriving", copy.legend.arriving],
    ["held", copy.legend.held],
    ["seated", copy.legend.seated],
    ["reset", copy.legend.needsReset],
    ["blocked", copy.legend.blocked],
  ];
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-3.5 p-0 text-[13px] font-medium text-admin-ink-muted">
      {items.map(([tone, label]) => (
        <li key={tone} className="flex items-center gap-1.5">
          <i aria-hidden className={cn("inline-block h-3.5 w-3.5 rounded-[4px] border border-admin-border", SWATCH_TONE[tone])} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function FloorTiles({ data, copy, selectedId, onSelect, busy }: ViewProps) {
  const groups = groupTables(data.tables, copy.groups);
  const overrun = data.tables.find((t) => t.state === "occupied" && t.overdue && !t.joinedFromSpaceId) ?? null;
  if (data.tables.length === 0) {
    return <p className="m-0 p-6 text-[15px] text-admin-ink-muted">{copy.emptyFloor}</p>;
  }
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto">
      <div className="flex min-w-0 flex-1 flex-col gap-5 rounded-[6px] border-2 border-admin-border-strong bg-admin-card p-4">
        {groups.map((group) => (
          <section key={group.id} data-floor-group={group.label} className="flex flex-col gap-3">
            <p className={cn("m-0", FLOOR_EYEBROW)}>{group.label}</p>
            <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0">
              {group.tables.map((table) => {
                const tone = tableTone(table);
                const code = tableCode(table);
                const active = selectedId === table.spaceId;
                const booth = table.kind === "booth" || table.kind === "cabana" || Boolean(table.joinedWithSpaceId);
                return (
                  <li key={table.spaceId} data-floor-table={code} data-floor-state={table.state} data-floor-tone={tone}>
                    <button
                      type="button"
                      aria-pressed={active}
                      disabled={busy}
                      onClick={(event) => onSelect(table, anchorOf(event))}
                      className={cn(
                        "flex h-[72px] flex-col items-center justify-center gap-0.5 rounded-[14px] border-2 px-2 text-center text-[15px] font-bold leading-[1.25] transition-shadow disabled:opacity-60",
                        booth ? "min-w-[130px]" : "min-w-[96px]",
                        TILE_TONE[tone],
                        active && "ring-2 ring-admin-brand ring-offset-2 ring-offset-admin-card",
                      )}
                    >
                      <span>{tableLabel(table, data.tables)}</span>
                      <span className="text-[12.5px] font-semibold opacity-85">{tileLine(table, data, copy)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {overrun && (
        <aside
          data-floor-overrun
          className="hidden w-[170px] shrink-0 self-start rounded-[12px] border-[1.5px] border-admin-coral bg-admin-card px-3 py-2.5 text-[13px] leading-[1.35] xl:block"
        >
          <p className="m-0 font-bold text-admin-coral-deep">
            {interpolate(copy.overrun, {
              code: tableCode(overrun),
              n: Math.max(0, (overrun.elapsedMinutes ?? 0) - (overrun.turnMinutes ?? 0)),
            })}
          </p>
          <p className="m-0 mt-0.5 text-admin-ink-muted">{copy.overrunHint}</p>
        </aside>
      )}
    </div>
  );
}

export function FloorTimeline({ data, copy, selectedId, onSelect }: ViewProps) {
  const nowMs = Date.parse(data.nowIso);
  const span = data.service
    ? { start: Date.parse(data.service.startsAtIso), end: Date.parse(data.service.endsAtIso) }
    : { start: nowMs - 2 * 3_600_000, end: nowMs + 4 * 3_600_000 };
  // Half-hour ticks read on a dinner service; a ten-hour day gets the hour.
  const ticks = timelineTicks(span.start, span.end, span.end - span.start > 5 * 3_600_000 ? 60 : 30);
  const rows = timelineRows({
    tables: data.tables,
    book: data.book,
    spanStartMs: span.start,
    spanEndMs: span.end,
    nowMs,
    defaultTurnMinutes: data.defaultTurnMinutes,
    words: {
      seated: copy.timeline.seated,
      over: copy.timeline.over,
      reset: copy.timeline.reset,
      walkIn: copy.panel.walkIn,
      bookedTo: (n, iso) => interpolate(copy.timeline.bookedTo, { n, time: venueHhmm(iso, data.timeZone, data.locale) }),
      held: (name, n, iso) => `${name} · ${n} · ${venueHhmm(iso, data.timeZone, data.locale)}`,
    },
  });
  const nowFraction = Math.min(1, Math.max(0, (nowMs - span.start) / Math.max(1, span.end - span.start)));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card">
        <div className="relative grid grid-cols-[120px_1fr] border-b border-admin-border-soft">
          <span />
          <div className="relative h-9">
            {ticks.map((tick) => (
              <span
                key={tick.at}
                className="absolute top-2.5 -translate-x-1/2 text-[13px] tabular-nums text-admin-ink-muted"
                style={{ left: `${tick.fraction * 100}%` }}
              >
                {venueHhmm(new Date(tick.at).toISOString(), data.timeZone, data.locale)}
              </span>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="m-0 p-6 text-[15px] text-admin-ink-muted">{copy.timeline.empty}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.table.spaceId}
              data-floor-timeline-row={tableCode(row.table)}
              className="grid min-h-[45px] grid-cols-[120px_1fr] border-b border-admin-border-soft last:border-b-0"
            >
              <button
                type="button"
                aria-pressed={selectedId === row.table.spaceId}
                onClick={(event) => onSelect(row.table, anchorOf(event))}
                className="flex items-center px-4 text-left text-[15px] font-bold text-admin-ink hover:bg-admin-surface-alt"
              >
                {row.label}
              </button>
              <div className="relative">
                {ticks.map((tick) => (
                  <i key={tick.at} aria-hidden className="absolute inset-y-0 w-px bg-admin-border-soft" style={{ left: `${tick.fraction * 100}%` }} />
                ))}
                {row.blocks.map((block) => (
                  <span
                    key={block.id}
                    className={cn(
                      "absolute top-1.5 flex h-[30px] items-center overflow-hidden whitespace-nowrap rounded-[8px] border px-2.5 text-[13.5px] font-semibold",
                      BLOCK_TONE[block.tone],
                    )}
                    style={{ left: `${block.start * 100}%`, width: `${Math.max(2, (block.end - block.start) * 100)}%` }}
                  >
                    {block.label}
                  </span>
                ))}
                <i aria-hidden data-floor-now className="absolute inset-y-0 w-0.5 bg-admin-brand" style={{ left: `${nowFraction * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </div>
      <p className="m-0 text-[14px] text-admin-ink-muted">
        {interpolate(copy.timeline.footer, { time: venueHhmm(data.nowIso, data.timeZone, data.locale) })}
      </p>
    </div>
  );
}

const LIST_COLS = "grid grid-cols-[110px_150px_minmax(0,1.2fr)_90px_110px_120px_130px_48px] items-center gap-3 px-[18px]";

function listState(table: FloorTable, copy: FloorBoardCopy): { label: string; tone: FloorTone | "bill" } {
  const l = copy.list;
  const tone = tableTone(table);
  switch (tone) {
    case "over":
      return { label: interpolate(l.stateOver, { n: Math.max(0, (table.elapsedMinutes ?? 0) - (table.turnMinutes ?? 0)) }), tone };
    case "seated":
      return { label: l.stateSeated, tone };
    case "arriving":
      return { label: l.stateArriving, tone };
    case "held":
      return { label: l.stateHeld, tone };
    case "reset":
      return { label: l.stateNeedsReset, tone };
    case "blocked":
      return { label: l.stateBlocked, tone };
    default:
      return { label: l.stateFree, tone };
  }
}

export function FloorList({ data, copy, selectedId, onSelect, ordersOnly }: ViewProps & { ordersOnly?: boolean }) {
  const nowMs = Date.parse(data.nowIso);
  const rows = data.tables.filter((t) => !t.joinedFromSpaceId && (!ordersOnly || (t.state === "occupied" && t.orderId)));
  const l = copy.list;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="rounded-[16px] border-[1.5px] border-admin-border bg-admin-card">
        <div className={cn(LIST_COLS, "py-2.5 text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted")}>
          <span>{l.table}</span>
          <span>{l.state}</span>
          <span>{l.party}</span>
          <span>{l.seated}</span>
          <span>{l.server}</span>
          <span>{l.unpaid}</span>
          <span>{l.next}</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <p className="m-0 border-t border-admin-border-soft p-6 text-[15px] text-admin-ink-muted">
            {ordersOnly ? copy.panel.emptySeated : copy.emptyFloor}
          </p>
        ) : (
          rows.map((table) => {
            const state = listState(table, copy);
            const entry = seatedEntryFor(table, data.book);
            const next = nextBookingFor(table, data.book, nowMs);
            const party =
              table.state === "occupied"
                ? [entry?.holderName, table.partySize ?? entry?.partySize].filter((x) => x != null && x !== "").join(" · ")
                : table.state === "held" && table.held
                  ? `${table.held.holderName ?? copy.panel.walkIn} · ${table.held.partySize}`
                  : "—";
            const seated =
              table.state === "occupied"
                ? interpolate(l.minutes, { n: table.elapsedMinutes ?? 0 })
                : table.state === "held" && table.held
                  ? venueHhmm(table.held.startsAtIso, data.timeZone, data.locale)
                  : "—";
            return (
              <div
                key={table.spaceId}
                data-floor-row={tableCode(table)}
                data-floor-state={table.state}
                className={cn(LIST_COLS, "border-t border-admin-border-soft py-3.5 text-[15px] text-admin-ink")}
              >
                <span className="font-bold">{tableLabel(table, data.tables)}</span>
                <span>
                  <span className={cn(FLOOR_PILL, state.tone === "bill" ? PILL_BILL_OPEN : PILL_TONE[state.tone])}>{state.label}</span>
                </span>
                <span className="truncate">{party}</span>
                <span className="tabular-nums">{seated}</span>
                <span className="text-admin-ink-muted">{l.serverNone}</span>
                <span className={cn("font-bold tabular-nums", !table.orderId && "text-admin-ink-muted")}>
                  {table.state === "occupied" && table.orderId ? moneyFor(table, data) : "—"}
                </span>
                <span className="truncate text-admin-ink-muted">
                  {next ? `${next.holderName ?? copy.panel.walkIn} ${venueHhmm(next.startsAtIso, data.timeZone, data.locale)}` : "—"}
                </span>
                <button
                  type="button"
                  aria-label={interpolate(l.open, { code: tableCode(table) })}
                  aria-pressed={selectedId === table.spaceId}
                  onClick={(event) => onSelect(table, anchorOf(event))}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-[11px] text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
                >
                  <ChevronRight aria-hidden size={18} strokeWidth={1.75} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** `Dinner 19:00–23:30 · 5 of 14 tables seated · 2 arriving · 3 waiting`. */
export function floorSubtitle(data: FloorBoardData, copy: FloorBoardCopy, waiting: number): string {
  const s = floorSummary(data.tables);
  const service = data.service
    ? interpolate(copy.service, {
        label: data.service.label,
        start: venueHhmm(data.service.startsAtIso, data.timeZone, data.locale),
        end: venueHhmm(data.service.endsAtIso, data.timeZone, data.locale),
      })
    : copy.serviceNone;
  return interpolate(copy.subtitle, { service, seated: s.seated, total: s.total, arriving: s.arriving, waiting });
}
