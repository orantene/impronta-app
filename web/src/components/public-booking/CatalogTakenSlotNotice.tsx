"use client";

import { catalogMonthShort, catalogWeekdayShort } from "./catalog-booking-logic";
import { catalogNearestStarts, type CatalogTakenSlotNotice } from "./catalog-taken-slot";

/**
 * DS-4: the message the visitor lands on after a taken-slot error, with up to
 * three alternative times as pick buttons. Reads the freshly refetched days, so
 * every alternative already fits the full duration.
 */
export function CatalogTakenSlotNoticeView({
  notice,
  days,
  es,
  formatTime,
  onPick,
}: {
  notice: CatalogTakenSlotNotice;
  days: ReadonlyArray<{ date: Date; starts: string[] }>;
  es: boolean;
  formatTime: (iso: string) => string;
  onPick: (iso: string, dayIndex: number) => void;
}) {
  const alternatives = catalogNearestStarts(
    notice.lostStarts,
    days.flatMap((d) => d.starts),
  );
  return (
    <div className="jb-taken" role="alert" data-slot-taken="">
      <p>{notice.message}</p>
      {alternatives.length > 0 ? (
        <div className="jb-times" role="group" aria-label={es ? "Horarios alternativos" : "Alternative times"}>
          {alternatives.map((iso) => {
            const dayIndex = days.findIndex((d) => d.starts.includes(iso));
            const date = days[dayIndex]?.date;
            return (
              <button key={iso} type="button" className="jb-time" data-alt-slot="" onClick={() => onPick(iso, dayIndex)}>
                {date ? `${catalogWeekdayShort(date, es)} ${date.getDate()} ${catalogMonthShort(date, es)} ` : ""}
                <b>{formatTime(iso)}</b>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
