/**
 * classes-format.ts — the Classes mode's clock and money formatting. Pure.
 *
 * THE ZONE IS THE VENUE'S, AND THE LOCALE IS THE REQUEST'S. Both are passed
 * in, never read from the machine: this client component is rendered on the
 * server first, and a formatter that took the runtime's own locale would
 * paint one string in Node and another in the browser, which is a hydration
 * mismatch on a screen a person is trying to read the time off.
 */

export function formatClock(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatWhen(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** The day heading: "Thursday, 10 September". `ymd` is the venue day. */
export function formatDay(ymd: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${ymd}T12:00:00.000Z`));
  } catch {
    return ymd;
  }
}

/** Substitute `{name}` holes in a catalogue string. */
export function fill(template: string, params: Readonly<Record<string, string | number>>): string {
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

/**
 * `<input type="datetime-local">` value for an instant, on the venue's clock.
 * The control has no zone of its own; this is what the operator sees as the
 * booking's current time when the move form opens.
 */
export function venueLocalInputValue(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  } catch {
    return "";
  }
}
