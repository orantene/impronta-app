const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseClientDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatClientDate(iso: string | null, fallback = "-"): string {
  const date = parseClientDate(iso);
  if (!date) return fallback;
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatClientWeekdayDate(iso: string | null, fallback = "TBC"): string {
  const date = parseClientDate(iso);
  if (!date) return fallback;
  return `${WEEKDAY_SHORT[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function getClientDateParts(
  iso: string | null,
): { day: number; monthShort: string } | null {
  const date = parseClientDate(iso);
  if (!date) return null;
  return {
    day: date.getUTCDate(),
    monthShort: MONTH_SHORT[date.getUTCMonth()],
  };
}

export function isPastClientDate(iso: string | null): boolean {
  const date = parseClientDate(iso);
  if (!date) return false;
  return date.getTime() < Date.now();
}

export function clientDateMs(iso: string): number | null {
  const date = parseClientDate(iso);
  return date ? date.getTime() : null;
}
