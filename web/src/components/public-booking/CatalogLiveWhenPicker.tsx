"use client";

import type { ReactNode } from "react";

import { catalogMonthShort, catalogWeekdayShort, formatClock } from "./catalog-booking-logic";
import type { CatalogTakenSlotNotice } from "./catalog-taken-slot";
import { CatalogTakenSlotNoticeView } from "./CatalogTakenSlotNotice";

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
      <div className="jb-days" role="group" aria-label={es ? "Elige una fecha" : "Pick a date"}>
        {liveDays.map((d, i) => (
          <button key={d.key} type="button" className="jb-day" data-on={i === dayIndex} onClick={() => onPickDay(i)}>
            <span>{catalogWeekdayShort(d.date, es)}</span>
            <b>{d.date.getDate()}</b>
            <small>{catalogMonthShort(d.date, es)}</small>
          </button>
        ))}
      </div>
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
