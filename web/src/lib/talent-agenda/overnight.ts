/** Overnight display helpers (T2.4). */

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function overnightLabel(startsAt: string, endsAt: string, localeDay: string): string | null {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  const startDay = localYmd(s);
  const endDay = localYmd(e);
  if (startDay === endDay) return null;
  if (localeDay === startDay) {
    const hh = String(e.getHours()).padStart(2, "0");
    const mm = String(e.getMinutes()).padStart(2, "0");
    const weekday = e.toLocaleDateString("en-GB", { weekday: "short" });
    return `until ${hh}:${mm} ${weekday}`;
  }
  if (localeDay === endDay) return "continues from yesterday";
  return null;
}

/** Display grid may extend past midnight for dancer (minutes from midnight, e.g. 26*60). */
export function displayGridEndMin(profileEndMin: number): number {
  return Math.max(profileEndMin, 24 * 60);
}
