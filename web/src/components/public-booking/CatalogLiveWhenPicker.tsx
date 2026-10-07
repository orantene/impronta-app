"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  catalogMonthShort,
  catalogSelectedDateLabel,
  catalogTimezoneLabel,
  catalogWeekdayShort,
  formatClock,
} from "./catalog-booking-logic";
import type { CatalogTakenSlotNotice } from "./catalog-taken-slot";
import { CatalogTakenSlotNoticeView } from "./CatalogTakenSlotNotice";

/** Scroll the strip so the selected day is visible (mount and whenever the pick changes). */
export function useScrollSelectedDayIntoView(dayIndex: number, count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[data-on="true"]');
    if (!strip || !el) return;
    const left = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    strip.scrollLeft = Math.max(0, left);
  }, [dayIndex, count]);
  return ref;
}

/** Selected date + timezone line shown above the slots, so the pick is visible even when scrolled off the strip. */
export function CatalogSelectedDateLine({ date, tz, es }: { date: Date | undefined; tz: string | null; es: boolean }) {
  if (!date) return null;
  const zone = catalogTimezoneLabel(tz, es);
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
  timeGroupLabel: string;
  emptyConsultButton: ReactNode;
  takenNotice: CatalogTakenSlotNotice | null;
  onPickDay: (index: number) => void;
  /** `dayIndex` is set when the pick came from an alternative on another day. */
  onPickStart: (iso: string, label: string, dayIndex?: number) => void;
}) {
  const liveTimes = liveDays[dayIndex]?.starts ?? [];
  const stripRef = useScrollSelectedDayIntoView(dayIndex, liveDays.length);
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
          <button key={d.key} type="button" className="jb-day" data-on={i === dayIndex} onClick={() => onPickDay(i)}>
            <span>{catalogWeekdayShort(d.date, es)}</span>
            <b>{d.date.getDate()}</b>
            <small>{catalogMonthShort(d.date, es)}</small>
          </button>
        ))}
      </div>
      <CatalogSelectedDateLine date={liveDays[dayIndex]?.date} tz={liveTz} es={es} />
      {liveTimes.length === 0 ? (
        <div className="jb-empty">
          <strong>{es ? "Sin horarios disponibles." : "No times available."}</strong>
          <p>
            {es
              ? "No hay huecos en las próximas dos semanas. Prueba otra fecha o consulta."
              : "Nothing is open in the next two weeks. Try another day or send a question."}
          </p>
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
  return (
    <>
      <div ref={stripRef} className="jb-days" role="group" aria-label={es ? "Elige una fecha" : "Pick a date"}>
        {days.map((d, i) => (
          <button
            key={d.toISOString()}
            type="button"
            className="jb-day"
            data-on={i === dayIndex}
            disabled={d.getDay() === 0}
            onClick={() => onPickDay(i)}
          >
            <span>{catalogWeekdayShort(d, es)}</span>
            <b>{d.getDate()}</b>
            <small>{catalogMonthShort(d, es)}</small>
          </button>
        ))}
      </div>
      <CatalogSelectedDateLine date={day} tz={null} es={es} />
      {demoTimes.length === 0 ? (
        <div className="jb-empty">
          <strong>{es ? "Sin horarios disponibles ese día." : "No times that day."}</strong>
          <p>{es ? "Elige otra fecha." : "Pick another date."}</p>
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
