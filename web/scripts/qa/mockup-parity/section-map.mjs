/**
 * Shared, design-agnostic constants for mockup parity. The per-design section maps
 * live next to each design reference: web/design-references/<slug>/parity-map.json
 * (keyed by the mockup data-w unit, matched to the product by data-parity-key).
 *
 * A map section: { key, label, unit, parityKey, mockup[], fallback[], optional, expects[] }.
 *  - unit: the mockup data-w type (text before the first " ·"), resolved as [data-w^="unit ·"]
 *  - parityKey: the product slotKey; the product element is [data-parity-key="<parityKey>"]
 *  - mockup[]: extra mockup selectors, tried after the data-w unit
 *  - fallback[]: product selectors used ONLY when the page carries no data-parity-key at all
 * expects (shared by both sides) kinds: sel (>= min visible matches), text (regex on visible
 * text, re is a key of LOCALE_TEXT or a raw pattern), countText, plus eyebrow and ctaPair.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DESIGN_REFERENCES = join(HERE, "..", "..", "..", "design-references");

/** Load a design map: { design, referenceDemo, mockup, order, sections }. */
export function loadDesignMap(design) {
  const p = join(DESIGN_REFERENCES, design, "parity-map.json");
  if (!existsSync(p)) throw new Error("no parity map for design \"" + design + "\" (expected " + p + ")");
  const map = JSON.parse(readFileSync(p, "utf8"));
  if (map.design !== design) throw new Error(p + ": design field is \"" + map.design + "\"");
  return map;
}

export const LOCALE_TEXT = {
  nextFree: "(hoy|mañana|today|tomorrow|pr[oó]xim|next|libre|available|disponible)",
  proof: "(años|years|reseñas|reviews)",
  menuIntro: "(MXN|USD|precios|prices|pesos)",
  price: "(\\$|MXN|USD|desde|from|cotizar|quote)",
  where: "(dónde|donde|where|ubicaci|location|visita|visit)",
  contact: "(contacto|contact|instagram|escrib|message)",
  policy: "(pol[ií]ticas|privacidad|t[eé]rminos|cookies|policies|privacy|terms)",
  consult: "(consult|escrib|reserv|book|inquir|cotiz)",
  navCta: "(men[uú]|servicios|reserv|book|citas|services)",
  langSwitch: "(\\bES\\b[\\s\\S]*\\bEN\\b|\\bEN\\b[\\s\\S]*\\bES\\b)",
};

/** Interaction states, driven in run.mjs. */
export const STATE_KEYS = ["chat", "dock", "booking"];

/** UI strings that must never appear on a Spanish site. Whole words, case sensitive. */
export const ES_DENYLIST = [
  "Book now", "Book", "Services", "Menu", "Reviews", "About me", "Contact us", "Location",
  "Send", "Next", "Back", "Close", "Open chat", "Chat with", "Ask", "Next available", "Today at",
  "Show more", "See all", "Read more", "Get in touch", "Prices", "Learn more", "Sign in",
  "Directions", "Opening hours", "Continue", "Add to booking", "Your booking",
];

/** Unaccented spellings of place names that must keep their accent. */
export const ACCENT_DENYLIST = ["Merida", "Cancun", "Mexico", "Queretaro", "Yucatan", "Michoacan", "San Luis Potosi", "Nuevo Leon"];

/** Never click anything whose accessible name matches this (read-only guarantee). */
export const NEVER_CLICK = "(enviar|send|pagar|\\bpay\\b|publicar|publish|confirm|submit|place order|checkout)";
