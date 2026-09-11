/**
 * appointments-format.ts — the two formatters the Appointments surface shares.
 *
 * SPLIT OUT SO THEY ARE NOT COPIED. the old Schedule view already had `formatWhen`,
 * and the list, the waitlist and the reschedule form each want the same thing.
 * Three copies of a date formatter is three chances for one of them to drop
 * the timezone argument, which is the exact bug the comment below exists for.
 *
 * THE ZONE IS THE VENUE'S, NEVER THE READER'S. A schedule read in one country
 * for a venue in another must show the venue's clock, or the operator reads a
 * time nobody at that venue will ever see. Passing `null` deliberately falls
 * back to the reader's zone, which is right only when nothing knows better.
 */

/** Weekday, date and time, in the given zone. Returns the ISO on any failure. */
export function formatWhen(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Just the clock, for an offer window that is minutes away, not days. */
export function formatClock(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Substitute `{name}` holes in a catalogue string. */
export function fill(template: string, params: Readonly<Record<string, string>>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}
