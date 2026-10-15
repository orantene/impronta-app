"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import {
  catalogDemoDayClosed,
  catalogLiveDayClosed,
  catalogMonthShort,
  catalogSelectedDateLabel,
  catalogTimezoneLabel,
  catalogWeekdayShort,
  formatClock,
  nextDayWithSlotsIndex,
  nextOpenDemoDayIndex,
} from "./catalog-booking-logic";
import { catalogEmptyWhenCopy } from "./catalog-booking-live-slots";
import type { CatalogTakenSlotNotice } from "./catalog-taken-slot";
import { CatalogTakenSlotNoticeView } from "./CatalogTakenSlotNotice";
import { selectedDayScrollLeft, weekScrollLeft } from "./catalog-selected-day-scroll";

export { selectedDayScrollLeft } from "./catalog-selected-day-scroll";

/** Scroll the strip so the selected day is visible (mount and whenever the pick changes). */
export function useScrollSelectedDayIntoView(dayIndex: number, count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[data-on="true"]');
    if (!strip || !el) return;
    strip.scrollLeft = selectedDayScrollLeft(strip, el);
  }, [dayIndex, count]);
  return ref;
}

/** TUL-899: previous / next week over the 7-day strip (shown only when there is more than a week). */
export function CatalogWeekNav({ stripRef, count, es }: { stripRef: RefObject<HTMLDivElement | null>; count: number; es: boolean }) {
  if (count <= 7) return null;
  const go = (dir: 1 | -1) => {
    const strip = stripRef.current;
    if (!strip) return;
    const left = weekScrollLeft(strip, dir);
    if (typeof strip.scrollTo === "function") strip.scrollTo({ left, behavior: "smooth" });
    else strip.scrollLeft = left;
  };
  return (
    <div className="jb-week-nav" data-catalog-week-nav="">
      <button type="button" onClick={() => go(-1)} aria-label={es ? "Semana anterior" : "Previous week"}>←</button>
      <button type="button" onClick={() => go(1)} data-catalog-next-week="">{es ? "Semana siguiente →" : "Next week →"}</button>
    </div>
  );
}

/** Selected date + timezone line shown above the slots, so the pick is visible even when scrolled off the strip. */
export function CatalogSelectedDateLine({
  date,
  tz,
  es,
  placeCity,
}: {
  date: Date | undefined;
  tz: string | null;
  es: boolean;
  placeCity?: string | null;
}) {
  if (!date) return null;
  const zone = catalogTimezoneLabel(tz, es, placeCity);
  return (
    <p className="jb-selected-date" data-catalog-selected-date="" aria-live="polite" style={{ margin: "2px 0 10px", fontSize: "0.9375rem" }}>
      <strong>{catalogSelectedDateLabel(date, es)}</strong>
      {zone ? <span style={{ opacity: 0.65 }}> · {zone}</span> : null}
    </p>
  );
}

/**
 * The live "when" step body of the catalog booking sheet: date rail, time
 * buttons, the empty state, and (DS-4) the taken-slot notice with alternatives
 * shown where the visitor lands after a slot is lost.
 */
