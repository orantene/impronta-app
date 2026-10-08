/**
 * The language a booking was made in (TUL-93).
 *
 * PURE. The guest browses a talent site in one language; the confirmation they
 * get must be in that language, not the workspace default. The locale is
 * stamped on the inquiry (`source_context.locale`) at booking time, so both the
 * free path (emitted from the action) and the paid path (emitted from the
 * Stripe webhook, with no request) read the same value.
 *
 * Only the two shipped email locales are kept; anything else is "unknown" so
 * the caller falls through to the next source instead of guessing.
 */

export type BookingLocale = "en" | "es";

export function normalizeBookingLocale(raw: unknown): BookingLocale | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v.startsWith("es")) return "es";
  if (v.startsWith("en")) return "en";
  return null;
}

/**
 * Order: the locale the guest was browsing in, then the talent's preferred
 * locale, then the platform default.
 */
export function resolveBookingLocale(input: {
  browsing?: string | null;
  talentPreferred?: string | null;
  platformDefault?: string | null;
}): BookingLocale {
  return (
    normalizeBookingLocale(input.browsing) ??
    normalizeBookingLocale(input.talentPreferred) ??
    normalizeBookingLocale(input.platformDefault) ??
    "en"
  );
}

/**
 * "mié 14 oct, 13:30 - 14:30" in the talent's own clock (TUL-93). The stored
 * `starts_at`/`ends_at` are the REAL appointment (buffers are kept apart), so
 * this is what the guest picked. An unknown zone falls back to UTC rather than
 * throwing inside a notification render.
 */
export function formatAppointmentWhen(input: {
  startsAt: string;
  endsAt?: string | null;
  timeZone?: string | null;
  locale?: string | null;
}): string | null {
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const loc = normalizeBookingLocale(input.locale) ?? "en";
  const tryFormat = (timeZone: string): string => {
    const day = new Intl.DateTimeFormat(loc, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(start);
    const clock = new Intl.DateTimeFormat(loc, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    const end = input.endsAt ? new Date(input.endsAt) : null;
    const range =
      end && !Number.isNaN(end.getTime())
        ? `${clock.format(start)} - ${clock.format(end)}`
        : clock.format(start);
    return `${day}, ${range}`;
  };
  try {
    return tryFormat(input.timeZone?.trim() || "UTC");
  } catch {
    return tryFormat("UTC");
  }
}
