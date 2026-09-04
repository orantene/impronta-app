/**
 * confirmation.ts — what a guest is told after they book, in their language.
 *
 * A GUEST WHO BOOKS AND RECEIVES NOTHING HAS NOT FINISHED BOOKING. This is the
 * last gap between a merged code path and something a real customer
 * experiences, which is why the content is a tested module rather than a
 * template literal inside a mailer.
 *
 * EVERY TIME IN HERE IS THE VENUE'S WALL CLOCK, NEVER UTC AND NEVER THE
 * GUEST'S. A diner in Mexico City booking a table in Tulum must read 20:00,
 * because that is what the door will say. Rendering a stored instant without a
 * zone is the single most likely bug in this file, so the zone is a REQUIRED
 * argument with no default: there is no sensible fallback, and a silent UTC one
 * would be wrong by exactly the amount nobody notices until someone misses a
 * table.
 *
 * THE CANCELLATION DEADLINE IS COMPUTED ON THE INSTANT, then rendered in the
 * venue's clock. Subtracting hours from a wall clock lands an hour out across a
 * DST boundary, which is the same rule the whole area runs on.
 *
 * `en` AND `es`, and no em dashes in guest-facing copy.
 *
 * PURE. No DB, no mailer, no clock of its own.
 */

export type ConfirmationLocale = "en" | "es";

export type ConfirmationInput = {
  locale: ConfirmationLocale;
  venueName: string;
  /** IANA zone. REQUIRED: there is no correct default. */
  timeZone: string;
  guestName: string | null;
  partySize: number;
  startsAt: Date;
  /** Integer cents taken now. 0 when nothing was charged. */
  collectedCents: number;
  /** Whether a card was stored against a no-show. */
  cardOnFile: boolean;
  /** Hours before the seating that a cancellation is still free. */
  freeCancelHours: number;
  /** Minutes the table is held past the time before it may be released. */
  graceMinutes: number;
  addressLine: string | null;
};

export type ConfirmationContent = {
  subject: string;
  heading: string;
  /** "Friday 5 September" and "20:00", both in the venue's clock. */
  whenDate: string;
  whenTime: string;
  lines: string[];
};

const MONEY = (cents: number, locale: ConfirmationLocale): string => {
  const amount = (cents / 100).toFixed(2);
  return locale === "es" ? `$${amount}` : `$${amount}`;
};

function partsIn(instant: Date, timeZone: string, locale: ConfirmationLocale) {
  const tag = locale === "es" ? "es-MX" : "en-GB";
  try {
    const date = new Intl.DateTimeFormat(tag, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(instant);
    const time = new Intl.DateTimeFormat(tag, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
    return { date, time };
  } catch {
    // An unknown zone must not silently become UTC. The caller gets nulls and
    // decides; a confirmation with a wrong time is worse than one that is held.
    return null;
  }
}

/**
 * The confirmation, or `null` when the venue's zone will not resolve.
 *
 * Returning null rather than falling back is deliberate: a confirmation naming
 * the wrong hour is worse than one that did not send, because the guest acts on
 * it and arrives when the restaurant is shut.
 */
export function buildConfirmation(input: ConfirmationInput): ConfirmationContent | null {
  const when = partsIn(input.startsAt, input.timeZone, input.locale);
  if (!when) return null;

  const es = input.locale === "es";
  const name = input.guestName?.trim() || null;
  const covers = input.partySize;

  // Computed on the INSTANT, rendered in the venue's clock. Subtracting hours
  // from a wall clock lands an hour out across a DST boundary.
  const deadlineInstant = new Date(
    input.startsAt.getTime() - input.freeCancelHours * 3_600_000,
  );
  const deadline = partsIn(deadlineInstant, input.timeZone, input.locale);

  const lines: string[] = [];

  lines.push(
    es
      ? `Mesa para ${covers} en ${input.venueName}.`
      : `A table for ${covers} at ${input.venueName}.`,
  );
  lines.push(es ? `${when.date} a las ${when.time}.` : `${when.date} at ${when.time}.`);

  if (input.addressLine) lines.push(input.addressLine);

  // The hold, said plainly. A guest who does not know the table is released
  // after fifteen minutes is a guest who arrives at 20:25 expecting it.
  lines.push(
    es
      ? `Guardamos la mesa ${input.graceMinutes} minutos.`
      : `We hold the table for ${input.graceMinutes} minutes.`,
  );

  // Money, and the honest version of "nothing was charged".
  if (input.collectedCents > 0) {
    lines.push(
      es
        ? `Deposito de ${MONEY(input.collectedCents, "es")}, que se descuenta de la cuenta.`
        : `Deposit of ${MONEY(input.collectedCents, "en")}, applied to your bill.`,
    );
  } else if (input.cardOnFile) {
    // Says what will NOT happen first. A guest who reads "we have your card"
    // without reading "nothing is charged" phones the restaurant.
    lines.push(
      es
        ? "No se cobro nada. Guardamos tu tarjeta solo por si no llegas y no cancelas a tiempo."
        : "Nothing was charged. We hold your card only in case you do not arrive and do not cancel in time.",
    );
  } else {
    lines.push(es ? "No hay nada que pagar ahora." : "Nothing to pay now.");
  }

  if (deadline) {
    lines.push(
      es
        ? `Puedes cancelar sin costo hasta el ${deadline.date} a las ${deadline.time}.`
        : `Free to cancel until ${deadline.date} at ${deadline.time}.`,
    );
  }

  return {
    subject: es
      ? `Tu mesa en ${input.venueName}, ${when.date} a las ${when.time}`
      : `Your table at ${input.venueName}, ${when.date} at ${when.time}`,
    heading: name
      ? es
        ? `Listo, ${name}.`
        : `You are booked, ${name}.`
      : es
        ? "Listo."
        : "You are booked.",
    whenDate: when.date,
    whenTime: when.time,
    lines,
  };
}
