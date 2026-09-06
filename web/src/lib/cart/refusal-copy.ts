/**
 * refusal-copy.ts — what a person reads when a purchase is refused.
 *
 * `createPurchase` returns eighteen machine reasons and the capacity engine
 * returns eight more. NONE of them may reach a customer. "sold_out" is nearly
 * readable and "ancestor_full" is not English at all; a person meeting either
 * on a checkout screen has been shown the inside of the machine.
 *
 * THE RULE THIS ENCODES
 * ─────────────────────
 * Say the true thing, at the vaguest level that is still actionable. Two
 * failure modes to avoid, and they pull in opposite directions:
 *
 *   Too specific and sometimes false. `ancestor_full` means "something above
 *   this is committed" — a buyout, a closure, a private event. Rendering "taken
 *   by a private event" is a claim we often cannot support, and a customer who
 *   later learns the room was merely closed was told something untrue.
 *
 *   Too vague and not actionable. "Something went wrong" tells a person nothing
 *   about whether to try again, pick another time, or give up. Every line below
 *   implies a next move.
 *
 * The distinction that matters most: an ABSENCE ("that is gone, choose
 * differently") versus a FAULT ("we failed, try again"). Telling someone to
 * pick another time when our engine was simply unreachable sends them hunting
 * for a problem that is ours.
 *
 * NOT in the words table, deliberately. These are sentences, not nouns, and a
 * tenant renaming "table" to "court" must not be able to rewrite the sentence
 * that explains a refusal — that is where a well-meant edit becomes a false
 * statement about someone's money. The NOUNS inside them come from the words
 * layer; the sentences do not.
 */

import type { WordLocale } from "@/lib/words";

/** Every reason `createPurchase` can return, plus the capacity engine's. */
export type RefusalReason =
  | "empty_order"
  | "unknown_offering"
  | "offering_not_published"
  | "cross_tenant_line"
  | "account_required"
  | "pay_in_person_not_allowed"
  | "deposit_not_offered"
  | "invalid_units"
  | "invalid_payment_choice"
  | "offering_not_priceable"
  | "variant_not_on_offering"
  | "addon_not_on_offering"
  | "amount_out_of_range"
  | "no_contact"
  | "sold_out"
  | "slot_taken"
  | "slot_required"
  | "promo_unknown"
  | "promo_not_started"
  | "promo_expired"
  | "promo_exhausted"
  | "promo_customer_limit"
  | "promo_not_applicable"
  | "promo_unavailable"
  | "session_already_ended"
  | "capacity_unavailable"
  | "engine_error"
  // Capacity engine refusals, surfaced through the same path.
  | "ancestor_full"
  | "pool_not_found"
  | "pool_inactive"
  | "invalid_window"
  | "invalid_ttl"
  | "empty_batch";

/** Can the person fix this by trying again, or must they change something? */
export type RefusalKind = "absence" | "fault" | "input";

export type RefusalCopy = {
  readonly kind: RefusalKind;
  readonly en: string;
  readonly es: string;
};

