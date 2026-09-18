/**
 * The kit's day-first civil date, "Tue 8 Sep", in every locale: the locale
 * names the weekday and the month, this function fixes the order (en-US would
 * say "Tue, Sep 8"; en-GB "Tue 8 Sept"). A YYYY-MM-DD is a civil date, so it
 * is formatted in UTC to keep the day it names.
 */
export function formatDayFirst(ymd: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
      new Date(`${ymd}T12:00:00.000Z`),
    );
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const out = `${part("weekday")} ${part("day")} ${part("month")}`.replace(/\.\s/g, " ").replace(/\.$/, "").trim();
    return out.trim() === "" ? ymd : out;
  } catch {
    return ymd;
  }
}
