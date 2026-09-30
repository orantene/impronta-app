"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import {
  blocksTime,
  freeGaps,
  occupiedInterval,
} from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import { windowsForDate } from "@/lib/scheduling/hours-types";
import type { TradeCalendarRule } from "@/lib/talent-agenda/trade-calendar";
import { overnightLabel } from "@/lib/talent-agenda/overnight";
import { AgendaRow } from "./primitives";
import { focusMinutes } from "./calendar-focus";
import { itemsOnDay, rowFromAgendaItem, weekChipKind } from "./present";
import { placeLabelFor } from "./record-actions";
import {
  chipTag,
  durationText,
  isHold,
  isRecord,
  isRequest,
  layoutLanes,
  monthCells,
  serviceLabel,
  requestOverlap,
  stripDots,
  timeRange,
} from "./calendar-view";
import { useAgendaCopy } from "./use-agenda-copy";

const PX_PER_MIN = 1.1;
const DEFAULT_OPEN = 10 * 60;
const DEFAULT_CLOSE = 19 * 60;

const MUTED = "text-[rgba(11,11,13,0.62)]";
const NOW_LINE = "rgba(196,53,45,1)";
const HATCH = "bg-[repeating-linear-gradient(135deg,rgba(11,11,13,0.08)_0_3px,transparent_3px_6px)]";

/**
 * AUD-037: the shell's BottomActionFab (admin-shell-client.tsx) is fixed at
 * right:16 and 52px wide. The week grid reserves that width plus a gap on its
 * right edge so the FAB never covers the last day column's event text.
 */
export const SHELL_FAB_RIGHT_PX = 16;
export const SHELL_FAB_SIZE_PX = 52;
export const SHELL_FAB_GAP_PX = 12;
export const SHELL_FAB_CLEARANCE_PX = SHELL_FAB_RIGHT_PX + SHELL_FAB_SIZE_PX + SHELL_FAB_GAP_PX;