const COPY: Readonly<Record<RefusalReason, RefusalCopy>> = {
  // ── Absence: the thing is gone. Choose differently. ──────────────────────
  sold_out: {
    kind: "absence",
    en: "That is sold out.",
    es: "Eso está agotado.",
  },
  // NOT `sold_out`, and the difference is the whole sentence. Seats remain;
  // someone else simply holds this time. Telling this person "sold out" would
  // send a paying customer away from a business that can still serve them, so
  // the copy points at the one thing that fixes it: another time.
  slot_taken: {
    kind: "absence",
    en: "Someone just took that time. Please pick another one.",
    es: "Alguien acaba de tomar ese horario. Elige otro.",
  },
  // Reached when a timed offering arrives with no slot — a caller bug, or a
  // stale tab whose picker never ran. Either way the person did nothing wrong
  // and the fix is theirs to make, so this is `input` rather than `fault`.
  slot_required: {
    kind: "input",
    en: "Please choose a time before you book.",
    es: "Elige un horario antes de reservar.",
  },
  ancestor_full: {
    kind: "absence",
    // Deliberately does NOT say why. The engine knows something above this is
    // committed; it does not know whether that is a buyout, a private event or
    // a closure, and naming the wrong one is a false statement to a customer.
    // Capacity's own framing is "the table is empty and you still cannot sit at
    // it" — true, and the honest customer-facing version is simply that the
    // time is not available.
    en: "That time is not available. Please pick another.",
    es: "Ese horario no está disponible. Elige otro.",
  },
  pool_inactive: {
    kind: "absence",
    en: "That is not being offered right now.",
    es: "Eso no se está ofreciendo en este momento.",
  },
  offering_not_published: {
    kind: "absence",
    en: "That is no longer available.",
    es: "Eso ya no está disponible.",
  },

  // ── Input: the person can change something and continue. ────────────────
  account_required: {
    kind: "input",
    en: "Please sign in to book this one.",
    es: "Inicia sesión para reservar esto.",
  },
  no_contact: {
    kind: "input",
    en: "We need an email or a phone number to send your confirmation.",
    es: "Necesitamos un correo o un teléfono para enviarte la confirmación.",
  },
  pay_in_person_not_allowed: {
    kind: "input",
    en: "This one is paid online. Please choose a card.",
    es: "Esto se paga en línea. Elige una tarjeta.",
  },
  deposit_not_offered: {
    kind: "input",
    en: "This one is paid in full. Please choose that instead.",
    es: "Esto se paga completo. Elige esa opción.",
  },
  invalid_units: {
    kind: "input",
    en: "Please choose a quantity of at least one.",
    es: "Elige una cantidad de al menos uno.",
  },
  empty_order: {
    kind: "input",
    en: "There is nothing in your order yet.",
    es: "Todavía no hay nada en tu pedido.",
  },
  invalid_window: {
    kind: "input",
    en: "That time does not look right. Please pick another.",
    es: "Ese horario no es válido. Elige otro.",
  },

  // ── Fault: ours. Retrying is the right advice. ───────────────────────────
  // Everything below is a bug, a race or an outage. A person must never be
  // sent hunting for a problem that is not theirs, so none of these suggest
  // changing the order.
  // ── Promo codes. A buyer who typed a code is OWED a reason: the purchase
  // refuses rather than charging full price, so this copy is the only thing
  // standing between them and a screen that says no without saying why.
  promo_unknown: {
    kind: "input",
    en: "We do not recognise that code.",
    es: "No reconocemos ese código.",
  },
  // "It starts Friday" and "it ended Sunday" are the two things most worth
  // telling someone holding a code that is otherwise perfect.
  promo_not_started: {
    kind: "absence",
    en: "That code is not active yet.",
    es: "Ese código aún no está activo.",
  },
  promo_expired: {
    kind: "absence",
    en: "That code has expired.",
    es: "Ese código ya venció.",
  },
  promo_exhausted: {
    kind: "absence",
    en: "That code has been fully claimed.",
    es: "Ese código ya se agotó.",
  },
  // Distinct from exhausted on purpose: the code is alive and someone else can
  // still use it. Telling this person it is "used up" would be false.
  promo_customer_limit: {
    kind: "absence",
    en: "You have already used that code.",
    es: "Ya usaste ese código.",
  },
  promo_not_applicable: {
    kind: "input",
    en: "That code does not apply to this order.",
    es: "Ese código no aplica a este pedido.",
  },
  // OURS, not theirs. The code may be perfectly good; we could not check it.
  promo_unavailable: {
    kind: "fault",
    en: "We could not check that code just now. Please try again.",
    es: "No pudimos verificar ese código. Inténtalo de nuevo.",
  },
  // Absence, not fault: the thing is genuinely over. Says WHICH thing ended so
  // a buyer who picked the wrong date can pick another.
  session_already_ended: {
    kind: "absence",
    en: "That session has already ended.",
    es: "Esa sesión ya terminó.",
  },
  capacity_unavailable: {
    kind: "fault",
    en: "We could not confirm availability just now. Please try again.",
    es: "No pudimos confirmar la disponibilidad. Inténtalo de nuevo.",
  },
  engine_error: {
    kind: "fault",
    en: "Something went wrong on our side. Please try again.",
    es: "Algo falló de nuestro lado. Inténtalo de nuevo.",
  },
  unknown_offering: {
    kind: "fault",
    en: "We could not find that item. Please try again.",
    es: "No encontramos ese artículo. Inténtalo de nuevo.",
  },
  cross_tenant_line: {
    kind: "fault",
    en: "Something went wrong on our side. Please try again.",
    es: "Algo falló de nuestro lado. Inténtalo de nuevo.",
  },
  invalid_payment_choice: {
    kind: "fault",
    en: "That payment option is not available. Please try again.",
    es: "Esa forma de pago no está disponible. Inténtalo de nuevo.",
  },
  offering_not_priceable: {
    kind: "fault",
    en: "We could not price that. Please message us and we will sort it.",
    es: "No pudimos calcular ese precio. Escríbenos y lo resolvemos.",
  },
  variant_not_on_offering: {
    kind: "fault",
    en: "That option is not available. Please try again.",
    es: "Esa opción no está disponible. Inténtalo de nuevo.",
  },
  addon_not_on_offering: {
    kind: "fault",
    en: "That extra is not available. Please try again.",
    es: "Ese extra no está disponible. Inténtalo de nuevo.",
  },
  amount_out_of_range: {
    kind: "fault",
    en: "We could not take that amount. Please message us and we will sort it.",
    es: "No pudimos procesar ese monto. Escríbenos y lo resolvemos.",
  },
  pool_not_found: {
    kind: "fault",
    en: "We could not confirm availability just now. Please try again.",
    es: "No pudimos confirmar la disponibilidad. Inténtalo de nuevo.",
  },
  invalid_ttl: {
    kind: "fault",
    en: "Something went wrong on our side. Please try again.",
    es: "Algo falló de nuestro lado. Inténtalo de nuevo.",
  },
  empty_batch: {
    kind: "fault",
    en: "Something went wrong on our side. Please try again.",
    es: "Algo falló de nuestro lado. Inténtalo de nuevo.",
  },
};

/**
 * The sentence to show for a refusal.
 *
 * Falls back to the generic fault line for anything unrecognised, because a new
 * reason added upstream must degrade to "our fault, try again" rather than
 * leaking its own identifier onto a checkout screen. That fallback is the
 * whole point: this file will go out of date, and it must fail safely when it
 * does.
 */
export function refusalCopy(reason: string, locale: WordLocale): string {
  const entry = COPY[reason as RefusalReason];
  if (!entry) return COPY.engine_error[locale];
  return entry[locale];
}

/** Absence, input or fault. Drives whether the Sheet offers a retry. */
export function refusalKind(reason: string): RefusalKind {
  return COPY[reason as RefusalReason]?.kind ?? "fault";
}

/** Every reason this module knows. Exported so a test can prove coverage. */
export const KNOWN_REFUSAL_REASONS = Object.keys(COPY) as RefusalReason[];
