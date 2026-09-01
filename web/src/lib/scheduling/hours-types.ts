/**
 * Parsers for talent_booking_hours jsonb. Garbage in → null out (fail closed:
 * a broken hours row yields zero public slots, never a guessed calendar).
 *
 * PURE. No DB.
 */

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type LocalWindow = {
  startMin: number;
  endMin: number;
};

export type WeeklyHours = Record<WeekdayIndex, LocalWindow[]>;

export type HoursException = {
  date: string;
  closed: boolean;
  windows: LocalWindow[];
};

export type BookingHours = {
  timezone: string;
  weekly: WeeklyHours;
  exceptions: HoursException[];
  slotMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  horizonDays: number;
};

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const n = Math.trunc(v);
  if (n < min || n > max) return fallback;
  return n;
}

function parseWindow(v: unknown): LocalWindow | null {
  if (!isPlainObject(v)) return null;
  const startMin =
    typeof v.startMin === "number"
      ? v.startMin
      : typeof v.start_min === "number"
        ? v.start_min
        : null;
  const endMin =
    typeof v.endMin === "number"
      ? v.endMin
      : typeof v.end_min === "number"
        ? v.end_min
        : null;
  if (
    startMin == null ||
    endMin == null ||
    !Number.isInteger(startMin) ||
    !Number.isInteger(endMin) ||
    startMin < 0 ||
    endMin > 1440 ||
    endMin <= startMin
  ) {
    return null;
  }
  return { startMin, endMin };
}

function parseWindowList(v: unknown): LocalWindow[] | null {
  if (!Array.isArray(v)) return null;
  const out: LocalWindow[] = [];
  for (const item of v) {
    const w = parseWindow(item);
    if (!w) return null;
    out.push(w);
  }
  return out;
}

function emptyWeekly(): WeeklyHours {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/**
 * Parse weekly hours. Unknown keys ignored. A malformed window fails the
 * whole object (fail closed) rather than dropping one day.
 */
export function parseWeeklyHours(raw: unknown): WeeklyHours | null {
  if (raw == null) return emptyWeekly();
  if (!isPlainObject(raw)) return null;
  const weekly = emptyWeekly();
  for (const key of Object.keys(raw)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const windows = parseWindowList(raw[key]);
    if (!windows) return null;
    weekly[day as WeekdayIndex] = windows;
  }
  return weekly;
}

export function parseHoursExceptions(raw: unknown): HoursException[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const out: HoursException[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) return null;
    const date = typeof item.date === "string" ? item.date : null;
    if (!date || !YMD_RE.test(date)) return null;
    const closed = item.closed === true;
    const windowsRaw = item.windows ?? item.hours;
    let windows: LocalWindow[] = [];
    if (windowsRaw != null) {
      const parsed = parseWindowList(windowsRaw);
      if (!parsed) return null;
      windows = parsed;
    }
    out.push({ date, closed, windows });
  }
  return out;
}

export function windowsForDate(
  hours: BookingHours,
  ymd: string,
  weekday: WeekdayIndex,
): LocalWindow[] {
  const exception = hours.exceptions.find((e) => e.date === ymd);
  if (exception) {
    if (exception.closed) return [];
    if (exception.windows.length > 0) return exception.windows;
  }
  return hours.weekly[weekday] ?? [];
}

/**
 * Parse a talent_booking_hours row (or a partial settings blob). Missing
 * numeric fields take the table defaults. Garbage weekly/exceptions → null.
 */
/**
 * Dev-only signal for a rejected hours row.
 *
 * These parsers fail CLOSED: a malformed row yields no slots rather than an
 * error, which is the right behavior and an undiagnosable symptom. A public
 * booking page simply shows no times, and nothing anywhere says why. That cost
 * an hour once, chasing an empty slot list whose only cause was a `weekly`
 * blob written with `start`/`end` instead of `startMin`/`endMin`.
 *
 * Production behavior is unchanged — this only speaks in development.
 */
function warnRejectedHours(reason: string): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.warn(
    `[scheduling] booking hours rejected: ${reason}. ` +
      `Expected weekly keyed by weekday index 0-6 with { startMin, endMin } ` +
      `minute offsets, and exceptions as an array. No slots will be offered.`,
  );
}

export function parseBookingHours(raw: unknown): BookingHours | null {
  if (!isPlainObject(raw)) {
    if (raw != null) warnRejectedHours("row is not an object");
    return null;
  }
  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (!timezone) {
    warnRejectedHours("missing timezone");
    return null;
  }

  const weekly = parseWeeklyHours(raw.weekly);
  const exceptions = parseHoursExceptions(raw.exceptions);
  if (!weekly) {
    warnRejectedHours("weekly windows malformed");
    return null;
  }
  if (!exceptions) {
    warnRejectedHours("exceptions malformed");
    return null;
  }

  return {
    timezone,
    weekly,
    exceptions,
    slotMinutes: clampInt(raw.slot_minutes ?? raw.slotMinutes, 1, 480, 30),
    bufferBeforeMin: clampInt(raw.buffer_before_min ?? raw.bufferBeforeMin, 0, 240, 0),
    bufferAfterMin: clampInt(raw.buffer_after_min ?? raw.bufferAfterMin, 0, 240, 0),
    minNoticeMin: clampInt(raw.min_notice_min ?? raw.minNoticeMin, 0, 60 * 24 * 30, 120),
    horizonDays: clampInt(raw.horizon_days ?? raw.horizonDays, 1, 365, 60),
  };
}