export function localYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return localYmd(a) === localYmd(b);
}

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function hm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function dayWindows(hours: BookingHours | null | undefined, day: Date) {
  if (!hours) return [{ startMin: DEFAULT_OPEN, endMin: DEFAULT_CLOSE }];
  return windowsForDate(hours, localYmd(day), day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

/**
 * Visible hour range: working hours plus one hour of outside-hours band on
 * each side (mockup tc_cal), stretched so the now-line is always on screen
 * when today is in view.
 */
export function gridBounds(hours: BookingHours | null | undefined, days: Date[], clock?: Date) {
  let start = DEFAULT_OPEN;
  let end = DEFAULT_CLOSE;
  for (const day of days) {
    for (const win of dayWindows(hours, day)) {
      start = Math.min(start, win.startMin);
      end = Math.max(end, win.endMin);
    }
  }
  start = Math.max(0, Math.floor((start - 60) / 60) * 60);
  end = Math.min(24 * 60, Math.ceil((end + 60) / 60) * 60);
  if (clock && days.some((day) => sameDay(day, clock))) {
    const now = minutesOf(clock);
    start = Math.min(start, Math.max(0, Math.floor((now - 30) / 60) * 60));
    end = Math.max(end, Math.min(24 * 60, Math.ceil((now + 30) / 60) * 60));
  }
  return { startMin: start, endMin: Math.max(end, start + 60) };
}

/** Word + icon for a chip. Colour is never the only signal. */
function ChipTag({ item }: { item: TalentAgendaItem }) {
  const copy = useAgendaCopy();
  const tag = chipTag(item);
  if (tag.key === "agency job") {
    return <>{`${tag.icon} ${tag.suffix} · ${copy.t("agency job")}`}</>;
  }
  return <>{`${tag.icon ? `${tag.icon} ` : ""}${copy.t(tag.key)}${tag.suffix ? ` ${tag.suffix}` : ""}`}</>;
}

function chipClass(item: TalentAgendaItem, kind: ReturnType<typeof weekChipKind>): string {
  if (item.kind === "block") return `border-[rgba(11,11,13,0.10)] ${HATCH}`;
  if (kind === "done") return "border-[rgba(11,11,13,0.08)] bg-[rgba(11,11,13,0.06)] text-[rgba(11,11,13,0.62)]";
  if (kind === "request") return "border-dashed border-[rgba(59,76,202,0.4)] bg-white";
  if (kind === "hold") return "border-dashed border-[rgba(138,90,17,0.5)] bg-[rgba(138,90,17,0.08)]";
  if (item.managedBy) return "border-[rgba(11,11,13,0.12)] border-l-4 border-l-[var(--tc-primary)] bg-white";
  return "border-[rgba(11,11,13,0.12)] border-l-4 border-l-[var(--tc-accent)] bg-white";
}

/** One timed column (shared by week and day). */
function TimeColumn({
  day,
  items,
  clock,
  hours,
  bounds,
  tradeRules,
  onOpen,
  onGap,
  wide = false,
}: {
  day: Date;
  items: TalentAgendaItem[];
  clock: Date;
  hours?: BookingHours | null;
  bounds: { startMin: number; endMin: number };
  tradeRules?: TradeCalendarRule | null;
  onOpen: (item: TalentAgendaItem, event?: MouseEvent<HTMLElement>) => void;
  onGap: (day: Date, startsAt?: Date) => void;
  wide?: boolean;
}) {
  const copy = useAgendaCopy();
  const height = (bounds.endMin - bounds.startMin) * PX_PER_MIN;
  const wins = dayWindows(hours, day);
  const dayItems = itemsOnDay(items, day);
  const gaps = freeGaps(day, dayItems, wins.length ? { windows: wins } : null, clock);
  const showNow = sameDay(day, clock);
  const nowTop = (minutesOf(clock) - bounds.startMin) * PX_PER_MIN;
  const timed = dayItems.filter((item) => weekChipKind(item, tradeRules) !== "allDay");
  const geometry = new Map(
    timed.map((item) => {
      const occ = occupiedInterval(item);
      const top = Math.max(0, (minutesOf(occ.startsAt) - bounds.startMin) * PX_PER_MIN);
      const h = Math.max(24, (minutesOf(occ.endsAt) - minutesOf(occ.startsAt)) * PX_PER_MIN);
      return [item.id, { top, h }] as const;
    }),
  );
  const lanes = layoutLanes(
    timed.map((item) => {
      const g = geometry.get(item.id) ?? { top: 0, h: 24 };
      return { id: item.id, top: g.top, bottom: g.top + g.h };
    }),
  );
  return (
    <div
      className="relative h-[var(--agenda-h)] rounded-lg border border-[rgba(11,11,13,0.08)] bg-[rgba(11,11,13,0.04)]"
      style={{ "--agenda-h": `${height}px` }}
    >
      {wins.map((win) => (
        <div
          key={`${win.startMin}-${win.endMin}`}
          className="absolute inset-x-0 top-[var(--agenda-top)] h-[var(--agenda-span)] bg-white"
          style={{
            "--agenda-top": `${(win.startMin - bounds.startMin) * PX_PER_MIN}px`,
            "--agenda-span": `${(win.endMin - win.startMin) * PX_PER_MIN}px`,
          }}
        />
      ))}
      {wins.length === 0 ? (
        <div className={`absolute inset-x-0 top-2 text-center text-[11px] ${MUTED}`}>{copy.t("Closed")}</div>
      ) : null}
      {showNow && nowTop >= 0 && nowTop <= height ? (
        <div
          className="absolute inset-x-0 top-[var(--agenda-top)] z-20 border-t-2 border-[var(--agenda-now)]"
          style={{ "--agenda-top": `${nowTop}px`, "--agenda-now": NOW_LINE }}
        >
          <span className="bg-[var(--agenda-now)] px-1 text-[9px] text-white">{copy.t("Now")}</span>
        </div>
      ) : null}
      {dayItems.map((item) => {
        const kind = weekChipKind(item, tradeRules);
        if (kind === "allDay") return null;
        const dayKey = localYmd(day);
        const overnight = overnightLabel(item.startsAt, item.endsAt, dayKey);
        const { top, h } = geometry.get(item.id) ?? { top: 0, h: 24 };
        const lane = lanes.get(item.id) ?? { lane: 0, lanes: 1 };
        const travel = (item.where.travelMin ?? 0) > 0;
        const hatch = kind !== "done" && (travel || item.bufferAfterMin > 0);
        const place = placeLabelFor(item.where);
        return (
          <button
            key={item.id}
            type="button"
            data-week-chip={kind}
            aria-label={`${timeRange(item.startsAt, item.endsAt)} ${item.client?.name ?? item.title}`}
            onClick={(event) => onOpen(item, event)}
            className={`absolute left-[var(--agenda-left)] top-[var(--agenda-top)] z-10 h-[var(--agenda-span)] w-[var(--agenda-w)] overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] ${chipClass(item, kind)} ${
              hatch && item.kind !== "block" ? "shadow-[inset_0_-6px_0_rgba(11,11,13,0.06)]" : ""
            }`}
            style={{
              "--agenda-top": `${top}px`,
              "--agenda-span": `${h}px`,
              "--agenda-left": `calc(4px + (100% - 8px) * ${lane.lane / lane.lanes})`,
              "--agenda-w": `calc((100% - 8px) / ${lane.lanes} - ${lane.lanes > 1 ? 2 : 0}px)`,
            }}
          >
            <div className={`tabular-nums ${MUTED}`}>{timeRange(item.startsAt, item.endsAt)}</div>
            <div className="truncate font-semibold">
              {item.kind === "block" ? `${copy.t("Blocked")}${item.title ? ` · ${item.title}` : ""}` : (item.client?.name ?? item.title)}
            </div>
            {item.kind !== "block" && item.client?.name && h > 58 && serviceLabel(item) ? (
              <div className={`truncate ${MUTED}`}>{serviceLabel(item)}</div>
            ) : null}
            {wide && place ? <div className={MUTED}>{place}</div> : null}
            {travel && wide ? (
              <div className={MUTED}>{`${copy.t("Travel")} ${item.where.travelMin} ${copy.t("min")}`}</div>
            ) : null}
            {overnight ? <div className={MUTED}>{overnight}</div> : null}
            {kind === "done" ? <div>{copy.t("Done")}</div> : null}
            {kind === "request" ? (
              <div className={MUTED}>{`◌ ${copy.t("Request · not blocking")}`}</div>
            ) : null}
            {kind !== "done" && kind !== "request" && item.kind !== "block" && h > 44 ? (
              <div className={MUTED}>
                <ChipTag item={item} />
              </div>
            ) : null}
          </button>
        );
      })}
      {gaps.map((gap) => (
        <button
          key={gap.startsAt.toISOString()}
          type="button"
          onClick={() => onGap(day, gap.startsAt)}
          aria-label={`${copy.t("Free")} ${timeRange(gap.startsAt, gap.endsAt)}`}
          className="absolute inset-x-1 top-[var(--agenda-top)] z-[5] h-[var(--agenda-span)] rounded text-[10px] text-[var(--tc-accent)] opacity-0 transition-opacity hover:bg-[rgba(59,76,202,0.05)] hover:opacity-100 focus-visible:opacity-100"
          style={{
            "--agenda-top": `${(minutesOf(gap.startsAt) - bounds.startMin) * PX_PER_MIN}px`,
            "--agenda-span": `${Math.max(18, (minutesOf(gap.endsAt) - minutesOf(gap.startsAt)) * PX_PER_MIN)}px`,
          }}
        >
          {`+ ${copy.t("Book")}`}
        </button>
      ))}
    </div>
  );
}

function HourRail({
  bounds,
  now,
  focusMin,
}: {
  bounds: { startMin: number; endMin: number };
  /** Minute to bring into view on load (an invisible scroll anchor is drawn there). */
  focusMin?: number | null;
  /** Set when today is in view: the gutter carries the current time in red. */
  now?: Date | null;
}) {
  const height = (bounds.endMin - bounds.startMin) * PX_PER_MIN;
  const nowMin = now ? minutesOf(now) : null;
  return (
    <div className="relative h-[var(--agenda-h)]" style={{ "--agenda-h": `${height}px` }}>
      {focusMin != null && focusMin >= bounds.startMin ? (
        <span
          aria-hidden
          data-agenda-focus
          className="pointer-events-none absolute left-0 top-[var(--agenda-top)] h-px w-px scroll-mt-[120px]"
          style={{ "--agenda-top": `${(focusMin - bounds.startMin) * PX_PER_MIN}px` }}
        />
      ) : null}
      {nowMin != null && nowMin >= bounds.startMin && nowMin <= bounds.endMin ? (
        <div
          className="absolute right-1 top-[var(--agenda-top)] z-20 -translate-y-1/2 bg-white text-[10px] font-semibold tabular-nums text-[var(--agenda-now)]"
          style={{ "--agenda-top": `${(nowMin - bounds.startMin) * PX_PER_MIN}px`, "--agenda-now": NOW_LINE }}
        >
          {hm(nowMin)}
        </div>
      ) : null}
      {Array.from({ length: Math.ceil((bounds.endMin - bounds.startMin) / 60) + 1 }, (_, i) => {
        const min = bounds.startMin + i * 60;
        return (
          <div
            key={min}
            className={`absolute left-0 right-0 top-[var(--agenda-top)] border-t border-[rgba(11,11,13,0.08)] text-[10px] tabular-nums ${MUTED}`}
            style={{ "--agenda-top": `${(min - bounds.startMin) * PX_PER_MIN}px` }}
          >
            {hm(min)}
          </div>
        );
      })}
    </div>
  );
}

export function WeekGrid({
  days,
  items,
  clock,
  hours,
  bounds,
  tradeRules,
  onOpen,
  onSelectDay,
  onGap,
}: {
  days: Date[];
  items: TalentAgendaItem[];
  clock: Date;
  hours?: BookingHours | null;
  bounds: { startMin: number; endMin: number };
  tradeRules?: TradeCalendarRule | null;
  onOpen: (item: TalentAgendaItem, event?: MouseEvent<HTMLElement>) => void;
  onSelectDay: (day: Date) => void;
  onGap: (day: Date, startsAt?: Date) => void;
}) {
  const copy = useAgendaCopy();
  const focusMin = focusMinutes(days, items, (day) => dayWindows(hours, day));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const weekKey = localYmd(days[0] ?? clock);
  useEffect(() => {
    gridRef.current?.querySelector("[data-agenda-focus]")?.scrollIntoView({ block: "start" });
  }, [weekKey, focusMin]);
  const hasAllDay = days.some((day) =>
    itemsOnDay(items, day).some((item) => weekChipKind(item, tradeRules) === "allDay"),
  );
  return (
    <div
      ref={gridRef}
      className="overflow-x-auto pr-[var(--agenda-fab-clear)]"
      data-agenda-fab-clearance
      style={{ "--agenda-fab-clear": `${SHELL_FAB_CLEARANCE_PX}px` }}
    >
      <div className="grid min-w-[900px] grid-cols-[56px_repeat(7,1fr)] gap-1">
        <div />
        {days.map((day) => {
          const today = sameDay(day, clock);
          return (
            <button
              key={localYmd(day)}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-current={today ? "date" : undefined}
              className="flex min-h-[44px] items-center gap-2 text-left text-[12px] font-semibold text-[var(--tc-primary)]"
            >
              <span className={MUTED}>{day.toLocaleDateString(copy.locale === "es" ? "es-MX" : "en-US", { weekday: "short" })}</span>
              <span
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[14px] tabular-nums ${
                  today ? "bg-[var(--tc-primary)] text-white" : ""
                }`}
              >
                {day.getDate()}
              </span>
            </button>
          );
        })}
        {/* AUD-036: dedicated all-day row, below the headers, never overlapping them.
            Mockup tc_cal: no empty all-day lane, so it only renders when used. */}
        {hasAllDay ? (
          <>
            <div className={`self-center text-[10px] ${MUTED}`} data-agenda-allday-label>
              {copy.t("All day")}
            </div>
            {days.map((day) => {
              const allDayItems = itemsOnDay(items, day).filter(
                (item) => weekChipKind(item, tradeRules) === "allDay",
              );
              return (
                <div
                  key={`allday-${localYmd(day)}`}
                  data-agenda-allday-row
                  className="flex min-h-[28px] flex-col gap-0.5 rounded-md border border-[rgba(11,11,13,0.06)] p-0.5"
                >
                  {allDayItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(event) => onOpen(item, event)}
                      className={`truncate rounded border px-1 py-0.5 text-left text-[11px] ${
                        blocksTime(item)
                          ? "border-[rgba(59,76,202,0.25)] bg-[rgba(59,76,202,0.08)]"
                          : "border-dashed border-[rgba(59,76,202,0.4)] bg-white"
                      }`}
                    >
                      <span className="font-semibold">{item.title}</span>
                      {!blocksTime(item) ? <span className={MUTED}>{` · ${copy.t("Not blocking")}`}</span> : null}
                      {item.kind === "deadline" && !tradeRules?.deadlinesBlock ? (
                        <span className={MUTED}>{` · ${copy.t("Deadline")}`}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })}
          </>
        ) : null}
        <HourRail bounds={bounds} now={days.some((day) => sameDay(day, clock)) ? clock : null} focusMin={focusMin} />
        {days.map((day) => (
          <TimeColumn
            key={localYmd(day)}
            day={day}
            items={items}
            clock={clock}
            hours={hours}
            bounds={bounds}
            tradeRules={tradeRules}
            onOpen={onOpen}
            onGap={onGap}
          />
        ))}
      </div>
    </div>
  );
}

/** Legend under the week: every swatch carries its words. */
export function WeekLegend() {
  const copy = useAgendaCopy();
  const rows: [string, string][] = [
    ["border border-[rgba(11,11,13,0.12)] border-l-4 border-l-[var(--tc-accent)] bg-white", `✓ ${copy.t("Confirmed")}`],
    ["border border-dashed border-[rgba(138,90,17,0.5)] bg-[rgba(138,90,17,0.08)]", `◷ ${copy.t("On hold (blocks time until it expires)")}`],
    ["border border-dashed border-[rgba(59,76,202,0.4)] bg-white", `◌ ${copy.t("Request (does not block)")}`],
    ["border border-[rgba(11,11,13,0.12)] border-l-4 border-l-[var(--tc-primary)] bg-white", copy.t("Agency job")],
    [`border border-[rgba(11,11,13,0.10)] ${HATCH}`, copy.t("Buffer, travel or blocked")],
    ["border border-[rgba(11,11,13,0.08)] bg-[rgba(11,11,13,0.04)]", copy.t("Outside working hours")],
  ];
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-2 text-[12px] ${MUTED}`} aria-label={copy.t("Legend")}>
      {rows.map(([cls, label]) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3.5 w-5 rounded ${cls}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Desktop Day view: one wide column plus the day's free times. */
export function DayTimeline({
  day,
  items,
  clock,
  hours,
  tradeRules,
  onOpen,
  onGap,
}: {
  day: Date;
  items: TalentAgendaItem[];
  clock: Date;
  hours?: BookingHours | null;
  tradeRules?: TradeCalendarRule | null;
  onOpen: (item: TalentAgendaItem, event?: MouseEvent<HTMLElement>) => void;
  onGap: (day: Date, startsAt?: Date) => void;
}) {
  const copy = useAgendaCopy();
  const bounds = gridBounds(hours, [day], clock);
  const wins = dayWindows(hours, day);
  const gaps = freeGaps(day, itemsOnDay(items, day), wins.length ? { windows: wins } : null, clock).filter(
    (g) => g.endsAt > clock,
  );
  // Why there are no gaps: closed, the working day already ended, or fully booked.
  const lastClose = wins.reduce((max, w) => Math.max(max, w.endMin), 0);
  const dayOver =
    localYmd(day) < localYmd(clock) || (sameDay(day, clock) && minutesOf(clock) >= lastClose);
  const emptyNote =
    wins.length === 0 ? "Closed this day" : dayOver ? "Working hours are over for this day" : "Fully booked";
  return (
    <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid grid-cols-[56px_1fr] gap-1 rounded-2xl border border-[rgba(11,11,13,0.08)] bg-white p-2">
        <HourRail bounds={bounds} now={sameDay(day, clock) ? clock : null} />
        <TimeColumn
          day={day}
          items={items}
          clock={clock}
          hours={hours}
          bounds={bounds}
          tradeRules={tradeRules}
          onOpen={onOpen}
          onGap={onGap}
          wide
        />
      </div>
      <aside className="h-fit space-y-2 rounded-2xl border border-[rgba(11,11,13,0.08)] bg-white p-3">
        <h3 className="text-[13px] font-semibold text-[var(--tc-primary)]">
          {copy.t(sameDay(day, clock) ? "Free today" : "Free times")}
        </h3>
        {gaps.length === 0 ? (
          <p className={`text-[12px] ${MUTED}`}>{copy.t(emptyNote)}</p>
        ) : (
          gaps.map((gap) => (
            <div key={gap.startsAt.toISOString()} className="flex min-h-[44px] items-center justify-between gap-2 border-b border-[rgba(11,11,13,0.06)] text-[13px]">
              <span className="tabular-nums">
                {timeRange(gap.startsAt, gap.endsAt)}
                <span className={MUTED}>{` · ${durationText(minutesOf(gap.endsAt) - minutesOf(gap.startsAt))}`}</span>
              </span>
              <button
                type="button"
                onClick={() => onGap(day, gap.startsAt)}
                className="min-h-[44px] px-2 font-semibold text-[var(--tc-accent)]"
              >
                {`+ ${copy.t("Book")}`}
              </button>
            </div>
          ))
        )}
        <p className={`text-[11.5px] ${MUTED}`}>{copy.t("Already counts buffers and travel.")}</p>
      </aside>
    </section>
  );
}

/**
 * Phone agenda for one day: records in time order with free gaps you can book
 * and travel lines. A request that now overlaps a booking warns it would double book.
 */
export function PhoneDayAgenda({
  day,
  items,
  allItems,
  clock,
  hours,
  onOpen,
  onGap,
}: {
  day: Date;
  items: TalentAgendaItem[];
  allItems: readonly TalentAgendaItem[];
  clock: Date;
  hours?: BookingHours | null;
  onOpen: (item: TalentAgendaItem) => void;
  onGap: (day: Date, startsAt?: Date) => void;
}) {
  const copy = useAgendaCopy();
  const wins = dayWindows(hours, day);
  const gaps = freeGaps(day, items, wins.length ? { windows: wins } : null, clock).filter((g) => g.endsAt > clock);
  type Row =
    | { at: number; kind: "item"; item: TalentAgendaItem }
    | { at: number; kind: "gap"; startsAt: Date; endsAt: Date }
    | { at: number; kind: "travel"; min: number };
  const rows: Row[] = [];
  for (const item of items) {
    const s = new Date(item.startsAt);
    const before = item.where.travelBeforeMin ?? item.where.travelMin ?? 0;
    if (before > 0 && !item.allDay) rows.push({ at: s.getTime() - before * 60_000 - 1, kind: "travel", min: before });
    rows.push({ at: item.allDay ? 0 : s.getTime(), kind: "item", item });
  }
  for (const gap of gaps) rows.push({ at: gap.startsAt.getTime() + 1, kind: "gap", startsAt: gap.startsAt, endsAt: gap.endsAt });
  rows.sort((a, b) => a.at - b.at);
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        if (row.kind === "gap") {
          return (
            <div
              key={`gap-${row.at}`}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-dashed border-[rgba(59,76,202,0.3)] px-3 text-[13px]"
            >
              <span className="flex-1 text-[var(--tc-accent)]">
                {`${copy.t("Free")} ${timeRange(row.startsAt, row.endsAt)} · ${durationText(
                  minutesOf(row.endsAt) - minutesOf(row.startsAt),
                )}`}
              </span>
              <button
                type="button"
                onClick={() => onGap(day, row.startsAt)}
                className="min-h-[44px] min-w-[44px] px-2 font-semibold text-[var(--tc-accent)]"
              >
                {`+ ${copy.t("Book")}`}
              </button>
            </div>
          );
        }
        if (row.kind === "travel") {
          return (
            <div key={`travel-${row.at}`} className={`px-3 text-[12px] ${MUTED}`}>
              {`↦ ${copy.t("Travel")} ${row.min} ${copy.t("min")}`}
            </div>
          );
        }
        const item = row.item;
        const base = rowFromAgendaItem(item, clock, () => onOpen(item));
        const clash = requestOverlap(item, allItems);
        const note = clash
          ? `${copy.t("Overlaps")} ${clash.client?.name ?? clash.title} ${timeRange(clash.startsAt, clash.endsAt)}. ${copy.t("Accepting would double book.")}`
          : base.note
            ? copy.t(base.note)
            : undefined;
        return (
          <div key={item.id} data-agenda-request-overlap={clash ? "true" : undefined}>
            <AgendaRow
              item={{
                ...base,
                timeLabel: item.allDay ? copy.t("All day") : timeRange(item.startsAt, item.endsAt),
                note,
                sourceLabel: item.managedBy ? `${item.managedBy.name} · ${copy.t("agency job")}` : undefined,
              }}
            />
            {clash ? (
              <p role="alert" className="mt-1 px-3 text-[12.5px] font-semibold text-[var(--tc-primary)]">
                {`⚠ ${copy.t("Double booking if accepted")}`}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Desktop Month: counts per day and requests/holds by word. */
export function MonthGrid({
  anchor,
  clock,
  items,
  hours,
  onPick,
}: {
  anchor: Date;
  clock: Date;
  items: readonly TalentAgendaItem[];
  hours?: BookingHours | null;
  onPick: (day: Date) => void;
}) {
  const copy = useAgendaCopy();
  const cells = monthCells(anchor);
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.slice(0, 7).map((day) => (
        <div key={`h-${localYmd(day)}`} className={`px-1 text-[12px] font-semibold ${MUTED}`}>
          {day.toLocaleDateString(locale, { weekday: "short" })}
        </div>
      ))}
      {cells.map((day) => {
        const dayItems = itemsOnDay(items, day).filter(isRecord);
        const inMonth = day.getMonth() === anchor.getMonth();
        const today = sameDay(day, clock);
        const requests = dayItems.filter(isRequest).length;
        const holds = dayItems.filter(isHold).length;
        const booked = dayItems.filter((i) => !isRequest(i) && !isHold(i) && i.booking !== "cancelled").length;
        const agency = dayItems.find((i) => i.managedBy);
        const closed = dayWindows(hours, day).length === 0;
        return (
          <button
            key={localYmd(day)}
            type="button"
            onClick={() => onPick(day)}
            aria-current={today ? "date" : undefined}
            className={`min-h-[96px] rounded-lg border border-[rgba(11,11,13,0.08)] p-1.5 text-left text-[12px] ${
              inMonth ? "bg-white" : "bg-[rgba(11,11,13,0.03)] text-[rgba(11,11,13,0.45)]"
            }`}
          >
            <span
              className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full tabular-nums ${
                today ? "bg-[var(--tc-primary)] text-white" : ""
              }`}
            >
              {day.getDate()}
            </span>
            {booked > 0 ? (
              <div>{`${booked} ${copy.t(booked === 1 ? "booking" : "bookings")}`}</div>
            ) : null}
            {requests > 0 ? (
              <div className="text-[var(--tc-accent)]">{`◌ ${requests} ${copy.t(requests === 1 ? "request" : "requests")}`}</div>
            ) : null}
            {holds > 0 ? <div className={MUTED}>{`◷ ${holds} ${copy.t("on hold")}`}</div> : null}
            {agency?.managedBy ? <div className="truncate">{agency.managedBy.name}</div> : null}
            {closed && dayItems.length === 0 && inMonth ? <div className={MUTED}>{copy.t("Closed")}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Phone date picker body: compact month with dots (solid = bookings, hollow = request). */
export function CompactMonth({
  anchor,
  selected,
  clock,
  items,
  onPick,
}: {
  anchor: Date;
  selected: Date;
  clock: Date;
  items: readonly TalentAgendaItem[];
  onPick: (day: Date) => void;
}) {
  const copy = useAgendaCopy();
  const cells = monthCells(anchor);
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  return (
    <div className="grid grid-cols-7">
      {cells.slice(0, 7).map((day) => (
        <div key={`h-${localYmd(day)}`} className={`text-center text-[12px] font-semibold ${MUTED}`}>
          {day.toLocaleDateString(locale, { weekday: "narrow" })}
        </div>
      ))}
      {cells.map((day) => {
        const dots = stripDots(itemsOnDay(items, day));
        const on = sameDay(day, selected);
        const inMonth = day.getMonth() === anchor.getMonth();
        return (
          <button
            key={localYmd(day)}
            type="button"
            aria-pressed={on}
            aria-current={sameDay(day, clock) ? "date" : undefined}
            onClick={() => onPick(day)}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-full text-[14px] tabular-nums ${
              on ? "bg-[var(--tc-primary)] text-white" : inMonth ? "" : "text-[rgba(11,11,13,0.4)]"
            }`}
          >
            {day.getDate()}
            <Dots solid={dots.solid ? 1 : 0} hollow={dots.hollow} />
          </button>
        );
      })}
    </div>
  );
}

function Dots({ solid, hollow }: { solid: number; hollow: boolean }) {
  return (
    <span className="flex h-1.5 gap-0.5" aria-hidden>
      {Array.from({ length: solid }, (_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      ))}
      {hollow ? <span className="h-1.5 w-1.5 rounded-full border border-current" /> : null}
    </span>
  );
}

/** Phone week strip: weekday, date, dots (hollow = request or hold). */
export function WeekStrip({
  days,
  selected,
  clock,
  items,
  onPick,
}: {
  days: Date[];
  selected: Date;
  clock: Date;
  items: readonly TalentAgendaItem[];
  onPick: (day: Date) => void;
}) {
  const copy = useAgendaCopy();
  const locale = copy.locale === "es" ? "es-MX" : "en-US";
  return (
    <div className="flex gap-1">
      {days.map((day) => {
        const dots = stripDots(itemsOnDay(items, day));
        const on = sameDay(day, selected);
        const today = sameDay(day, clock);
        return (
          <button
            key={localYmd(day)}
            type="button"
            aria-pressed={on}
            aria-current={today ? "date" : undefined}
            onClick={() => onPick(day)}
            className={`flex min-h-[60px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] ${
              on ? "bg-[var(--tc-primary)] text-white" : today ? "border border-[var(--tc-primary)]" : ""
            }`}
          >
            <span className={on ? "" : MUTED}>{day.toLocaleDateString(locale, { weekday: "short" })}</span>
            <span className="text-[15px] font-semibold tabular-nums">{day.getDate()}</span>
            <Dots solid={dots.solid} hollow={dots.hollow} />
          </button>
        );
      })}
    </div>
  );
}
