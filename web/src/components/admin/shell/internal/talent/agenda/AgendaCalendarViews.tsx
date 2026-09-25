"use client";

import type { MouseEvent } from "react";
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
import { AgendaRow, EmptyDay } from "./primitives";
import { holdUntilWallClock, itemsOnDay, rowFromAgendaItem } from "./present";
import { useAgendaCopy } from "./use-agenda-copy";

const PX_PER_MIN = 1.1;
const DEFAULT_OPEN = 10 * 60;
const DEFAULT_CLOSE = 19 * 60;

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

export function dayWindows(hours: BookingHours | null | undefined, day: Date) {
  if (!hours) return [{ startMin: DEFAULT_OPEN, endMin: DEFAULT_CLOSE }];
  return windowsForDate(hours, localYmd(day), day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6);
}

export function gridBounds(hours: BookingHours | null | undefined, days: Date[]) {
  let start = DEFAULT_OPEN;
  let end = DEFAULT_CLOSE;
  for (const day of days) {
    for (const win of dayWindows(hours, day)) {
      start = Math.min(start, win.startMin);
      end = Math.max(end, win.endMin);
    }
  }
  return { startMin: start, endMin: Math.max(end, start + 60) };
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
  onGap: (day: Date) => void;
}) {
  const copy = useAgendaCopy();
  const height = (bounds.endMin - bounds.startMin) * PX_PER_MIN;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[900px] grid-cols-[56px_repeat(7,1fr)] gap-1">
        <div />
        {days.map((day) => (
          <button
            key={localYmd(day)}
            type="button"
            onClick={() => onSelectDay(day)}
            className="text-left text-[12px] font-semibold text-[var(--tc-primary)]"
          >
            {day.toLocaleDateString([], { weekday: "short", day: "numeric" })}
          </button>
        ))}
        <div
          className="relative h-[var(--agenda-h)]"
          style={{ "--agenda-h": `${height}px` }}
        >
          {Array.from({ length: Math.ceil((bounds.endMin - bounds.startMin) / 60) + 1 }, (_, i) => {
            const min = bounds.startMin + i * 60;
            return (
              <div
                key={min}
                className="absolute left-0 right-0 top-[var(--agenda-top)] border-t border-[rgba(11,11,13,0.08)] text-[10px] text-[#5F6368]"
                style={{ "--agenda-top": `${(min - bounds.startMin) * PX_PER_MIN}px` }}
              >
                {`${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`}
              </div>
            );
          })}
        </div>
        {days.map((day) => {
          const wins = dayWindows(hours, day);
          const dayItems = itemsOnDay(items, day);
          const gaps = freeGaps(day, dayItems, wins.length ? { windows: wins } : null, clock);
          const showNow = sameDay(day, clock);
          const nowTop = (minutesOf(clock) - bounds.startMin) * PX_PER_MIN;
          return (
            <div
              key={localYmd(day)}
              className="relative h-[var(--agenda-h)] rounded-lg border border-[rgba(11,11,13,0.08)] bg-[rgba(11,11,13,0.03)]"
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
              {showNow && nowTop >= 0 && nowTop <= height ? (
                <div
                  className="absolute inset-x-0 top-[var(--agenda-top)] z-20 border-t-2 border-[#C4352D]"
                  style={{ "--agenda-top": `${nowTop}px` }}
                >
                  <span className="bg-[#C4352D] px-1 text-[9px] text-white">{copy.t("Now")}</span>
                </div>
              ) : null}
              {dayItems.map((item) => {
                const dayKey = localYmd(day);
                const overnight = overnightLabel(item.startsAt, item.endsAt, dayKey);
                const isDeadline =
                  item.kind === "deadline" ||
                  item.kind === "project" ||
                  (Boolean(tradeRules?.deadlinesAllDay) && item.allDay);
                const occ = occupiedInterval(item);
                const top = isDeadline
                  ? 2
                  : (minutesOf(occ.startsAt) - bounds.startMin) * PX_PER_MIN;
                const h = isDeadline
                  ? 28
                  : Math.max(24, (minutesOf(occ.endsAt) - minutesOf(occ.startsAt)) * PX_PER_MIN);
                const request =
                  !blocksTime(item) ||
                  (Boolean(tradeRules?.onlyCallsBlock) &&
                    item.tradeSection?.kind !== "estimate" &&
                    item.kind !== "hold" &&
                    item.kind !== "block");
                const hatch = (item.where.travelMin ?? 0) > 0 || item.bufferAfterMin > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(event) => onOpen(item, event)}
                    className={`absolute inset-x-1 top-[var(--agenda-top)] z-10 h-[var(--agenda-span)] overflow-hidden rounded-md border px-1 py-0.5 text-left text-[11px] ${
                      isDeadline
                        ? "border-[rgba(59,76,202,0.25)] bg-[rgba(59,76,202,0.08)]"
                        : request
                          ? "border-dashed border-[rgba(59,76,202,0.4)] bg-white"
                          : item.booking === "hold"
                            ? "border-[rgba(138,90,17,0.3)] bg-[rgba(138,90,17,0.12)]"
                            : "border-[rgba(11,11,13,0.12)] bg-white"
                    } ${hatch ? "bg-[repeating-linear-gradient(135deg,rgba(11,11,13,0.08)_0_3px,transparent_3px_6px)]" : ""}`}
                    style={{
                      "--agenda-top": `${top}px`,
                      "--agenda-span": `${h}px`,
                    }}
                  >
                    <div className="font-semibold">{item.title}</div>
                    {item.managedBy ? <div className="text-[#5F6368]">{item.managedBy.name}</div> : null}
                    {item.holdUntil ? (
                      <div className="text-[#5F6368]">{holdUntilWallClock(item.holdUntil)}</div>
                    ) : null}
                    {overnight ? <div className="text-[#5F6368]">{overnight}</div> : null}
                    {request ? <div className="text-[#5F6368]">{copy.t("Not blocking")}</div> : null}
                    {isDeadline && !tradeRules?.deadlinesBlock ? (
                      <div className="text-[#5F6368]">{copy.t("Deadline")}</div>
                    ) : null}
                  </button>
                );
              })}
              {gaps.map((gap) => (
                <button
                  key={gap.startsAt.toISOString()}
                  type="button"
                  onClick={() => onGap(day)}
                  className="absolute inset-x-1 top-[var(--agenda-top)] z-[5] h-[var(--agenda-span)] rounded border border-dashed border-[rgba(59,76,202,0.35)] text-[10px] text-[var(--tc-accent)]"
                  style={{
                    "--agenda-top": `${(minutesOf(gap.startsAt) - bounds.startMin) * PX_PER_MIN}px`,
                    "--agenda-span": `${Math.max(18, (minutesOf(gap.endsAt) - minutesOf(gap.startsAt)) * PX_PER_MIN)}px`,
                  }}
                >
                  {copy.t("Free")}
                </button>
              ))}
              {dayItems.length === 0 && gaps.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center p-2 text-center text-[11px] text-[#5F6368]">
                  {copy.t("Open")}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DayAgenda({
  day,
  items,
  clock,
  hours,
  onOpen,
  onGap,
}: {
  day: Date;
  items: TalentAgendaItem[];
  clock: Date;
  hours?: BookingHours | null;
  onOpen: (item: TalentAgendaItem) => void;
  onGap: () => void;
}) {
  const copy = useAgendaCopy();
  const wins = dayWindows(hours, day);
  const gaps = freeGaps(day, items, wins.length ? { windows: wins } : null, clock);
  return (
    <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="space-y-3">
        <h2 className="text-[15px] font-semibold">
          {day.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
        </h2>
        {sameDay(day, clock) ? (
          <div className="border-t-2 border-[#C4352D] text-[11px] text-[#C4352D]">{copy.t("Now")}</div>
        ) : null}
        {items.length === 0 && gaps.length === 0 ? (
          <EmptyDay title={copy.t("Open")} body={copy.t("No bookings this day.")} />
        ) : null}
        {items.map((item) => (
          <div key={item.id} className="space-y-1">
            {(item.where.travelMin ?? 0) > 0 || item.bufferAfterMin > 0 ? (
              <div className="rounded-md bg-[repeating-linear-gradient(135deg,rgba(11,11,13,0.12)_0_4px,transparent_4px_8px)] px-2 py-1 text-[11px] text-[#5F6368]">
                {copy.t("Travel and buffer")}
              </div>
            ) : null}
            <AgendaRow item={rowFromAgendaItem(item, clock, () => onOpen(item))} />
            {!blocksTime(item) ? <p className="text-[11px] text-[#5F6368]">{copy.t("Not blocking")}</p> : null}
            {item.managedBy ? <p className="text-[11px] text-[#5F6368]">{item.managedBy.name}</p> : null}
          </div>
        ))}
      </div>
      <aside className="space-y-2 rounded-2xl border border-black/8 bg-white p-3">
        <h3 className="text-[13px] font-semibold text-[var(--tc-primary)]">{copy.t("Free times")}</h3>
        {gaps.length === 0 ? (
          <p className="text-[12px] text-[#5F6368]">{copy.t("No free gaps")}</p>
        ) : (
          gaps.map((gap) => (
            <button
              key={gap.startsAt.toISOString()}
              type="button"
              onClick={onGap}
              className="w-full rounded-lg border border-dashed px-2 py-2 text-left text-[12px] text-[var(--tc-accent)]"
            >
              {gap.startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              {" – "}
              {gap.endsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </button>
          ))
        )}
      </aside>
    </section>
  );
}

export function MonthGrid({
  clock,
  items,
  onPick,
}: {
  clock: Date;
  items: readonly TalentAgendaItem[];
  onPick: (day: Date) => void;
}) {
  const start = new Date(clock.getFullYear(), clock.getMonth(), 1);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(1 - ((start.getDay() + 6) % 7) + i);
    cells.push(day);
  }
  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((day) => {
        const dayItems = itemsOnDay(items, day);
        const past = localYmd(day) < localYmd(clock);
        const requests = dayItems.filter((i) => i.kind === "request" || i.booking === "requested").length;
        const holds = dayItems.filter((i) => i.booking === "hold").length;
        const confirmed = dayItems.filter((i) => i.booking === "confirmed").length;
        return (
          <button
            key={localYmd(day)}
            type="button"
            onClick={() => onPick(day)}
            className="min-h-[72px] rounded-lg border bg-white p-1 text-left text-[12px]"
          >
            <div>{day.getDate()}</div>
            {past ? (
              <div>{dayItems.length}</div>
            ) : (
              <div className="text-[11px] text-[#5F6368]">
                {requests > 0 ? `Requests ${requests}` : ""}
                {holds > 0 ? ` Holds ${holds}` : ""}
                {confirmed > 0 ? ` ${confirmed}` : ""}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
