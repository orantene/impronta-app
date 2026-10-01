/**
 * The hero headline (Maison v2 release 2.7, HE-1): a short value proposition
 * with ONE italic accent word, "Manos que <i>hablan</i> por ti.".
 *
 * Source order, all read at the moment the site needs it (never frozen text
 * the talent cannot reach):
 *   1. the talent's own headline (profile field `identity.headline`);
 *   2. a line seeded from her service category (the trade), in both locales;
 *   3. her name, in italics, so a page never shows an empty hero.
 *
 * A talent who wrote `{i}...{/i}` herself keeps her own accent; plain text gets
 * the middle word emphasised. Pure; both locales come from one table so the
 * English seed and its Spanish render-time form cannot drift.
 */

export interface HeadlineSeed {
  en: string;
  es: string;
}

/** Trade keyword -> seeded headline. First match wins; order is specific to general. */
const SEEDS: ReadonlyArray<{ match: RegExp; seed: HeadlineSeed }> = [
  { match: /nail|manicur|u[nñ]as/i, seed: { en: "Hands that speak for you.", es: "Manos que hablan por ti." } },
  { match: /lash|pesta[nñ]/i, seed: { en: "Lashes that frame your look.", es: "Pestañas que enmarcan tu mirada." } },
  { match: /brow|ceja/i, seed: { en: "Brows that frame your face.", es: "Cejas que enmarcan tu rostro." } },
  { match: /make-?up|maquill/i, seed: { en: "Makeup that makes you glow.", es: "Maquillaje que te hace brillar." } },
  { match: /barber|hair|stylist|colorist|peluqu|estilist|cabell/i, seed: { en: "Hair that tells your story.", es: "Cabello que cuenta tu historia." } },
  { match: /massage|\bspa\b|therap|wellness|masaj|bienestar/i, seed: { en: "A quiet moment just for you.", es: "Un momento tranquilo solo para ti." } },
  { match: /chef|cook|cater|cocin/i, seed: { en: "Flavours that stay with you.", es: "Sabores que se quedan contigo." } },
  { match: /photo|foto/i, seed: { en: "Pictures that tell your story.", es: "Imágenes que cuentan tu historia." } },
  { match: /\bdj\b|music|band|singer|m[uú]sic|cantante/i, seed: { en: "Music that moves your night.", es: "Música que mueve tu noche." } },
  { match: /train|coach|fitness|entrena/i, seed: { en: "Train with purpose, feel it.", es: "Entrena con propósito, siéntelo." } },
  { match: /dance|dancer|baila/i, seed: { en: "Moves that feel like you.", es: "Pasos que se sienten como tú." } },
];

/** The seeded headline for a trade label ("Nail Artist"), or null when the trade has none. */
export function seedHeadlineFor(trade: string | null | undefined): HeadlineSeed | null {
  const label = trade?.trim();
  if (!label) return null;
  return SEEDS.find((s) => s.match.test(label))?.seed ?? null;
}

const HAS_ACCENT = /\{i\}[\s\S]*\{\/i\}/;

/**
 * Emphasise the middle word of a plain headline: "Manos que hablan por ti." ->
 * "Manos que {i}hablan{/i} por ti.". Text that already carries `{i}` is left as
 * written; one or two words take the last word; trailing punctuation stays
 * outside the accent.
 */
export function accentHeadline(text: string): string {
  const clean = text.trim();
  if (!clean || HAS_ACCENT.test(clean)) return clean;
  const words = clean.split(/\s+/);
  if (words.length < 2) return clean;
  const at = words.length >= 3 ? Math.floor(words.length / 2) : words.length - 1;
  const m = /^(.*?)([.,;:!?¡¿…]*)$/.exec(words[at]!);
  const core = m?.[1] ?? words[at]!;
  const tail = m?.[2] ?? "";
  if (!core) return clean;
  words[at] = `{i}${core}{/i}${tail}`;
  return words.join(" ");
}

/** `{i}..{/i}` markup to plain text (for alt text, titles, comparisons). */
export function plainHeadline(text: string): string {
  return text.replace(/\{\/?i\}/g, "");
}

export interface HeadlineInput {
  /** `identity.headline`, as the talent wrote it. */
  headline?: string | null;
  /** Primary trade label in English ("Nail Artist"), the seed key. */
  tradeEn?: string | null;
  displayName: string;
}

/**
 * The headline a site shows, with accent markup, in `locale`. `seeded` tells
 * the caller which case won (a seeded line needs a Spanish form, her own does not).
 */
export function resolveHeadline(input: HeadlineInput, locale: "en" | "es" = "en"): { text: string; source: "own" | "seed" | "name" } {
  const own = input.headline?.trim();
  if (own) return { text: accentHeadline(own), source: "own" };
  const seed = seedHeadlineFor(input.tradeEn);
  if (seed) return { text: accentHeadline(seed[locale]), source: "seed" };
  const name = input.displayName.trim();
  return { text: name ? `{i}${name}{/i}` : "", source: "name" };
}
