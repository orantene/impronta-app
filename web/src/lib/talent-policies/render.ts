/**
 * Deterministic policy text: (facts, answers, locale) -> numbered clauses.
 * Pure. The same inputs always give the same text, which is what lets a content
 * hash stand for "version N". No em dashes, no legal name (D2), no exact
 * address (D4). Tulala's own documents are linked off-host (D3).
 */

import type { PolicyAnswers } from "./answers";
import type { InPersonMethod, PolicyFacts, WorkPlace } from "./facts";

export type PolicyLocale = "es" | "en";

export type PolicyClause = { n: number; title: string; body: string };

export type RenderedPolicy = {
  locale: PolicyLocale;
  clauses: PolicyClause[];
  /** Plain text, one block per clause, for the stored snapshot. */
  text: string;
};

/** Bump when the wording changes, so the hash moves with the template. */
export const POLICY_TEMPLATE_VERSION = 2;

/** D3: Tulala's own documents open off-host. */
export const TULALA_DOC_LINKS = {
  terms: "https://tulala.digital/legal/terms",
  privacy: "https://tulala.digital/legal/privacy",
} as const;

const METHOD_LABEL: Record<PolicyLocale, Record<InPersonMethod, string>> = {
  en: { cash: "cash", transfer: "bank transfer", card_terminal: "card on their own terminal" },
  es: { cash: "efectivo", transfer: "transferencia", card_terminal: "tarjeta en su terminal" },
};

function list(items: string[], locale: PolicyLocale): string {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  const head = items.slice(0, -1).join(", ");
  return `${head} ${locale === "es" ? "o" : "or"} ${last}`;
}

function nameOf(facts: PolicyFacts, locale: PolicyLocale): string {
  return facts.displayName || (locale === "es" ? "tu profesional" : "your professional");
}

function placeSentence(places: WorkPlace[], zone: string | null, name: string, locale: PolicyLocale): string {
  const es = locale === "es";
  const parts: string[] = [];
  if (places.includes("studio")) {
    parts.push(zone ? (es ? `en su estudio, en la zona de ${zone}` : `at the studio, in the ${zone} area`) : es ? "en su estudio" : "at the studio");
  }
  if (places.includes("client")) parts.push(es ? "en el lugar que tú elijas" : "at your place");
  if (places.includes("remote")) parts.push(es ? "en línea" : "online");
  const where = list(parts, locale);
  return es ? `${name} atiende ${where}.` : `${name} works ${where}.`;
}

/**
 * Late cancel and no-show sentences. They must agree with the deposit clause:
 * with no deposit nothing is held, so nothing is returned or kept; with a
 * partial deposit the answer is about the deposit; with everything paid up
 * front it is about what was paid. Only what the platform does is promised.
 */
export function lateClauseSentences(
  facts: PolicyFacts,
  answers: PolicyAnswers,
  locale: PolicyLocale,
  windowWords: string,
): { late: string; noShow: string } {
  const es = locale === "es";
  const name = nameOf(facts, locale);
  if (facts.depositPct == null) {
    return {
      late: es ? `Si cancelas ${windowWords}, no se te cobra nada.` : `If you cancel ${windowWords}, nothing is charged.`,
      noShow: es
        ? `Si no te presentas, tampoco se cobra nada, pero ${name} puede pedir un anticipo en tu próxima reserva.`
        : `If you do not show up, nothing is charged either, but ${name} may ask for a deposit on your next booking.`,
    };
  }
  const paidAll = facts.depositPct >= 100;
  const what = paidAll ? (es ? "lo pagado" : "what you paid") : es ? "el anticipo" : "the deposit";
  const half = paidAll ? (es ? "la mitad de lo pagado" : "half of what you paid") : es ? "la mitad del anticipo" : "half of the deposit";
  const mode = answers.late_cancel_refund;
  const late =
    mode === "full"
      ? es ? `Si cancelas ${windowWords}, se te devuelve todo lo pagado.` : `If you cancel ${windowWords}, everything you paid is returned.`
      : mode === "half"
        ? es ? `Si cancelas ${windowWords}, se devuelve ${half}.` : `If you cancel ${windowWords}, ${half} is returned.`
        : es ? `Si cancelas ${windowWords}, ${what} no se devuelve.` : `If you cancel ${windowWords}, ${what} is not returned.`;
  const noShow = es ? `Si no te presentas a la cita, ${what} no se devuelve.` : `If you do not show up, ${what} is not returned.`;
  return { late, noShow };
}

