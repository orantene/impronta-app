/**
 * G1: the service facts a booking email carries, and the one calendar file.
 *
 * PURE. No I/O, no server-only: the hydrator, the templates and the tests all
 * import this. It only decides how the facts READ; the hydrator reads the rows.
 * Nothing here recomputes money.
 *
 * The facts: service, date and time in the venue's timezone (with the zone
 * named), address, duration and the cancellation policy. A fact with no value
 * is dropped, never invented.
 */
import { buildIcsEvent } from "@/lib/ui/ics";

type Loc = "en" | "es";

function loc(locale: string | null | undefined): Loc {
  return (locale ?? "").trim().toLowerCase().startsWith("es") ? "es" : "en";
}

/** "45 min", "1 h", "1 h 30 min". Null for a missing or non-positive value. */
export function formatDurationLabel(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Whole minutes between two instants; null when either is missing or the span is not positive. */
export function minutesBetween(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): number | null {
  if (!startsAt || !endsAt) return null;
  const a = new Date(startsAt).getTime();
  const b = new Date(endsAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.round((b - a) / 60_000);
}

/**
 * The free-cancellation promise in words. `hours` is the effective window the
 * booking runs under (null = no window known, so nothing is claimed).
 */
export function formatCancellationPolicy(
  hours: number | null | undefined,
  locale: string | null | undefined,
): string | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  const es = loc(locale) === "es";
  if (hours === 0) {
    return es ? "Cancelación gratis hasta el inicio de la cita." : "Free cancellation until the appointment starts.";
  }
  if (hours % 24 === 0) {
    const d = hours / 24;
    return es
      ? `Cancelación gratis hasta ${d} ${d === 1 ? "día" : "días"} antes.`
      : `Free cancellation up to ${d} ${d === 1 ? "day" : "days"} before.`;
  }
  return es ? `Cancelación gratis hasta ${hours} h antes.` : `Free cancellation up to ${hours} h before.`;
}

/** "GMT-5", "CST" or the IANA id: the zone the appointment time is written in. */
export function timeZoneLabel(
  startsAt: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string | null | undefined,
): string | null {
  const tz = timeZone?.trim();
  if (!tz || !startsAt) return null;
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat(loc(locale), { timeZone: tz, timeZoneName: "short" }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return null;
  }
}

/** The address line: street address first, then the free-text place; blank parts dropped. */
export function pickAddress(parts: {
  inquiryLocation?: string | null;
  venueAddress?: string | null;
  venueLocationText?: string | null;
}): string | null {
  for (const v of [parts.venueAddress, parts.venueLocationText, parts.inquiryLocation]) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

export type BookingCalendarInput = {
  bookingId: string;
  serviceName: string | null;
  sellerName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  address: string | null;
  policyLabel: string | null;
  url: string | null;
  locale: string | null;
};

export type CalendarAttachment = { filename: string; content: Buffer; contentType: string };

/**
 * The ONE calendar file of a confirmation. Null when the booking has no start
 * (a date-only request has no instant to put in a calendar). The end falls back
 * to start + duration, then to one hour.
 */
export function buildBookingCalendarAttachment(input: BookingCalendarInput): CalendarAttachment | null {
  if (!input.startsAt) return null;
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  let end = input.endsAt ? new Date(input.endsAt) : null;
  if (!end || Number.isNaN(end.getTime()) || end <= start) {
    const mins = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : 60;
    end = new Date(start.getTime() + mins * 60_000);
  }
  const es = loc(input.locale) === "es";
  const summary = [input.serviceName, input.sellerName].filter(Boolean).join(" · ") || (es ? "Reserva" : "Booking");
  const duration = formatDurationLabel(input.durationMinutes);
  const description = [
    input.serviceName ? `${es ? "Servicio" : "Service"}: ${input.serviceName}` : null,
    duration ? `${es ? "Duración" : "Duration"}: ${duration}` : null,
    input.policyLabel,
  ]
    .filter(Boolean)
    .join("\n");
  const content = buildIcsEvent({
    uid: input.bookingId,
    summary,
    description: description || undefined,
    location: input.address ?? undefined,
    startsAt: start,
    endsAt: end,
    url: input.url ?? undefined,
  });
  return {
    filename: es ? "reserva.ics" : "booking.ics",
    content: Buffer.from(content, "utf8"),
    contentType: "text/calendar; charset=utf-8; method=PUBLISH",
  };
}
