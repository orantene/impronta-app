/**
 * Add-to-calendar for a paid, dated booking (TUL-437). Pure: an .ics file body
 * and a Google Calendar link from one event. Times are written in UTC (`Z`), so
 * every calendar app shows the viewer's own local time for the same instant;
 * the venue's zone only decides what the viewer SEES, never the instant.
 */

export type CalendarEvent = {
  /** Stable id so re-adding updates instead of duplicating. */
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
  description?: string | null;
};

function utc(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
export function escapeIcsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets fold with CRLF + space (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** null when the start or end is not a real instant, or the end is not after the start. */
export function buildIcs(ev: CalendarEvent, now: Date = new Date()): string | null {
  const start = utc(ev.startsAt);
  const end = utc(ev.endsAt);
  if (!start || !end || Date.parse(ev.endsAt) <= Date.parse(ev.startsAt)) return null;
  const stamp = utc(now.toISOString()) as string;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tulala//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}@tulala.digital`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(ev.title)}`,
  ];
  if (ev.location?.trim()) lines.push(`LOCATION:${escapeIcsText(ev.location.trim())}`);
  if (ev.description?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(ev.description.trim())}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(ev: CalendarEvent): string | null {
  const start = utc(ev.startsAt);
  const end = utc(ev.endsAt);
  if (!start || !end || Date.parse(ev.endsAt) <= Date.parse(ev.startsAt)) return null;
  const q = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${start}/${end}` });
  if (ev.location?.trim()) q.set("location", ev.location.trim());
  if (ev.description?.trim()) q.set("details", ev.description.trim());
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
