/**
 * Booking record copy (F61, F62). Pure so the strings are testable.
 */

/**
 * F61: the record's When with its date: "Sat, Oct 3 · 10:00 – 10:30 AM Cancun"
 * (es: "sáb, 3 oct · 10:00–10:30 a.m. Cancun"). Null when the times are unusable.
 */
export function recordWhenLabel(input: {
  startsAt: string | null | undefined;
  endsAt: string | null | undefined;
  tz: string | null | undefined;
  locale: "en" | "es";
}): string | null {
  const start = input.startsAt ? new Date(input.startsAt) : null;
  const end = input.endsAt ? new Date(input.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const tz = input.tz || undefined;
  const lang = input.locale === "es" ? "es-MX" : "en-US";
  let day: string;
  let time: string;
  try {
    day = new Intl.DateTimeFormat(lang, { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(start);
    const timeFmt = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", timeZone: tz });
    time = end && !Number.isNaN(end.getTime()) ? timeFmt.formatRange(start, end) : timeFmt.format(start);
  } catch {
    return null;
  }
  const city = input.tz ? input.tz.split("/").pop()?.replace(/_/g, " ") ?? "" : "";
  return `${day} · ${time}${city ? ` ${city}` : ""}`;
}

/** F62: where a booking came from, as English copy keys (translated at render). */
const SOURCE_COPY: Record<string, string> = {
  manual: "Added by you",
  direct: "Direct",
  website: "Your website",
  site: "Your website",
  qr: "QR code",
  tulala: "Tulala",
  agency: "Agency",
  messages: "Messages",
  counter: "At the counter",
};

/** A known source value becomes copy; anything else (an agency's name) is shown as is. */
export function recordSourceLabel(value: string | null | undefined): string {
  const key = (value ?? "").trim();
  if (!key) return "Direct";
  return SOURCE_COPY[key.toLowerCase()] ?? key;
}
