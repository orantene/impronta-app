/**
 * L13 (Messages v5, guest dock) · the label of the dock's Items tab, per
 * business. Owner ruling v3 (3): "Services" is not the universal name; the
 * section is Items, labelled per business. An operator's own word in the
 * words table wins; otherwise the label is derived from what the preset sells.
 */

import type { WordsLookup } from "./resolve";
import type { WordLocale } from "./rows";

const DERIVED: Readonly<Record<"people" | "menu" | "events" | "appointments" | "items", Readonly<Record<WordLocale, string>>>> = {
  people: { en: "Talent & services", es: "Talento y servicios" },
  menu: { en: "Your order", es: "Tu pedido" },
  events: { en: "Tickets & tables", es: "Entradas y mesas" },
  appointments: { en: "Services", es: "Servicios" },
  items: { en: "Items", es: "Selección" },
};

export function chatItemsLabel(words: Pick<WordsLookup, "locale" | "preset" | "word" | "sourceOf">): string {
  const key = "customers.chat_items";
  if (words.sourceOf(key) !== "default") return words.word(key);
  const p = words.preset;
  // Order matters: a salon has a service menu AND appointments (it sells
  // appointments); a restaurant has a menu AND reservations (it sells the
  // order); a theatre has concessions AND events (it sells tickets).
  const pick = p.representsPeople
    ? "people"
    : p.features.appointments
      ? "appointments"
      : p.features.events && !p.features.reservations
        ? "events"
        : p.features.menu
          ? "menu"
          : p.features.events
            ? "events"
            : "items";
  return DERIVED[pick][words.locale];
}
