/**
 * reminder-copy.ts — what "your class is tomorrow" actually says.
 *
 * PURE and tested, following `lib/reservations/confirmation.ts`: the copy is a
 * function, not a template's innards, so **the email and any future receipt or
 * /me page can call the same one.** Two surfaces generating their own wording
 * is how a customer is told two different times by two things that both look
 * official.
 *
 *
 * THE TIME IS THE VENUE'S, ALWAYS
 * ═══════════════════════════════
 * A class happens where it happens. Rendering it in the reader's zone tells
 * somebody in Madrid a Tulum class starts at 03:00 — a plausible wrong answer
 * they will act on. So the zone is required, not optional, and there is no
 * fallback: `buildSessionReminder` returns null without one rather than
 * guessing, exactly as the sweep refuses to send without one.
 *
 * The zone is also NAMED in the copy. "18:00" alone is ambiguous to anyone
 * reading it somewhere else, and a customer who has to work out which clock a
 * time is in has already been failed.
 */

export type ReminderLocale = "en" | "es";

export type SessionReminderInput = {
  /** Absolute instant of the session start. */
  startsAt: string;
  /** The venue's CONFIRMED IANA zone. Required — see the header. */
  timeZone: string;
  /** The class's own name, as the schedule shows it. */
  title: string;
  venueName?: string | null;
  locale?: string;
};

export type SessionReminderCopy = {
  subject: string;
  heading: string;
  lines: string[];
};

function pickLocale(raw?: string): ReminderLocale {
  return raw?.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * "Sat 12 Sep, 18:00" in the venue's clock, with the zone named.
 *
 * Returns null when the zone is unusable rather than falling back to UTC. A
 * reminder that names the wrong hour is worse than no reminder: the second is
 * visible to the operator who expected it, the first is visible to nobody until
 * somebody misses a class.
 */
function formatWhen(
  startsAt: string,
  timeZone: string,
  locale: ReminderLocale,
): { when: string; zone: string } | null {
  const at = new Date(startsAt);
  if (!Number.isFinite(at.getTime())) return null;
  try {
    const when = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    return { when, zone: timeZone };
  } catch {
    return null;
  }
}

const COPY: Record<ReminderLocale, {
  subject: (title: string) => string;
  heading: (title: string) => string;
  at: (when: string, zone: string) => string;
  where: (venue: string) => string;
  closing: string;
}> = {
  en: {
    subject: (title) => `Tomorrow: ${title}`,
    heading: (title) => `${title} is tomorrow.`,
    at: (when, zone) => `${when} (${zone})`,
    where: (venue) => `At ${venue}.`,
    closing: "See you there. Reply to this email if you cannot make it.",
  },
  es: {
    subject: (title) => `Manana: ${title}`,
    heading: (title) => `${title} es manana.`,
    at: (when, zone) => `${when} (${zone})`,
    where: (venue) => `En ${venue}.`,
    closing: "Nos vemos. Responde a este correo si no puedes asistir.",
  },
};

/**
 * The reminder's subject, heading and body lines — or null when it cannot be
 * said correctly.
 *
 * A null is a REFUSAL, not an empty email. The caller must send nothing rather
 * than send something with a missing time in it.
 */
export function buildSessionReminder(
  input: SessionReminderInput,
): SessionReminderCopy | null {
  const locale = pickLocale(input.locale);
  const c = COPY[locale];

  const title = input.title.trim();
  if (!title) return null;
  if (!input.timeZone || !input.timeZone.trim()) return null;

  const formatted = formatWhen(input.startsAt, input.timeZone.trim(), locale);
  if (!formatted) return null;

  const lines: string[] = [c.at(formatted.when, formatted.zone)];
  const venue = input.venueName?.trim();
  if (venue) lines.push(c.where(venue));
  lines.push(c.closing);

  return {
    subject: c.subject(title),
    heading: c.heading(title),
    lines,
  };
}
