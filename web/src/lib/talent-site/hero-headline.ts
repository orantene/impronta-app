/**
 * The hero headline (Maison v2 release 2.7, HE-1): a short value proposition
 * with ONE italic accent word, "Manos que <i>hablan</i> por ti.".
 *
 * Source order, all read at the moment the site needs it (never frozen text
 * the talent cannot reach):
 *   1. the talent's own headline, in the visitor's language when she wrote both
 *      (profile field `identity.headline`, with `identity.headline_i18n`);
 *   2. a line seeded from her service category (the trade), in both locales.
 *      Each trade has a few variants and one is picked per talent from a stable
 *      key (her profile code), so two nail artists do not share one line;
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

/**
 * Trade keyword -> seeded headline variants. First match wins; order is specific to general.
 * The FIRST variant of a trade is its classic line (the one with no key to pick by).
 */
const SEEDS: ReadonlyArray<{ match: RegExp; variants: ReadonlyArray<HeadlineSeed> }> = [
  {
    match: /nail|manicur|u[nñ]as/i,
    variants: [
      { en: "Hands that speak for you.", es: "Manos que hablan por ti." },
      { en: "Nails made to feel like you.", es: "Uñas hechas para sentirte tú." },
      { en: "Small details, finished by hand.", es: "Pequeños detalles, hechos a mano." },
      { en: "Your hands, cared for properly.", es: "Tus manos, cuidadas como merecen." },
    ],
  },
  {
    match: /lash|pesta[nñ]/i,
    variants: [
      { en: "Lashes that frame your look.", es: "Pestañas que enmarcan tu mirada." },
      { en: "A softer, brighter look every day.", es: "Una mirada más suave cada día." },
      { en: "Lashes placed one by one.", es: "Pestañas puestas una por una." },
    ],
  },
  {
    match: /brow|ceja/i,
    variants: [
      { en: "Brows that frame your face.", es: "Cejas que enmarcan tu rostro." },
      { en: "Shaped by hand, made for you.", es: "Diseñadas a mano, hechas para ti." },
      { en: "Brows that look like yours, only better.", es: "Cejas como las tuyas, pero mejor." },
    ],
  },
  {
    match: /make-?up|maquill/i,
    variants: [
      { en: "Makeup that makes you glow.", es: "Maquillaje que te hace brillar." },
      { en: "Your best face, ready for the day.", es: "Tu mejor versión, lista para el día." },
      { en: "Color chosen for your skin.", es: "Color elegido para tu piel." },
    ],
  },
  {
    match: /barber|hair|stylist|colorist|peluqu|estilist|cabell/i,
    variants: [
      { en: "Hair that tells your story.", es: "Cabello que cuenta tu historia." },
      { en: "A cut that moves the way you do.", es: "Un corte que se mueve como tú." },
      { en: "Sharp lines, easy to keep.", es: "Líneas precisas, fáciles de mantener." },
    ],
  },
  {
    match: /massage|\bspa\b|therap|wellness|masaj|bienestar/i,
    variants: [
      { en: "A quiet moment just for you.", es: "Un momento tranquilo solo para ti." },
      { en: "Let your body slow down.", es: "Deja que tu cuerpo baje el ritmo." },
      { en: "Care that you can feel.", es: "Un cuidado que se siente." },
    ],
  },
  {
    match: /chef|cook|cater|cocin/i,
    variants: [
      { en: "Flavours that stay with you.", es: "Sabores que se quedan contigo." },
      { en: "Dinner at your table, made for you.", es: "Una cena en tu mesa, hecha para ti." },
      { en: "Good food, plainly well made.", es: "Buena comida, bien hecha." },
    ],
  },
  {
    match: /photo|foto/i,
    variants: [
      { en: "Pictures that tell your story.", es: "Imágenes que cuentan tu historia." },
      { en: "Moments kept as they felt.", es: "Momentos guardados tal como se sintieron." },
      { en: "Light, people, and the in between.", es: "Luz, personas y lo que hay entre medio." },
    ],
  },
  {
    match: /\bdj\b|music|band|singer|m[uú]sic|cantante/i,
    variants: [
      { en: "Music that moves your night.", es: "Música que mueve tu noche." },
      { en: "A room that never stops dancing.", es: "Una pista que no deja de bailar." },
      { en: "Sound made for your event.", es: "Sonido hecho para tu evento." },
    ],
  },
  {
    match: /train|coach|fitness|entrena/i,
    variants: [
      { en: "Train with purpose, feel it.", es: "Entrena con propósito, siéntelo." },
      { en: "Strong at your own pace.", es: "Fuerte a tu propio ritmo." },
      { en: "A plan that fits your week.", es: "Un plan que cabe en tu semana." },
    ],
  },
  {
    match: /dance|dancer|baila/i,
    variants: [
      { en: "Moves that feel like you.", es: "Pasos que se sienten como tú." },
      { en: "Learn it, then make it yours.", es: "Aprende y hazlo tuyo." },
      { en: "Rhythm for any floor.", es: "Ritmo para cualquier pista." },
    ],
  },
];

/** A small stable string hash (FNV-1a), for picking a variant per talent. */
function stableIndex(key: string, size: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % size;
}

/**
 * The seeded headline for a trade label ("Nail Artist"), or null when the trade has none.
 * `seedKey` (her profile code) picks one variant deterministically; without it the classic line.
 */
export function seedHeadlineFor(trade: string | null | undefined, seedKey?: string | null): HeadlineSeed | null {
  const label = trade?.trim();
  if (!label) return null;
  const entry = SEEDS.find((s) => s.match.test(label));
  if (!entry) return null;
  const key = seedKey?.trim();
  return entry.variants[key ? stableIndex(key, entry.variants.length) : 0]!;
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
  /** The headline she wrote for the visitor's language (already resolved), as she wrote it. */
  headline?: string | null;
  /** Primary trade label in English ("Nail Artist"), the seed key. */
  tradeEn?: string | null;
  displayName: string;
  /** Stable per-talent key (her profile code) that picks a seed variant. */
  seedKey?: string | null;
}

/**
 * The headline a site shows, with accent markup, in `locale`. `source` tells the
 * caller which case won (a seeded line needs a Spanish form, her own does not).
 */
export function resolveHeadline(input: HeadlineInput, locale: "en" | "es" = "en"): { text: string; source: "own" | "seed" | "name" } {
  const own = input.headline?.trim();
  if (own) return { text: accentHeadline(own), source: "own" };
  const seed = seedHeadlineFor(input.tradeEn, input.seedKey);
  if (seed) return { text: accentHeadline(seed[locale]), source: "seed" };
  const name = input.displayName.trim();
  return { text: name ? `{i}${name}{/i}` : "", source: "name" };
}