export function CatalogLiveWhenPicker({
  es,
  locale,
  liveDays,
  dayIndex,
  liveStarts,
  liveTz,
  placeCity,
  timeGroupLabel,
  emptyConsultButton,
  takenNotice,
  onPickDay,
  onPickStart,
}: {
  es: boolean;
  locale: string;
  liveDays: Array<{ key: string; date: Date; starts: string[] }>;
  dayIndex: number;
  liveStarts: string | null;
  liveTz: string;
  placeCity?: string | null;
  timeGroupLabel: string;
  emptyConsultButton: ReactNode;
  takenNotice: CatalogTakenSlotNotice | null;
  onPickDay: (index: number) => void;
  /** `dayIndex` is set when the pick came from an alternative on another day. */
  onPickStart: (iso: string, label: string, dayIndex?: number) => void;
}) {
  const liveTimes = liveDays[dayIndex]?.starts ?? [];
  const emptyCopy = catalogEmptyWhenCopy(es, liveDays.some((d) => d.starts.length > 0));
  const stripRef = useScrollSelectedDayIntoView(dayIndex, liveDays.length);
  const nextFree = nextDayWithSlotsIndex(liveDays, dayIndex);
  const jumpToNextFree = () => {
    if (nextFree == null) return;
    onPickDay(nextFree);
  };
  return (
    <>
      {takenNotice && !liveStarts ? (
        <CatalogTakenSlotNoticeView
          notice={takenNotice}
          days={liveDays}
          es={es}
          formatTime={(iso) => formatClock(iso, liveTz, locale)}
          onPick={(iso, i) => onPickStart(iso, formatClock(iso, liveTz, locale), i)}
        />
      ) : null}
      <div ref={stripRef} className="jb-days" role="group" aria-label={es ? "Elige una fecha" : "Pick a date"}>
        {liveDays.map((d, i) => (
          <button key={d.key} type="button" className="jb-day" data-on={i === dayIndex} disabled={catalogLiveDayClosed(d)} onClick={() => onPickDay(i)}>
            <span>{catalogWeekdayShort(d.date, es)}</span>
            <b>{d.date.getDate()}</b>
            <small>{catalogMonthShort(d.date, es)}</small>
          </button>
        ))}
      </div>
      <CatalogWeekNav stripRef={stripRef} count={liveDays.length} es={es} />
      <CatalogSelectedDateLine date={liveDays[dayIndex]?.date} tz={liveTz} es={es} placeCity={placeCity} />
      {liveTimes.length === 0 ? (
        <div className="jb-empty">
          <strong>{emptyCopy.title}</strong>
          <p>{emptyCopy.body}</p>
          {nextFree != null ? (
            <button
              type="button"
              className="jb-ask"
              data-catalog-try-another-date=""
              onClick={jumpToNextFree}
            >
              {es ? "Prueba otra fecha" : "Try another date"}
            </button>
          ) : null}
          {emptyConsultButton}
        </div>
      ) : (
        <div className="jb-times" role="group" aria-label={timeGroupLabel}>
          {liveTimes.map((iso) => {
            const label = formatClock(iso, liveTz, locale);
            return (
              <button key={iso} type="button" className="jb-time" data-on={iso === liveStarts} onClick={() => onPickStart(iso, label)}>
                {label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Demo-mode "when" body: fixture day strip, selected-date line, fixture times. */
export function CatalogDemoWhenPicker({
  es,
  days,
  day,
  dayIndex,
  time,
  demoTimes,
  timeGroupLabel,
  emptyConsultButton,
  onPickDay,
  onPickTime,
}: {
  es: boolean;
  days: Date[];
  day: Date;
  dayIndex: number;
  time: string | null;
  demoTimes: string[];
  timeGroupLabel: string;
  emptyConsultButton: ReactNode;
  onPickDay: (index: number) => void;
  onPickTime: (t: string) => void;
}) {
  const stripRef = useScrollSelectedDayIntoView(dayIndex, days.length);
  const nextOpen = nextOpenDemoDayIndex(days, dayIndex);
  return (
    <>
      <div ref={stripRef} className="jb-days" role="group" aria-label={es ? "Elige una fecha" : "Pick a date"}>
        {days.map((d, i) => (
          <button
            key={d.toISOString()}
            type="button"
            className="jb-day"
            data-on={i === dayIndex}
            disabled={catalogDemoDayClosed(d)}
            onClick={() => onPickDay(i)}
          >
            <span>{catalogWeekdayShort(d, es)}</span>
            <b>{d.getDate()}</b>
            <small>{catalogMonthShort(d, es)}</small>
          </button>
        ))}
      </div>
      <CatalogWeekNav stripRef={stripRef} count={days.length} es={es} />
      <CatalogSelectedDateLine date={day} tz={null} es={es} />
      {demoTimes.length === 0 ? (
        <div className="jb-empty">
          <strong>{es ? "Sin horarios disponibles ese día." : "No times that day."}</strong>
          <p>{es ? "Elige otra fecha." : "Pick another date."}</p>
          {nextOpen != null ? (
            <button
              type="button"
              className="jb-ask"
              data-catalog-try-another-date=""
              onClick={() => onPickDay(nextOpen)}
            >
              {es ? "Prueba otra fecha" : "Try another date"}
            </button>
          ) : null}
          {emptyConsultButton}
        </div>
      ) : (
        <div className="jb-times" role="group" aria-label={timeGroupLabel}>
          {demoTimes.map((t) => (
            <button key={t} type="button" className="jb-time" data-on={t === time} onClick={() => onPickTime(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