function clauses(facts: PolicyFacts, answers: PolicyAnswers, locale: PolicyLocale): Array<Omit<PolicyClause, "n">> {
  const es = locale === "es";
  const name = nameOf(facts, locale);
  const out: Array<Omit<PolicyClause, "n">> = [];

  // Booking and deposit.
  out.push({
    title: es ? "Reserva y anticipo" : "Booking and deposit",
    body:
      facts.depositPct != null
        ? es
          ? `Al reservar se paga un anticipo del ${facts.depositPct}% del precio. El resto se paga en la cita.`
          : `A deposit of ${facts.depositPct}% of the price is paid when you book. The rest is paid at the appointment.`
        : es
          ? "Al reservar no se pide anticipo. Todo se paga en la cita."
          : "No deposit is asked when you book. Everything is paid at the appointment.",
  });

  // Paying in person.
  if (facts.inPersonMethods.length > 0) {
    const methods = list(
      facts.inPersonMethods.map((m) => METHOD_LABEL[locale][m]),
      locale,
    );
    out.push({
      title: es ? "Pago en persona" : "Paying in person",
      body: es ? `En la cita puedes pagar con ${methods}.` : `At the appointment you can pay with ${methods}.`,
    });
  }

  // Cancelling and changes.
  out.push({
    title: es ? "Cancelación y cambios" : "Cancelling and changes",
    body:
      facts.cancelHours != null
        ? es
          ? `Puedes cancelar sin costo hasta ${facts.cancelHours} horas antes de la cita. Para cambiar la cita, escribe a ${name}.`
          : `You can cancel free of charge up to ${facts.cancelHours} hours before the appointment. To change it, write to ${name}.`
        : es
          ? `La cancelación es flexible. Para cancelar o cambiar la cita, escribe a ${name}.`
          : `Cancelling is flexible. To cancel or change the appointment, write to ${name}.`,
  });

  // Late cancellation and no-show (only meaningful when a window or deposit exists).
  if (facts.cancelHours != null || facts.depositPct != null) {
    const windowWords = facts.cancelHours != null ? (es ? `dentro de las ${facts.cancelHours} horas previas` : `inside the ${facts.cancelHours} hours before`) : es ? "tarde" : "late";
    const { late, noShow } = lateClauseSentences(facts, answers, locale, windowWords);
    out.push({
      title: es ? "Cancelación tardía y ausencia" : "Late cancellation and no-show",
      body: `${late} ${noShow}`,
    });
  }

  // Late arrival.
  out.push({
    title: es ? "Llegada tarde" : "Arriving late",
    body:
      answers.late_tolerance_min > 0
        ? es
          ? `Hay ${answers.late_tolerance_min} minutos de tolerancia. Pasado ese tiempo, ${name} puede acortar la cita o pedirte reprogramarla.`
          : `There are ${answers.late_tolerance_min} minutes of tolerance. After that, ${name} may shorten the appointment or ask you to reschedule.`
        : es
          ? "Por favor llega puntual. Si llegas tarde, la cita puede acortarse."
          : "Please arrive on time. If you are late, the appointment may be shortened.",
  });

  // Where she works (approximate zone only).
  out.push({
    title: es ? "Dónde trabaja" : "Where the work happens",
    body: placeSentence(facts.where, facts.zone, name, locale),
  });

  // Contact.
  const channels: string[] = [];
  if (facts.contact.chat) channels.push(es ? "el chat de este sitio" : "the chat on this site");
  if (facts.contact.whatsapp) channels.push("WhatsApp");
  if (facts.contact.email) channels.push(es ? "correo" : "email");
  out.push({
    title: es ? "Contacto" : "Contact",
    body:
      channels.length > 0
        ? es
          ? `Puedes escribir a ${name} por ${list(channels, locale)}.`
          : `You can reach ${name} through ${list(channels, locale)}.`
        : es
          ? `Usa el formulario de este sitio para escribir a ${name}.`
          : `Use the form on this site to write to ${name}.`,
  });

  // Tulala's own documents, off-host.
  out.push({
    title: es ? "Pagos y datos personales" : "Payments and personal data",
    body: es
      ? `Los pagos y los datos personales se manejan a través de Tulala. Términos: ${TULALA_DOC_LINKS.terms} Privacidad: ${TULALA_DOC_LINKS.privacy}`
      : `Payments and personal data are handled through Tulala. Terms: ${TULALA_DOC_LINKS.terms} Privacy: ${TULALA_DOC_LINKS.privacy}`,
  });

  return out;
}

export function renderPolicyText(facts: PolicyFacts, answers: PolicyAnswers, locale: PolicyLocale): RenderedPolicy {
  const numbered: PolicyClause[] = clauses(facts, answers, locale).map((c, i) => ({ n: i + 1, ...c }));
  const text = numbered.map((c) => `${c.n}. ${c.title}\n${c.body}`).join("\n\n");
  return { locale, clauses: numbered, text };
}

export type ClauseChange = { title: string; before: string | null; after: string | null };

/** Clause-level diff of two rendered texts (by title). Unchanged clauses are omitted. */
export function diffPolicyText(before: string | null, after: string): ClauseChange[] {
  const parse = (text: string | null): Map<string, string> => {
    const map = new Map<string, string>();
    if (!text) return map;
    for (const block of text.split("\n\n")) {
      const nl = block.indexOf("\n");
      if (nl < 0) continue;
      map.set(block.slice(0, nl).replace(/^\d+\.\s*/, ""), block.slice(nl + 1));
    }
    return map;
  };
  const a = parse(before);
  const b = parse(after);
  const changes: ClauseChange[] = [];
  for (const [title, body] of b) {
    const prev = a.get(title) ?? null;
    if (prev !== body) changes.push({ title, before: prev, after: body });
  }
  for (const [title, body] of a) {
    if (!b.has(title)) changes.push({ title, before: body, after: null });
  }
  return changes;
}
