/**
 * Generate an RFC 5545 .ics file payload (G.4).
 *
 * Used by "Add to calendar" buttons on confirmed bookings. Produces a
 * single VEVENT inside a minimal VCALENDAR wrapper. The resulting string
 * can be base64-encoded into a `data:text/calendar` href, or downloaded
 * as `<booking>.ics` for native calendar app import.
 *
 * Spec compliance covers the common cases:
 *   - DTSTART/DTEND in UTC (the "Z" suffix form)
 *   - SUMMARY, DESCRIPTION, LOCATION
 *   - UID (caller supplies — typically the booking_id)
 *   - DTSTAMP (now, required by spec)
 *
 * Reminders, attendees, and TZID handling are deferred — most consumers
 * (Google, Apple, Outlook) auto-convert UTC to the user's local tz.
 */

export type IcsEventInput = {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  /** Optional URL the event detail links to. */
  url?: string;
};

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

function toUtcStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string): string {
  // RFC 5545 §3.1 — content lines must be <= 75 octets; longer lines
  // are split with CRLF + leading space. We're conservative: 73 chars per fold.
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + 73);
    chunks.push(i === 0 ? slice : " " + slice);
    i += 73;
  }
  return chunks.join("\r\n");
}

export function buildIcsEvent(input: IcsEventInput): string {
  const start = typeof input.startsAt === "string" ? new Date(input.startsAt) : input.startsAt;
  const end = typeof input.endsAt === "string" ? new Date(input.endsAt) : input.endsAt;
  const now = new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tulala//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(input.uid)}@tulala.digital`,
    `DTSTAMP:${toUtcStamp(now)}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    fold(`SUMMARY:${escapeIcs(input.summary)}`),
    input.description ? fold(`DESCRIPTION:${escapeIcs(input.description)}`) : null,
    input.location ? fold(`LOCATION:${escapeIcs(input.location)}`) : null,
    input.url ? fold(`URL:${escapeIcs(input.url)}`) : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);

  return lines.join("\r\n") + "\r\n";
}

/**
 * Trigger a client-side download of an .ics file. Browser-only.
 */
export function downloadIcs(filename: string, payload: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([payload], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
