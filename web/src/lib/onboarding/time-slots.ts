// TUL-992: the hours picker shows times in the flow language. A native
// <input type="time"> follows the device locale, so a Spanish flow on an
// English phone showed "09:00 AM". A <select> with our own labels does not.

export const SLOT_STEP_MIN = 15;

export function timeSlotLabel(min: number, locale: string): string {
  const h = Math.floor(min / 60) % 24;
  const m = String(min % 60).padStart(2, "0");
  if (locale.toLowerCase().startsWith("es")) return `${String(h).padStart(2, "0")}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Every slot of the day, plus `current` when it sits off the 15-minute grid. */
export function timeSlotOptions(locale: string, current?: number): Array<{ value: number; label: string }> {
  const mins: number[] = [];
  for (let m = 0; m < 24 * 60; m += SLOT_STEP_MIN) mins.push(m);
  if (typeof current === "number" && current >= 0 && current < 24 * 60 && !mins.includes(current)) {
    mins.push(current);
    mins.sort((a, b) => a - b);
  }
  return mins.map((value) => ({ value, label: timeSlotLabel(value, locale) }));
}
