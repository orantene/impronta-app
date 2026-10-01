/**
 * Shared, design-agnostic tables. The per-design section map (mockup selectors, product
 * resolvers, expected sub-elements, style checks, device controls) lives in
 * `web/design-references/<slug>/parity-map.json`, loaded by `loadDesign`. The structural
 * `fn:` resolvers it names (header, footer, faq, socket, ...) live in analyze.mjs.
 *
 * `expects` are shared by both sides (the mockup is checked with the same rules as a
 * self-test, so a rule that fails on the mockup is a bad rule, not a product bug).
 * Kinds: sel (>= min visible matches), text (regex on visible text, `re` is a key of
 * LOCALE_TEXT or a raw pattern), countText, plus the specials eyebrow and ctaPair.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REFS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "design-references");

export const LOCALE_TEXT = {
  nextFree: "(hoy|mañana|today|tomorrow|pr[oó]xim|next|libre|available|disponible)",
  proof: "(años|years|reseñas|reviews)",
  menuIntro: "(MXN|USD|precios|prices|pesos)",
  price: "(\\$|MXN|USD|desde|from|cotizar|quote)",
  where: "(dónde|donde|where|ubicaci|location|visita|visit)",
  contact: "(contacto|contact|instagram|escrib|message)",
  policy: "(pol[ií]ticas|privacidad|t[eé]rminos|cookies|policies|privacy|terms)",
  navCta: "(men[uú]|servicios|reserv|book|citas|services)",
  inquiryCta: "(consult|contrat|solicit|inquir|reserv|book|cotiz)",
  langSwitch: "(\\bES\\b[\\s\\S]*\\bEN\\b|\\bEN\\b[\\s\\S]*\\bES\\b)",
  measures: "(estatura|height|cm|calzado|shoe|saco|medidas|measure)",
};

export function listDesigns() {
  return readdirSync(REFS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(REFS, d.name, "parity-map.json")))
    .map((d) => d.name);
}

/** Load and validate `design-references/<slug>/parity-map.json`. */
export function loadDesign(slug) {
  const file = join(REFS, slug, "parity-map.json");
  if (!existsSync(file)) throw new Error(`no parity map for design "${slug}" (${file}). Known: ${listDesigns().join(", ")}`);
  const m = JSON.parse(readFileSync(file, "utf8"));
  const keys = new Set();
  for (const s of m.sections) {
    if (keys.has(s.key)) throw new Error(`${slug}: duplicate section key ${s.key}`);
    keys.add(s.key);
    if (!Array.isArray(s.mockup) || !s.mockup.length) throw new Error(`${slug}/${s.key}: mockup selectors required`);
    s.product = s.product || [];
    s.expects = s.expects || [];
  }
  for (const k of m.order) if (!keys.has(k)) throw new Error(`${slug}: order names unknown section ${k}`);
  m.stateEvals = m.stateEvals || {};
  return m;
}

/** Interaction states, driven in run.mjs (a design lists the ones it supports in `states`). */
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
