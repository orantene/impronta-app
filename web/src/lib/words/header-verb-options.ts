/**
 * header-verb-options.ts — the header button as a VERB, not free text. F1e.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * The site-header inspector offers a free-text "Link" field hinted with
 * "A path like /contact, or a full web address." On an agency host `/contact`
 * is a CMS clean URL that 404s until the operator creates that page, so the
 * hint's own example is a dead link on most workspaces. Every route a person
 * would reasonably type — /reserve, /menu, /shop, /tickets — is dead for the
 * same reason. F1a spent a whole PR removing exactly these from the thirteen
 * page designs; the header is the one button every storefront renders, and it
 * was still free text.
 *
 * So the operator picks a VERB and the destination comes from here. The
 * primary call to action on a tenant site then cannot point at a route that
 * does not exist, because no verb maps to one.
 *
 * WHY THE DESTINATIONS ARE SO FEW
 * ───────────────────────────────
 * Only two paths resolve on every workspace type today:
 *
 *   /book           allow-listed in AGENCY_STOREFRONT_PREFIXES for every
 *                   workspace type, so it renders on day one.
 *   ?inquiry=open   the chat cue. Path-relative, so `prefixPublicHref` leaves
 *                   it alone on apex and path-prefixed tenants alike, and it
 *                   needs no route and no seeded page.
 *
 * `order` and `tickets` therefore point at the CHAT rather than at /menu or
 * /tickets, because those routes do not exist yet. That is deliberate and it is
 * the honest answer: a button that opens a conversation about ordering is true,
 * and a button that 404s is not. When Menu and Events ship real public routes,
 * this map changes in ONE place and every tenant's header follows.
 *
 * `custom` is the single escape hatch and the only verb carrying an operator
 * href. It exists because an operator may legitimately link somewhere we do not
 * know about, and removing that would be worse than the problem.
 *
 * THE LABEL IS NOT HERE. It comes from `resolveWords` through
 * `presetHeaderVerbLabel`, so a Sports venue reads "Book a court" and a
 * restaurant reads "Reserve", in the tenant's own language. This module owns
 * WHERE the button goes; the words layer owns WHAT it says.
 */

import { HEADER_VERBS, type HeaderVerb } from "./presets";
import type { WordLocale } from "./rows";

/**
 * Where each verb sends a visitor.
 *
 * `custom` is null: its destination is the operator's own href, validated
 * separately, and a null here is what tells the caller to ask for one.
 */
const VERB_DESTINATION: Readonly<Record<HeaderVerb, string | null>> = {
  reserve: "/book",
  book: "/book",
  // No public /menu or /tickets route exists yet. The chat is the true
  // destination until they do, and this is the one place that changes.
  order: "?inquiry=open",
  tickets: "?inquiry=open",
  ask: "?inquiry=open",
  custom: null,
};

/** Copy for the picker itself. Not a customer-facing string. */
const VERB_LABEL: Readonly<Record<HeaderVerb, { en: string; es: string }>> = {
  reserve: { en: "Reserve a time", es: "Reservar un horario" },
  book: { en: "Book an appointment", es: "Agendar una cita" },
  order: { en: "Order", es: "Pedir" },
  tickets: { en: "Tickets", es: "Entradas" },
  ask: { en: "Ask us a question", es: "Hacernos una pregunta" },
  custom: { en: "A link I choose", es: "Un enlace que yo elijo" },
};

/** What the operator is told the button will do. */
const VERB_HINT: Readonly<Record<HeaderVerb, { en: string; es: string }>> = {
  reserve: { en: "Opens your booking page", es: "Abre tu página de reservas" },
  book: { en: "Opens your booking page", es: "Abre tu página de reservas" },
  order: { en: "Opens the chat, ready to take an order", es: "Abre el chat, listo para tomar un pedido" },
  tickets: { en: "Opens the chat, ready to talk tickets", es: "Abre el chat, listo para hablar de entradas" },
  ask: { en: "Opens the chat", es: "Abre el chat" },
  custom: { en: "You provide the address", es: "Tú das la dirección" },
};

export type HeaderVerbOption = {
  readonly value: HeaderVerb;
  readonly label: string;
  readonly hint: string;
};

/** True when this verb needs the operator to supply an address. */
export function verbNeedsCustomHref(verb: HeaderVerb): boolean {
  return VERB_DESTINATION[verb] === null;
}

/**
 * The destination for a verb, or the operator's href for `custom`.
 *
 * Returns null only when `custom` was chosen and no usable href was given,
 * which the caller renders as "no button" rather than as a button to nowhere.
 * That is the whole point: there is no path through this function that yields
 * a live button pointing at a route we know does not exist.
 */
export function headerVerbHref(
  verb: HeaderVerb,
  customHref?: string | null,
): string | null {
  const fixed = VERB_DESTINATION[verb];
  if (fixed !== null) return fixed;
  const text = typeof customHref === "string" ? customHref.trim() : "";
  return text.length > 0 ? text : null;
}

/**
 * Options plus the normalised value, returned TOGETHER.
 *
 * Same shape and same reason as `presetPickerModel`: a `<select>` whose value
 * matches none of its options silently displays the first one and saves it on
 * the next change. Returning both means a caller cannot take the options and
 * forget to normalise the value, and the invariant is assertable without a DOM.
 *
 * An unrecognised stored verb resolves to `ask`, not to the first option. Ask
 * is the safe default because the chat always works: a workspace whose stored
 * verb we cannot read gets a button that opens a conversation, never one that
 * silently becomes "Reserve" and points at a booking page they do not run.
 */
export function headerVerbPickerModel(
  rawStoredVerb: unknown,
  locale: WordLocale,
): { options: HeaderVerbOption[]; selected: HeaderVerb } {
  const raw = typeof rawStoredVerb === "string" ? rawStoredVerb.trim().toLowerCase() : "";
  const selected: HeaderVerb = (HEADER_VERBS as readonly string[]).includes(raw)
    ? (raw as HeaderVerb)
    : "ask";

  const options = HEADER_VERBS.map((verb) => ({
    value: verb,
    label: VERB_LABEL[verb][locale],
    hint: VERB_HINT[verb][locale],
  }));

  return { options, selected };
}
